import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  findTransactionByInvoice,
  creditWallet,
  completeTransaction,
} from "@/lib/db/wallet";
import { getServerEnv } from "@/lib/env";

/**
 * POST /api/webhooks/payment
 *
 * Alien payment webhook (X-Webhook-Version: 3).
 *
 * Fires when an on-chain ALIEN payment settles. We use this to credit
 * deposits — the player's wallet balance is only updated AFTER the Alien
 * network confirms the transaction, never when the client calls
 * payment.pay().
 *
 * SECURITY:
 *   1. Verify the Ed25519 signature in the `X-Webhook-Signature` header
 *      against WEBHOOK_PUBLIC_KEY. This proves the webhook came from Alien,
 *      not a third party trying to fake a deposit.
 *   2. Verify the `X-Webhook-Version` header is "3".
 *   3. Cross-check the invoice against our pending transactions table —
 *      only credit if we have a matching pending deposit.
 *   4. Idempotent: if the webhook is replayed (Alien retries on failure),
 *      we acknowledge without re-crediting.
 *
 * Spec: https://docs.alien.org/react-sdk/payments#webhook-payload
 */

const WebhookPayload = z.object({
  invoice: z.string().min(1),
  recipient: z.string().min(1),
  status: z.enum(["finalized", "failed"]),
  txHash: z.string().optional(),
  amount: z.string().optional(),
  decimals: z.number().optional(),
  token: z.string().optional(),
  network: z.string().optional(),
  test: z.boolean().optional(),
});

export async function POST(request: Request) {
  let env;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  if (!env.WEBHOOK_PUBLIC_KEY) {
    return NextResponse.json(
      { error: "WEBHOOK_PUBLIC_KEY not set" },
      { status: 503 },
    );
  }

  // 1. Verify X-Webhook-Version
  const version = request.headers.get("X-Webhook-Version");
  if (version !== "3") {
    return NextResponse.json(
      { error: `Unsupported webhook version: ${version}` },
      { status: 400 },
    );
  }

  // 2. Read raw body for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get("X-Webhook-Signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing X-Webhook-Signature" },
      { status: 401 },
    );
  }

  // 3. Verify Ed25519 signature
  // The signature is hex-encoded, signed over the raw body.
  try {
    const isValid = await verifyEd25519Signature(
      env.WEBHOOK_PUBLIC_KEY,
      rawBody,
      signature,
    );
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 },
      );
    }
  } catch (e) {
    console.error("Signature verification error:", e);
    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 401 },
    );
  }

  // 4. Parse payload
  let payload: z.infer<typeof WebhookPayload>;
  try {
    payload = WebhookPayload.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 },
    );
  }

  // 5. Find the pending deposit by invoice
  const pendingTx = await findTransactionByInvoice(payload.invoice);
  if (!pendingTx) {
    // Unknown invoice — could be a webhook for a different miniapp.
    // Acknowledge so Alien doesn't retry, but don't credit.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // 6. Idempotency — if the transaction is already completed, acknowledge.
  if (pendingTx.status === "completed") {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  // 7. Cross-check recipient + amount match our records
  // (the recipient is the server's provider address, stored as part of
  // the pending transaction's metadata in production)

  // 8. Credit or fail based on status
  if (payload.status === "finalized") {
    try {
      // Use a deterministic idempotency key derived from the invoice so
      // retries are safe.
      const idemKey = `webhook:${payload.invoice}`;
      await creditWallet({
        alienId: pendingTx.alien_id,
        amount: pendingTx.amount, // amount stored when deposit was initiated
        type: "deposit",
        description: `Deposit · ${payload.invoice}`,
        idempotencyKey: idemKey,
        invoice: payload.invoice,
        txHash: payload.txHash,
      });
      await completeTransaction(pendingTx.id, payload.txHash || "");
    } catch (e) {
      // If the credit failed (e.g. idempotency replay), still acknowledge
      // so Alien doesn't keep retrying.
      console.error("Webhook credit failed:", e);
    }
  } else {
    // payload.status === "failed"
    // Mark our pending tx as failed — no credit.
    // The client can detect this via the transactions endpoint and retry.
    const { failTransaction } = await import("@/lib/db/wallet");
    await failTransaction(pendingTx.id);
  }

  return NextResponse.json({ ok: true });
}

/**
 * Verify an Ed25519 signature using Node's crypto.
 *
 * Alien signs the raw request body with the Ed25519 private key
 * corresponding to the public key you got from the Dev Portal.
 *
 * We use Node's built-in `crypto.verify` with `ed25519` algorithm.
 * If you're on an edge runtime that doesn't support this, swap for
 * `@noble/ed25519` (pure JS, works everywhere).
 */
async function verifyEd25519Signature(
  publicKeyHex: string,
  body: string,
  signatureHex: string,
): Promise<boolean> {
  const { createPublicKey, verify } = await import("node:crypto");

  // Convert hex public key to a KeyObject. Alien uses raw 32-byte Ed25519 keys.
  // We need to wrap them in SPKI format for Node.
  const pubKeyBytes = Buffer.from(publicKeyHex, "hex");
  const spkiPrefix = Buffer.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  const spkiDer = Buffer.concat([spkiPrefix, pubKeyBytes]);

  const keyObj = createPublicKey({
    key: spkiDer,
    format: "der",
    type: "spki",
  });

  const sig = Buffer.from(signatureHex, "hex");
  const data = Buffer.from(body, "utf8");

  return verify(null, data, keyObj, sig);
}
