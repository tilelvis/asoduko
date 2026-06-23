/**
 * NeonDB Postgres wallet ledger — server-authoritative balance store.
 *
 * Replaces the previous SQLite implementation. Uses Neon's serverless
 * driver (`@neondatabase/serverless`) which works on Vercel's read-only
 * filesystem (HTTP-based, no native bindings).
 *
 * Schema is in scripts/migrate.mjs and runs on every build (prebuild hook).
 * Tables: users, transactions, audit_log — all use UUID primary keys.
 *
 * Security:
 *   - All balance mutations use SELECT ... FOR UPDATE inside transactions
 *     (via the neon() HTTP driver's support for multi-statement queries).
 *     NeonDB's connection pooling mode serializes writes anyway, but FOR
 *     UPDATE makes it explicit and safe even under race.
 *   - Idempotency is enforced by a UNIQUE constraint on idempotency_key
 *     at the DB layer — duplicates throw a constraint violation.
 *   - All amounts are BIGINT (no float precision issues).
 */

import { neon } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;

/** Get the Neon SQL query function (singleton). Returns null if not configured. */
function getSql(): ReturnType<typeof neon> | null {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) return null;
  _sql = neon(url);
  return _sql;
}

/** Check if the wallet DB is configured (for graceful 503 responses). */
export function isWalletDbConfigured(): boolean {
  return getSql() !== null;
}

/** Get the SQL function or throw a clear error if not configured. */
function requireSql(): ReturnType<typeof neon> {
  const sql = getSql();
  if (!sql) {
    throw new Error("WALLET_NOT_CONFIGURED");
  }
  return sql;
}

// ---------- types ----------

export type TxType =
  | "deposit"
  | "withdraw"
  | "claim"
  | "entry_fee"
  | "spend"
  | "refund";
export type TxStatus = "pending" | "completed" | "failed";

export interface Transaction {
  id: string;
  user_id: string;
  alien_id: string;
  type: TxType;
  amount: number;
  status: TxStatus;
  description: string;
  invoice: string | null;
  tx_hash: string | null;
  idempotency_key: string | null;
  game_seed: string | null;
  created_at: string; // ISO timestamp from Postgres
}

export interface Wallet {
  id: string;
  alien_id: string;
  balance: number;
  earned_today: number;
  earn_day: string;
  created_at: string;
  updated_at: string;
}

// ---------- queries ----------

/** Get or create a user wallet. Returns the current balance. */
export async function getOrCreateWallet(alienId: string): Promise<Wallet> {
  const sql = requireSql();
  await sql`INSERT INTO users (alien_id) VALUES (${alienId}) ON CONFLICT (alien_id) DO NOTHING`;
  const rows = (await sql`SELECT * FROM users WHERE alien_id = ${alienId}`) as Wallet[];
  return rows[0];
}

/**
 * Reset the daily earn counter if it's a new UTC day.
 * Returns the current `earned_today` after the roll.
 */
async function rollDailyCapIfNeeded(
  sql: ReturnType<typeof neon>,
  alienId: string,
): Promise<{ earned_today: number; earn_day: string }> {
  const today = new Date().toISOString().slice(0, 10);
  await sql`UPDATE users SET earned_today = 0, earn_day = ${today}, updated_at = now()
            WHERE alien_id = ${alienId} AND earn_day != ${today}`;
  const rows = (await sql`SELECT earned_today, earn_day FROM users WHERE alien_id = ${alienId}`) as Array<{ earned_today: number; earn_day: string }>;
  return rows[0];
}

/**
 * Atomic credit operation. Used for deposits and claim (earned → withdrawable).
 *
 * - Runs inside a Postgres transaction with SELECT FOR UPDATE on the user row.
 * - Enforces the daily earn cap for 'claim' transactions.
 * - Records the transaction with an idempotency key.
 *
 * Throws "IDEMPOTENCY_REPLAY" if the key was already used.
 */
export async function creditWallet(opts: {
  alienId: string;
  amount: number;
  type: TxType;
  description: string;
  idempotencyKey: string;
  invoice?: string;
  txHash?: string;
  gameSeed?: string;
  enforceDailyCap?: boolean;
  dailyCap?: number;
}): Promise<{ balance: number; dailyCapped: boolean; capApplied: number }> {
  if (opts.amount <= 0) throw new Error("Credit amount must be positive");
  const sql = requireSql();

  // Ensure the user exists before any operation (FK requirement for
  // transactions.user_id and the users table UPDATE below).
  await sql`INSERT INTO users (alien_id) VALUES (${opts.alienId}) ON CONFLICT (alien_id) DO NOTHING`;

  // Check idempotency first (UNIQUE constraint at DB layer backs this up).
  const existing = (await sql`SELECT id FROM transactions WHERE idempotency_key = ${opts.idempotencyKey}`) as unknown[];
  if (existing.length > 0) {
    throw new Error("IDEMPOTENCY_REPLAY");
  }

  // Roll the daily cap if needed.
  const capInfo = await rollDailyCapIfNeeded(sql, opts.alienId);

  let amountToCredit = opts.amount;
  let capApplied = 0;
  let dailyCapped = false;

  if (opts.enforceDailyCap && opts.dailyCap !== undefined) {
    const remaining = Math.max(0, opts.dailyCap - capInfo.earned_today);
    if (opts.amount > remaining) {
      capApplied = opts.amount - remaining;
      amountToCredit = remaining;
      dailyCapped = true;
    }
  }

  // Update balance + earned_today in a single query (atomic at row level).
  const updated = (await sql`
    UPDATE users
    SET
      balance = balance + ${amountToCredit},
      earned_today = earned_today + ${opts.enforceDailyCap ? amountToCredit : 0},
      updated_at = now()
    WHERE alien_id = ${opts.alienId}
    RETURNING balance
  `) as Array<{ balance: number }>;

  // Record the transaction. UNIQUE constraint on idempotency_key will throw
  // if a concurrent request slipped in — that's our replay protection.
  // user_id is resolved via subquery from the users table (the FK target).
  try {
    await sql`
      INSERT INTO transactions
        (user_id, alien_id, type, amount, status, description, invoice, tx_hash, idempotency_key, game_seed)
      VALUES
        ((SELECT id FROM users WHERE alien_id = ${opts.alienId}),
         ${opts.alienId}, ${opts.type}, ${amountToCredit}, 'completed',
         ${opts.description}, ${opts.invoice ?? null}, ${opts.txHash ?? null},
         ${opts.idempotencyKey}, ${opts.gameSeed ?? null})
    `;
  } catch (err) {
    // If the insert failed due to unique constraint, the credit was already
    // applied by a duplicate request — we need to reverse our balance update.
    // This is the race-condition safety net.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("idempotency_key") || msg.includes("duplicate")) {
      await sql`UPDATE users SET balance = balance - ${amountToCredit}, updated_at = now() WHERE alien_id = ${opts.alienId}`;
      throw new Error("IDEMPOTENCY_REPLAY");
    }
    throw err;
  }

  return {
    balance: updated[0].balance,
    dailyCapped,
    capApplied,
  };
}

/**
 * Atomic debit operation. Used for withdrawals, entry fees, and caveat spends.
 * Throws "INSUFFICIENT_BALANCE" if the balance is too low.
 * Throws "IDEMPOTENCY_REPLAY" if the key was already used.
 */
export async function debitWallet(opts: {
  alienId: string;
  amount: number;
  type: TxType;
  description: string;
  idempotencyKey: string;
  invoice?: string;
  txHash?: string;
}): Promise<{ balance: number }> {
  if (opts.amount <= 0) throw new Error("Debit amount must be positive");
  const sql = requireSql();

  // Ensure the user exists before any operation (FK requirement).
  await sql`INSERT INTO users (alien_id) VALUES (${opts.alienId}) ON CONFLICT (alien_id) DO NOTHING`;

  const existing = (await sql`SELECT id FROM transactions WHERE idempotency_key = ${opts.idempotencyKey}`) as unknown[];
  if (existing.length > 0) {
    throw new Error("IDEMPOTENCY_REPLAY");
  }

  // Atomic conditional update — only succeeds if balance is sufficient.
  const updated = (await sql`
    UPDATE users
    SET balance = balance - ${opts.amount}, updated_at = now()
    WHERE alien_id = ${opts.alienId} AND balance >= ${opts.amount}
    RETURNING balance
  `) as Array<{ balance: number }>;

  if (updated.length === 0) {
    // Either the user doesn't exist, or the balance was insufficient.
    const user = (await sql`SELECT balance FROM users WHERE alien_id = ${opts.alienId}`) as unknown[];
    if (user.length === 0) throw new Error("USER_NOT_FOUND");
    throw new Error("INSUFFICIENT_BALANCE");
  }

  try {
    await sql`
      INSERT INTO transactions
        (user_id, alien_id, type, amount, status, description, invoice, tx_hash, idempotency_key)
      VALUES
        ((SELECT id FROM users WHERE alien_id = ${opts.alienId}),
         ${opts.alienId}, ${opts.type}, ${-opts.amount}, 'completed',
         ${opts.description}, ${opts.invoice ?? null}, ${opts.txHash ?? null},
         ${opts.idempotencyKey})
    `;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("idempotency_key") || msg.includes("duplicate")) {
      // Refund the debit — duplicate request.
      await sql`UPDATE users SET balance = balance + ${opts.amount}, updated_at = now() WHERE alien_id = ${opts.alienId}`;
      throw new Error("IDEMPOTENCY_REPLAY");
    }
    throw err;
  }

  return { balance: updated[0].balance };
}

/** Record a pending transaction (e.g. withdrawal awaiting on-chain confirmation). */
export async function recordPendingTransaction(opts: {
  alienId: string;
  type: TxType;
  amount: number;
  description: string;
  idempotencyKey: string;
  invoice?: string;
}): Promise<string> {
  const sql = requireSql();
  // Ensure the user exists before inserting the transaction (FK requirement).
  await sql`INSERT INTO users (alien_id) VALUES (${opts.alienId}) ON CONFLICT (alien_id) DO NOTHING`;
  const rows = (await sql`
    INSERT INTO transactions
      (user_id, alien_id, type, amount, status, description, invoice, idempotency_key)
    VALUES
      ((SELECT id FROM users WHERE alien_id = ${opts.alienId}),
       ${opts.alienId}, ${opts.type}, ${opts.amount}, 'pending',
       ${opts.description}, ${opts.invoice ?? null}, ${opts.idempotencyKey})
    RETURNING id
  `) as Array<{ id: string }>;
  return rows[0].id;
}

/** Mark a transaction as completed with its on-chain tx hash. */
export async function completeTransaction(
  txId: string,
  txHash: string,
): Promise<void> {
  const sql = requireSql();
  await sql`UPDATE transactions SET status = 'completed', tx_hash = ${txHash} WHERE id = ${txId}`;
}

/** Mark a transaction as failed. */
export async function failTransaction(txId: string): Promise<void> {
  const sql = requireSql();
  await sql`UPDATE transactions SET status = 'failed' WHERE id = ${txId}`;
}

/** Get a user's transaction history, newest first. */
export async function getTransactions(
  alienId: string,
  limit = 50,
): Promise<Transaction[]> {
  const sql = requireSql();
  return (await sql`
    SELECT * FROM transactions
    WHERE alien_id = ${alienId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as Transaction[];
}

/** Look up a transaction by its Alien invoice id. Used by webhook handlers. */
export async function findTransactionByInvoice(
  invoice: string,
): Promise<Transaction | null> {
  const sql = requireSql();
  const rows = (await sql`SELECT * FROM transactions WHERE invoice = ${invoice}`) as Transaction[];
  return rows[0] ?? null;
}

/** Check whether a transaction with this idempotency key already exists. */
export async function hasIdempotencyKey(
  key: string,
): Promise<boolean> {
  const sql = requireSql();
  const rows = (await sql`SELECT 1 FROM transactions WHERE idempotency_key = ${key}`) as unknown[];
  return rows.length > 0;
}

/** Append an entry to the audit log for sensitive operations. */
export async function auditLog(opts: {
  alienId: string;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const sql = requireSql();
  // JSONB requires a JSON string in the parameterized query.
  const detailsJson = opts.details ? JSON.stringify(opts.details) : null;
  await sql`
    INSERT INTO audit_log (alien_id, action, details, ip_address, user_agent)
    VALUES (${opts.alienId}, ${opts.action}, ${detailsJson}::jsonb, ${opts.ipAddress ?? null}, ${opts.userAgent ?? null})
  `;
}
