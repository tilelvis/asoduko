import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/with-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";
import {
  recordPendingTransaction,
  hasIdempotencyKey,
} from "@/lib/db/wallet";
import { getServerEnv, isWalletConfigured } from "@/lib/env";

/**
 * POST /api/wallet/deposit
 *
 * Initiates a deposit. The actual ALIEN payment is made client-side via
 * `payment.pay()` from the Alien SDK. This endpoint just registers a
 * pending transaction so the webhook (which fires after on-chain
 * settlement) knows how much to credit.
 *
 * Flow:
 *   1. Client calls this endpoint with the product id + idempotency key.
 *   2. Server records a 'pending' deposit transaction.
 *   3. Server returns the invoice id + recipient address + amount.
 *   4. Client calls `payment.pay({ recipient, amount, invoice, ... })`.
 *   5. Alien network settles the payment.
 *   6. Alien webhook fires at /api/webhooks/payment → server verifies
 *      Ed25519 signature + invoice match → credits the wallet.
 *
 * Security:
 *   - JWT auth required (auth.sub = user's Alien ID)
 *   - Idempotency key prevents duplicate deposit registrations
 *   - Amount + recipient are resolved SERVER-SIDE from the product catalog
 *     — the client never tells us how much to credit
 *   - Rate limited to 5/10s per user
 */

const DepositRequest = z.object({
  productId: z.string().min(1),
  idempotencyKey: z.string().uuid(),
});

// Server-side product catalog — the client can NEVER override these.
// (Mirrors lib/alien/aln-store.ts ALN_PRODUCTS so amounts match exactly.
//  ALN_PER_ALIEN = 10, ALIEN_DECIMALS = 9.)
const SERVER_PRODUCTS: Record<
  string,
  { aln: number; amount: string; token: "ALIEN"; network: "alien" }
> = {
  "alien-aln-50": { aln: 50, amount: "5000000000", token: "ALIEN", network: "alien" },     // 5 ALIEN
  "alien-aln-250": { aln: 250, amount: "25000000000", token: "ALIEN", network: "alien" },   // 25 ALIEN
  "alien-aln-1000": { aln: 1000, amount: "100000000000", token: "ALIEN", network: "alien" }, // 100 ALIEN
  "alien-aln-5000": { aln: 5000, amount: "500000000000", token: "ALIEN", network: "alien" }, // 500 ALIEN
};

export const POST = withAuth(async (request, { auth }) => {
  if (!isWalletConfigured()) {
    return NextResponse.json(
      { error: "Wallet not configured." },
      { status: 503 },
    );
  }

  const rl = rateLimit(`${auth.sub}:deposit`, RATE_LIMITS.deposit);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited", retryAfterMs: rl.resetInMs },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = DepositRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { productId, idempotencyKey } = parsed.data;
  const product = SERVER_PRODUCTS[productId];
  if (!product) {
    return NextResponse.json(
      { error: "Invalid product" },
      { status: 400 },
    );
  }

  // Replay protection — same idempotency key = same request.
  if (await hasIdempotencyKey(idempotencyKey)) {
    return NextResponse.json(
      { error: "Duplicate request" },
      { status: 409 },
    );
  }

  const env = getServerEnv();
  const recipient = env.NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS;
  if (!recipient) {
    return NextResponse.json(
      { error: "Recipient address not configured" },
      { status: 503 },
    );
  }

  // Generate invoice id (matches Alien's "inv-<uuid>" format).
  const invoice = `inv-${crypto.randomUUID()}`;

  // Record pending transaction — the webhook will mark it completed.
  const txId = await recordPendingTransaction({
    alienId: auth.sub,
    type: "deposit",
    amount: product.aln,
    description: `Deposit · ${productId} (${product.aln} ALN)`,
    idempotencyKey,
    invoice,
  });

  return NextResponse.json({
    txId,
    invoice,
    recipient,
    amount: product.amount,
    token: product.token,
    network: product.network,
    alnCredit: product.aln,
    // The client passes these to payment.pay() — the actual on-chain
    // transfer happens in the Alien app. Our server never touches the
    // private key for deposits; it only verifies the result.
  });
});
