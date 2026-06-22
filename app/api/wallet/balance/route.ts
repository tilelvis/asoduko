import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";
import { getOrCreateWallet, getTransactions } from "@/lib/db/wallet";
import { getServerEnv, isWalletConfigured } from "@/lib/env";
import { DAILY_EARN_CAP } from "@/lib/alien/aln-store";

export const GET = withAuth(async (request, { auth }) => {
  if (!isWalletConfigured()) {
    return NextResponse.json(
      {
        error: "Wallet not configured. Set ALIEN_AUDIENCE on the server.",
      },
      { status: 503 },
    );
  }

  const rl = rateLimit(
    `${auth.sub}:balance`,
    RATE_LIMITS.balance,
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited", retryAfterMs: rl.resetInMs },
      { status: 429 },
    );
  }

  const wallet = await getOrCreateWallet(auth.sub);
  const transactions = await getTransactions(auth.sub, 20);
  const env = getServerEnv();

  return NextResponse.json({
    balance: wallet.balance,
    earnedToday: wallet.earned_today,
    earnDay: wallet.earn_day,
    dailyCap: DAILY_EARN_CAP,
    dailyRemaining: Math.max(0, DAILY_EARN_CAP - wallet.earned_today),
    minWithdrawal: env.WALLET_MIN_WITHDRAWAL,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      status: t.status,
      description: t.description,
      txHash: t.tx_hash,
      createdAt: new Date(t.created_at).toISOString(),
    })),
  });
});
