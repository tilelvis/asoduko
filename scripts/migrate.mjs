/**
 * NeonDB Postgres migration script.
 *
 * Runs on every `npm run build` (via the prebuild step in package.json) and
 * on every Vercel deployment (via the build command). Idempotent — uses
 * `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so it's
 * safe to run repeatedly.
 *
 * Connects to NeonDB via `@neondatabase/serverless` using `DATABASE_URL`
 * from the environment. In production this uses the pooled connection
 * string (`-pooler`); in dev you can use either.
 *
 * The schema uses:
 *   - UUID primary keys (gen_random_uuid()) — opaque, unguessable, no PII
 *   - BIGINT for balance — avoids float precision issues with large ALN
 *     amounts at the 10:1 ratio
 *   - TEXT for Alien IDs (the JWT `sub` claim, set by Alien SSO)
 *   - TIMESTAMPTZ for all timestamps (UTC, timezone-aware)
 *   - Unique indexes on idempotency_key + invoice to enforce replay protection
 *     at the DB layer (not just the app layer)
 */

import { neon } from "@neondatabase/serverless";

// Don't initialize the connection until we actually need it — this lets
// the build succeed even when DATABASE_URL isn't set or is a non-Postgres
// value (e.g. a SQLite path from another project's env).
let _sql = null;
function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) return null;
  _sql = neon(url);
  return _sql;
}

const MIGRATIONS = [
  // Enable the pgcrypto extension for gen_random_uuid()
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,

  // ---- users / wallets ----
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alien_id TEXT NOT NULL UNIQUE,
    balance BIGINT NOT NULL DEFAULT 0,
    earned_today BIGINT NOT NULL DEFAULT 0,
    earn_day TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // ---- transactions ----
  `CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alien_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('deposit','withdraw','claim','entry_fee','spend','refund')),
    amount BIGINT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','completed','failed')),
    description TEXT NOT NULL,
    invoice TEXT,
    tx_hash TEXT,
    idempotency_key TEXT,
    game_seed UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_idempotency_key UNIQUE (idempotency_key),
    CONSTRAINT uq_invoice UNIQUE (invoice)
  )`,

  // ---- indexes for fast lookups ----
  `CREATE INDEX IF NOT EXISTS idx_tx_alien_id ON transactions(alien_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_user_id ON transactions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_created_at ON transactions(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_type_status ON transactions(type, status)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_game_seed ON transactions(game_seed) WHERE game_seed IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_users_alien_id ON users(alien_id)`,

  // ---- updated_at trigger ----
  `CREATE OR REPLACE FUNCTION update_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = now();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql`,

  `DROP TRIGGER IF EXISTS trg_users_updated_at ON users`,
  `CREATE TRIGGER trg_users_updated_at
   BEFORE UPDATE ON users
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at()`,

  // ---- audit log (separate from transactions, for sensitive ops) ----
  `CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    alien_id TEXT,
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC)`,
];

async function main() {
  const sql = getSql();
  if (!sql) {
    console.log("⚠️  NeonDB DATABASE_URL not configured — skipping migration.");
    console.log("    Set DATABASE_URL to a postgres:// connection string.");
    console.log("    On Vercel, this runs automatically against your NeonDB.");
    return;
  }

  console.log("🔗 Connecting to NeonDB...");
  console.log(`📍 URL: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`);

  let applied = 0;
  let skipped = 0;

  for (const migration of MIGRATIONS) {
    try {
      await sql(migration);
      applied++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "already exists" errors are fine — idempotent migration.
      if (msg.includes("already exists")) {
        skipped++;
      } else {
        console.error("❌ Migration failed:", msg);
        console.error("   SQL:", migration.slice(0, 200));
        process.exit(1);
      }
    }
  }

  console.log(`✅ Migrations complete: ${applied} applied, ${skipped} already up-to-date.`);

  // Verify schema by counting rows in each table.
  try {
    const userCount = await sql`SELECT COUNT(*)::int AS count FROM users`;
    const txCount = await sql`SELECT COUNT(*)::int AS count FROM transactions`;
    const auditCount = await sql`SELECT COUNT(*)::int AS count FROM audit_log`;
    console.log(`📊 Schema verified:`);
    console.log(`   users: ${userCount[0].count} rows`);
    console.log(`   transactions: ${txCount[0].count} rows`);
    console.log(`   audit_log: ${auditCount[0].count} rows`);
  } catch (err) {
    console.error("⚠️  Schema verification failed:", err);
  }
}

main().catch((err) => {
  console.error("❌ Migration error:", err);
  process.exit(1);
});
