import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";
import { getTransactions } from "@/lib/db/wallet";
import { isWalletConfigured } from "@/lib/env";

/**
 * GET /api/wallet/transactions
 * Returns the full transaction history for the authenticated user.
 */
export const GET = withAuth(async (request, { auth }) => {
  if (!isWalletConfigured()) {
    return NextResponse.json(
      { error: "Wallet not configured." },
      { status: 503 },
    );
  }

  const rl = rateLimit(
    `${auth.sub}:transactions`,
    RATE_LIMITS.transactions,
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited", retryAfterMs: rl.resetInMs },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)),
  );

  const transactions = await getTransactions(auth.sub, limit);

  return NextResponse.json({
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      status: t.status,
      description: t.description,
      invoice: t.invoice,
      txHash: t.tx_hash,
      createdAt: new Date(t.created_at).toISOString(),
    })),
  });
});
