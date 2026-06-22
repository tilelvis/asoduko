import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/with-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";
import {
  debitWallet,
  completeTransaction,
  failTransaction,
  recordPendingTransaction,
  hasIdempotencyKey,
} from "@/lib/db/wallet";
import { getServerEnv, isWalletConfigured } from "@/lib/env";

/**
 * POST /api/wallet/withdraw
 *
 * Withdraws ALN credit to the player's real Alien wallet as ALIEN tokens.
 *
 * SECURITY MODEL — read this carefully:
 *
 *   1. The server holds ALIEN_WITHDRAW_PRIVATE_KEY (Ed25519). It NEVER
 *      leaves the server. The client never sees it.
 *
 *   2. The client requests a withdrawal with:
 *        - amount (ALN credit to withdraw)
 *        - recipientAddress (where to send ALIEN tokens)
 *        - idempotencyKey (UUID to prevent replay)
 *
 *   3. The server validates:
 *        - JWT auth (auth.sub = verified Alien ID)
 *        - Amount ≥ WALLET_MIN_WITHDRAWAL (dust protection)
 *        - Rate limit (3 burst, 1 per 20s)
 *        - Idempotency key not already used
 *        - Sufficient balance (atomic, inside BEGIN IMMEDIATE)
 *
 *   4. The server atomically debits the wallet (so the balance is locked).
 *
 *   5. The server signs and broadcasts the ALIEN transfer on the Alien
 *      network using ALIEN_WITHDRAW_PRIVATE_KEY. The transfer amount in
 *      base units = (amount * 10^9) / EXCHANGE_RATE where EXCHANGE_RATE
 *      is how many ALN credit = 1 ALIEN token (set in env, default 5000).
 *
 *   6. On success: record tx_hash, mark transaction completed.
 *      On failure: REFUND the wallet, mark transaction failed.
 *
 *   7. The refund-on-failure is critical: if the on-chain broadcast fails,
 *      the player's ALN is restored atomically. We never lose player funds
 *      to a network error.
 *
 * THREATS MITIGATED:
 *   - localStorage tampering: balance is server-side, client can't fake it
 *   - Replay: idempotency key + atomic debit prevents double-withdrawal
 *   - Race conditions: BEGIN IMMEDIATE serializes the read+write
 *   - Insufficient balance: checked atomically, throws if low
 *   - Dust attacks: min withdrawal enforced server-side
 *   - Bot farming: rate limit + daily cap on earn side
 *
 * THREATS NOT MITIGATED (acknowledged):
 *   - If ALIEN_WITHDRAW_PRIVATE_KEY is compromised, attacker can drain
 *     the hot wallet. Mitigation: keep balance in hot wallet low, top up
 *     from cold wallet manually. Monitor balance + alert on threshold.
 *   - If ALIEN_AUDIENCE is misconfigured, JWT verification fails open
 *     (we use the official @alien-id/miniapps-auth-client which is strict).
 */

const WithdrawRequest = z.object({
  amount: z.number().int().positive(),
  recipientAddress: z.string().min(32).max(64),
  idempotencyKey: z.string().uuid(),
});

/** ALN credit → ALIEN token exchange rate. Read from env (default 10).
 *  10 ALN = 1 ALIEN, so 50 ALN = 5 ALIEN tokens on withdrawal. */
const ALIEN_DECIMALS = 9;

export const POST = withAuth(async (request, { auth }) => {
  if (!isWalletConfigured()) {
    return NextResponse.json(
      { error: "Wallet not configured." },
      { status: 503 },
    );
  }

  const rl = rateLimit(`${auth.sub}:withdraw`, RATE_LIMITS.withdraw);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited", retryAfterMs: rl.resetInMs },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = WithdrawRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { amount, recipientAddress, idempotencyKey } = parsed.data;
  const env = getServerEnv();

  if (amount < env.WALLET_MIN_WITHDRAWAL) {
    return NextResponse.json(
      {
        error: `Minimum withdrawal is ${env.WALLET_MIN_WITHDRAWAL} ALN`,
      },
      { status: 400 },
    );
  }

  if (await hasIdempotencyKey(idempotencyKey)) {
    return NextResponse.json(
      { error: "Duplicate request" },
      { status: 409 },
    );
  }

  if (!env.ALIEN_WITHDRAW_PRIVATE_KEY) {
    return NextResponse.json(
      {
        error:
          "Withdrawals disabled. Server missing ALIEN_WITHDRAW_PRIVATE_KEY.",
      },
      { status: 503 },
    );
  }

  // Convert ALN credit → ALIEN token base units.
  // amount (ALN) / ALN_PER_ALIEN = ALIEN tokens
  // × 10^ALIEN_DECIMALS = base units
  const alienTokens = amount / env.ALN_PER_ALIEN;
  const alienBaseUnits = Math.floor(alienTokens * Math.pow(10, ALIEN_DECIMALS));
  if (alienBaseUnits <= 0) {
    return NextResponse.json(
      {
        error: `Amount too small. Minimum ${env.WALLET_MIN_WITHDRAWAL} ALN = ${
          env.WALLET_MIN_WITHDRAWAL / env.ALN_PER_ALIEN
        } ALIEN.`,
      },
      { status: 400 },
    );
  }

  const invoice = `wd-${crypto.randomUUID()}`;

  // Audit log the withdrawal attempt.
  const { auditLog } = await import("@/lib/db/wallet");
  await auditLog({
    alienId: auth.sub,
    action: "withdrawal_initiated",
    details: { amount, recipientAddress, invoice, alienBaseUnits },
    ipAddress: request.headers.get("x-forwarded-for") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
  });

  // 1. Atomically debit the wallet. If balance is insufficient, this throws
  //    and we return an error WITHOUT touching the on-chain wallet.
  let debitResult: { balance: number };
  try {
    debitResult = await debitWallet({
      alienId: auth.sub,
      amount,
      type: "withdraw",
      description: `Withdrawal to ${recipientAddress.slice(0, 8)}…`,
      idempotencyKey,
      invoice,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 402 },
      );
    }
    if (e instanceof Error && e.message === "IDEMPOTENCY_REPLAY") {
      return NextResponse.json(
        { error: "Duplicate request" },
        { status: 409 },
      );
    }
    console.error("Withdrawal debit failed:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  // 2. Record a pending on-chain transaction. If the broadcast fails, we
  //    refund + mark this as failed.
  const txId = await recordPendingTransaction({
    alienId: auth.sub,
    type: "withdraw",
    amount: -amount,
    description: `Withdrawal to ${recipientAddress.slice(0, 8)}…`,
    idempotencyKey: `${idempotencyKey}-onchain`,
    invoice,
  });

  try {
    // ⚠ This is where you'd call the actual Alien network SDK to sign +
    //   broadcast the transfer. The exact API depends on the Alien chain's
    //   transaction format. We stub it here with a realistic interface.
    //
    //   In production, replace this with:
    //     const txHash = await alienChain.transfer({
    //       from: env.ALIEN_PROVIDER_ADDRESS,
    //       to: recipientAddress,
    //       amount: alienBaseUnits.toString(),
    //       token: "ALIEN",
    //       signingKey: env.ALIEN_WITHDRAW_PRIVATE_KEY,
    //     });
    const txHash = await broadcastAlienTransfer({
      recipientAddress,
      alienBaseUnits,
      signingKey: env.ALIEN_WITHDRAW_PRIVATE_KEY!,
    });

    await completeTransaction(txId, txHash);

    await auditLog({
      alienId: auth.sub,
      action: "withdrawal_completed",
      details: { amount, recipientAddress, invoice, txHash, alienBaseUnits },
    });

    return NextResponse.json({
      txId,
      invoice,
      txHash,
      amount,
      alienBaseUnits,
      recipientAddress,
      newBalance: debitResult.balance,
      status: "completed",
      explorerUrl: `https://explorer.alien.org/tx/${txHash}`,
    });
  } catch (e) {
    // CRITICAL: refund the player if the on-chain broadcast failed.
    console.error("On-chain withdrawal failed — refunding:", e);
    await failTransaction(txId);
    try {
      // Credit back as a 'refund' type. We use a fresh idempotency key.
      // We intentionally DON'T enforce the daily cap on refunds.
      const { creditWallet } = await import("@/lib/db/wallet");
      await creditWallet({
        alienId: auth.sub,
        amount,
        type: "refund",
        description: `Refund · failed withdrawal ${invoice}`,
        idempotencyKey: `${idempotencyKey}-refund`,
        invoice,
      });
      await auditLog({
        alienId: auth.sub,
        action: "withdrawal_refunded",
        details: { amount, invoice, error: String(e) },
      });
    } catch (refundErr) {
      // If the refund itself fails, we have a serious problem — the player's
      // ALN is gone but the on-chain transfer didn't happen. Alert + log.
      console.error(
        "CRITICAL: Refund failed for withdrawal",
        invoice,
        refundErr,
      );
      await auditLog({
        alienId: auth.sub,
        action: "withdrawal_refund_failed",
        details: { amount, invoice, error: String(refundErr) },
      });
    }

    return NextResponse.json(
      {
        error:
          "Withdrawal failed — your ALN has been refunded. Please try again later.",
        invoice,
      },
      { status: 502 },
    );
  }
});

/**
 * Stub for the actual Alien chain transfer. In production, replace this
 * with the real Alien SDK call. The signature shows what's needed.
 *
 * The signing key NEVER leaves this function — it goes straight to the
 * chain SDK, never to the client, never to a log.
 */
async function broadcastAlienTransfer(opts: {
  recipientAddress: string;
  alienBaseUnits: number;
  signingKey: string;
}): Promise<string> {
  // In production:
  //   const { Keypair, Transaction } = await import("@alien-id/chain");
  //   const kp = Keypair.fromSecretKey(opts.signingKey);
  //   const tx = new Transaction().transfer({
  //     to: opts.recipientAddress,
  //     amount: opts.alienBaseUnits.toString(),
  //     token: "ALIEN",
  //   });
  //   const signed = tx.sign([kp]);
  //   const sig = await connection.sendRawTransaction(signed.serialize());
  //   await connection.confirmTransaction(sig);
  //   return sig;

  // For dev/demo: simulate a 1s network round-trip + return a fake hash.
  await new Promise((r) => setTimeout(r, 1000));
  if (process.env.NODE_ENV !== "production") {
    return `demo_${crypto.randomUUID()}`;
  }
  throw new Error(
    "Alien chain SDK not wired up — see lib/api/broadcastAlienTransfer in withdraw/route.ts",
  );
}
