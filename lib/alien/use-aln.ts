"use client";

import { useCallback, useEffect, useState } from "react";
import { useAlien, usePayment } from "@alien-id/miniapps-react";
import {
  addAln,
  ALN_PRODUCTS,
  ALN_TEST_PRODUCTS,
  chargeEntryFee,
  computeReward,
  creditSolveReward,
  type AlnProduct,
  type AlnTransaction,
  type RewardBreakdown,
  ENTRY_FEES,
  getAlnBalance,
  getAlnTransactions,
  getDailyEarnings,
  purgeCostFor,
  spendAln,
} from "@/lib/alien/aln-store";
import type { Difficulty } from "@/lib/sudoku/types";

/**
 * Hook that exposes the player's ALN balance, transaction history, daily
 * earning cap status, and the actions needed by the Sudoku game:
 *   - chargeEntry(difficulty)  → deduct entry fee when starting a new game
 *   - awardSolve(...)          → credit reward with skill multipliers + cap
 *   - spend(...)               → spend ALN on a caveat (purge / refill)
 *   - purchase(product)        → buy ALN with real ALIEN tokens via the bridge
 *
 * The economy math lives in `lib/alien/aln-store.ts`. This hook just exposes
 * it to React with proper hydration and re-render semantics.
 */
export function useAln() {
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<AlnTransaction[]>([]);
  const [daily, setDaily] = useState<{ earned: number; cap: number; remaining: number }>({
    earned: 0,
    cap: 0,
    remaining: 0,
  });
  const [hydrated, setHydrated] = useState(false);

  const { authToken } = useAlien();

  const hasRecipient = Boolean(
    process.env.NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS,
  );

  const payment = usePayment({
    onPaid: () => {
      // Crediting happens in `purchase()` itself.
    },
    onCancelled: () => {},
    onFailed: () => {},
  });

  // Hydrate from localStorage on mount (client-only).
  useEffect(() => {
    setBalance(getAlnBalance());
    setTransactions(getAlnTransactions());
    setDaily(getDailyEarnings());
    setHydrated(true);
  }, []);

  const refresh = useCallback(() => {
    setBalance(getAlnBalance());
    setTransactions(getAlnTransactions());
    setDaily(getDailyEarnings());
  }, []);

  /** Check whether the player can afford the entry fee for a tier. */
  const canAffordTier = useCallback(
    (difficulty: Difficulty): boolean => {
      const fee = ENTRY_FEES[difficulty] ?? 0;
      return getAlnBalance() >= fee;
    },
    [],
  );

  /**
   * Charge the entry fee for a tier. Returns true if the player could
   * afford it (or if the tier is free).
   */
  const chargeEntry = useCallback(
    (difficulty: Difficulty): boolean => {
      const fee = ENTRY_FEES[difficulty] ?? 0;
      const ok = chargeEntryFee(fee, `Entry · ${difficulty}`);
      if (ok) refresh();
      return ok;
    },
    [refresh],
  );

  /**
   * Compute and credit the solve reward, applying skill multipliers and
   * the daily cap. Returns the full breakdown for UI display.
   */
  const awardSolve = useCallback(
    (opts: {
      difficulty: Difficulty;
      mistakes: number;
      maxMistakes: number;
      hintsUsed: number;
      maxHints: number;
    }): RewardBreakdown => {
      const { earned: dailyEarnedBefore } = getDailyEarnings();
      const breakdown = computeReward({
        difficulty: opts.difficulty,
        mistakes: opts.mistakes,
        maxMistakes: opts.maxMistakes,
        hintsUsed: opts.hintsUsed,
        maxHints: opts.maxHints,
        dailyEarnedBefore,
      });
      creditSolveReward(breakdown);
      refresh();
      return breakdown;
    },
    [refresh],
  );

  /** Spend ALN on a caveat. Returns true if the spend succeeded. */
  const spend = useCallback(
    (amount: number, description: string): boolean => {
      const ok = spendAln(amount, description);
      if (ok) refresh();
      return ok;
    },
    [refresh],
  );

  /** Award ALN (raw, no multipliers — used for bonuses/promos). */
  const earn = useCallback(
    (amount: number, description: string) => {
      addAln("earn", amount, description);
      refresh();
    },
    [refresh],
  );

  /** Get the purge-errors cost for a specific tier. */
  const purgeCost = useCallback(
    (difficulty: Difficulty): number => purgeCostFor(difficulty),
    [],
  );

  /**
   * Purchase ALN with real ALIEN tokens via the Alien payment bridge.
   * Falls back to test products when no recipient address is configured.
   */
  const purchase = useCallback(
    async (product: AlnProduct) => {
      const invoice = `inv-${crypto.randomUUID()}`;
      try {
        await payment.pay({
          recipient:
            process.env.NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS ||
            "test-recipient",
          amount: product.amount,
          token: product.token,
          network: product.network,
          invoice,
          item: {
            title: product.name,
            iconUrl:
              "https://avatars.githubusercontent.com/u/40111175?s=40&v=4",
            quantity: product.aln,
          },
          ...(product.test ? { test: product.test } : {}),
        });

        addAln("purchase", product.aln, `Purchased ${product.name}`);
        refresh();
        return { ok: true as const };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [payment, refresh],
  );

  return {
    balance,
    transactions,
    daily,
    hydrated,
    products: hasRecipient ? ALN_PRODUCTS : ALN_TEST_PRODUCTS,
    testProducts: ALN_TEST_PRODUCTS,
    hasRecipient,
    authToken,
    /** Entry fee (ALN) for the given tier. */
    entryFee: (d: Difficulty) => ENTRY_FEES[d] ?? 0,
    canAffordTier,
    chargeEntry,
    awardSolve,
    spend,
    earn,
    purgeCost,
    purchase,
    paymentStatus: payment.status,
    paymentLoading: payment.isLoading,
    paymentPaid: payment.isPaid,
    paymentCancelled: payment.isCancelled,
    paymentFailed: payment.isFailed,
    paymentError: payment.error,
    paymentCallable: payment.callable,
    paymentReset: payment.reset,
  };
}
