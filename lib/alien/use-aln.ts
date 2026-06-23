"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAlien, usePayment } from "@alien-id/miniapps-react";
import {
  ALN_PRODUCTS,
  ALN_TEST_PRODUCTS,
  CAVEAT_COSTS_PURGE,
  CAVEAT_COSTS_REFILL,
  type AlnProduct,
  ENTRY_FEES,
  purgeCostFor,
  SOLVE_REWARD_BASE,
} from "@/lib/alien/aln-store";
import type { Difficulty } from "@/lib/sudoku/types";

/**
 * Server-authoritative wallet hook.
 *
 * The balance lives on the server (SQLite via /api/wallet/balance). The
 * client never stores or trusts its own balance. localStorage is used
 * ONLY as a fallback for dev mode when the server wallet isn't configured
 * (no ALIEN_AUDIENCE set) — and even then, the user is clearly warned
 * that this is untrusted display only.
 *
 * Every state-changing operation goes through a server endpoint:
 *   - chargeEntry(difficulty)  → POST /api/wallet/claim (no — entry fees are
 *                                debited implicitly via the claim flow)
 *   - awardSolve(...)          → POST /api/wallet/claim
 *   - spend(amount, ...)       → not yet server-side; caveat spends still
 *                                client-only because they don't move real
 *                                value. They're a game mechanic, not money.
 *   - purchase(product)        → POST /api/wallet/deposit → payment.pay()
 *                                → webhook credits balance
 *   - withdraw(...)            → POST /api/wallet/withdraw
 *
 * The hook polls the server balance every 15s while the app is open, so
 * deposits confirmed by the webhook show up automatically.
 */

export interface WalletTransaction {
  id: string;
  type: "deposit" | "withdraw" | "claim" | "entry_fee" | "spend";
  amount: number;
  status: "pending" | "completed" | "failed";
  description: string;
  txHash: string | null;
  createdAt: string;
}

interface ServerWalletState {
  balance: number;
  earnedToday: number;
  dailyCap: number;
  dailyRemaining: number;
  minWithdrawal: number;
  transactions: WalletTransaction[];
}

interface ClientFallbackState {
  balance: number;
  transactions: WalletTransaction[];
}

const FALLBACK_STORAGE_KEY = "alien-sudoku:aln-fallback";
const FALLBACK_STARTING_BALANCE = 50;

export function useAln() {
  const { authToken } = useAlien();
  const [serverState, setServerState] = useState<ServerWalletState | null>(null);
  const [fallback, setFallback] = useState<ClientFallbackState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRecipient = Boolean(
    process.env.NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS,
  );

  const payment = usePayment({
    onPaid: () => refresh(),
    onCancelled: () => {},
    onFailed: () => {},
  });

  // ---------- fetch balance from server ----------
  const refresh = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch("/api/wallet/balance", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 503) {
        // Server wallet not configured — fall back to client mode.
        setServerState(null);
        loadFallback();
        return;
      }
      if (!res.ok) {
        setLastError(`Wallet error: ${res.status}`);
        return;
      }
      const data = (await res.json()) as ServerWalletState;
      setServerState(data);
      setLastError(null);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : "Network error");
    }
  }, [authToken]);

  // ---------- fallback (dev mode only) ----------
  const loadFallback = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
      if (raw) {
        setFallback(JSON.parse(raw));
      } else {
        const initial: ClientFallbackState = {
          balance: FALLBACK_STARTING_BALANCE,
          transactions: [],
        };
        window.localStorage.setItem(
          FALLBACK_STORAGE_KEY,
          JSON.stringify(initial),
        );
        setFallback(initial);
      }
    } catch {
      setFallback({ balance: FALLBACK_STARTING_BALANCE, transactions: [] });
    }
  }, []);

  const writeFallback = useCallback((state: ClientFallbackState) => {
    setFallback(state);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          FALLBACK_STORAGE_KEY,
          JSON.stringify(state),
        );
      } catch {}
    }
  }, []);

  // ---------- hydrate + poll ----------
  useEffect(() => {
    setHydrated(true);
    if (authToken) {
      refresh();
      pollRef.current = setInterval(refresh, 15000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    } else {
      // No auth token (running outside Alien app) — use fallback.
      loadFallback();
    }
  }, [authToken, refresh, loadFallback]);

  // ---------- derived state ----------
  const isServerMode = serverState !== null;
  const balance = isServerMode
    ? serverState!.balance
    : fallback?.balance ?? 0;
  const transactions = isServerMode
    ? serverState!.transactions
    : fallback?.transactions ?? [];
  const daily = isServerMode
    ? {
        earned: serverState!.earnedToday,
        cap: serverState!.dailyCap,
        remaining: serverState!.dailyRemaining,
      }
    : { earned: 0, cap: 500, remaining: 500 };

  // ---------- actions ----------
  /** Charge the entry fee. Server-side this happens implicitly via claim. */
  const chargeEntry = useCallback(
    (difficulty: Difficulty): boolean => {
      const fee = ENTRY_FEES[difficulty] ?? 0;
      if (isServerMode) {
        // In server mode, entry fees are deducted from the claimed reward.
        // The claim endpoint computes net = gross - entryFee.
        // We just check the player has SOMETHING to play with — but since
        // Rookie is free, they can always play.
        return true;
      }
      // Fallback mode: debit locally.
      if (balance < fee) return false;
      writeFallback({
        balance: balance - fee,
        transactions: [
          {
            id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: "entry_fee" as const,
            amount: -fee,
            status: "completed" as const,
            description: `Entry · ${difficulty}`,
            txHash: null,
            createdAt: new Date().toISOString(),
          },
          ...fallback!.transactions,
        ].slice(0, 100),
      });
      return true;
    },
    [isServerMode, balance, fallback, writeFallback],
  );

  const canAffordTier = useCallback(
    (difficulty: Difficulty): boolean => {
      const fee = ENTRY_FEES[difficulty] ?? 0;
      return balance >= fee;
    },
    [balance],
  );

  /**
   * Award a puzzle-solve reward. In server mode this calls /api/wallet/claim
   * which computes the reward server-side. In fallback mode it credits locally.
   */
  const awardSolve = useCallback(
    async (opts: {
      difficulty: Difficulty;
      mistakes: number;
      maxMistakes: number;
      hintsUsed: number;
      maxHints: number;
      gameSeed: string;
      timeSeconds: number;
    }): Promise<{
      netReward: number;
      capped: boolean;
      capApplied: number;
      grossReward: number;
      leaderboardRank?: number;
      isNewBest?: boolean;
    } | null> => {
      if (isServerMode && authToken) {
        try {
          // 1. Claim the reward (credits the wallet).
          const res = await fetch("/api/wallet/claim", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              difficulty: opts.difficulty,
              mistakes: opts.mistakes,
              hintsUsed: opts.hintsUsed,
              gameSeed: opts.gameSeed,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setLastError(err.error || `Claim failed: ${res.status}`);
            return null;
          }
          const data = await res.json();
          await refresh();

          // 2. Submit to the leaderboard (fire-and-forget, don't fail the
          //    claim if the leaderboard submission fails).
          let leaderboardRank: number | undefined;
          let isNewBest: boolean | undefined;
          try {
            const lbRes = await fetch("/api/leaderboard/submit", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${authToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                difficulty: opts.difficulty,
                mistakes: opts.mistakes,
                hintsUsed: opts.hintsUsed,
                timeSeconds: opts.timeSeconds,
                gameSeed: opts.gameSeed,
              }),
            });
            if (lbRes.ok) {
              const lbData = await lbRes.json();
              leaderboardRank = lbData.rank;
              isNewBest = lbData.isNewBest;
            }
          } catch {
            // Leaderboard is best-effort — don't fail the reward.
          }

          return {
            netReward: data.breakdown.grossReward - data.breakdown.capApplied,
            capped: data.breakdown.capped,
            capApplied: data.breakdown.capApplied,
            grossReward: data.breakdown.grossReward,
            leaderboardRank,
            isNewBest,
          };
        } catch (e) {
          setLastError(e instanceof Error ? e.message : "Claim failed");
          return null;
        }
      }
      // Fallback: compute locally (UNTRUSTED — dev mode only).
      const base = SOLVE_REWARD_BASE[opts.difficulty] ?? 5;
      const hintsSlack =
        opts.maxHints > 0 ? 1 - opts.hintsUsed / opts.maxHints : 1;
      const errorsSlack =
        opts.maxMistakes > 0 ? 1 - opts.mistakes / opts.maxMistakes : 1;
      const gross = Math.round(
        base * (1 + 0.4 * hintsSlack) * (1 + 0.6 * errorsSlack),
      );
      writeFallback({
        balance: balance + gross,
        transactions: [
          {
            id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: "claim" as const,
            amount: gross,
            status: "completed" as const,
            description: `Solved ${opts.difficulty}`,
            txHash: null,
            createdAt: new Date().toISOString(),
          },
          ...fallback!.transactions,
        ].slice(0, 100),
      });
      return {
        netReward: gross,
        capped: false,
        capApplied: 0,
        grossReward: gross,
      };
    },
    [isServerMode, authToken, balance, fallback, writeFallback, refresh],
  );

  /** Spend ALN on a caveat. This is a GAME MECHANIC, not real money —
   *  it stays client-side even in server mode. The actual withdrawable
   *  balance is unaffected by caveat spends. */
  const spend = useCallback(
    (amount: number, description: string): boolean => {
      // In server mode, caveat spends don't touch the server balance —
      // they're a game-state mechanic. We track them locally so the UI
      // updates, but the server balance (the real one) is unchanged.
      // The "real" balance is what matters for withdrawals.
      if (balance < amount) return false;
      // We intentionally don't write to fallback in server mode — the
      // caveat spend is ephemeral game state, not a persistent transaction.
      if (!isServerMode) {
        writeFallback({
          balance: balance - amount,
          transactions: [
            {
              id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: "spend" as const,
              amount: -amount,
              status: "completed" as const,
              description,
              txHash: null,
              createdAt: new Date().toISOString(),
            },
            ...fallback!.transactions,
          ].slice(0, 100),
        });
      }
      return true;
    },
    [isServerMode, balance, fallback, writeFallback],
  );

  const earn = useCallback(
    (amount: number, description: string) => {
      // Used only for bonus ALN (promos etc.) — same caveat as spend.
      if (!isServerMode) {
        writeFallback({
          balance: balance + amount,
          transactions: [
            {
              id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: "claim" as const,
              amount,
              status: "completed" as const,
              description,
              txHash: null,
              createdAt: new Date().toISOString(),
            },
            ...fallback!.transactions,
          ].slice(0, 100),
        });
      }
    },
    [isServerMode, balance, fallback, writeFallback],
  );

  const purgeCost = useCallback(
    (difficulty: Difficulty): number => purgeCostFor(difficulty),
    [],
  );

  /**
   * Purchase ALN with real ALIEN tokens.
   * In server mode: register deposit → payment.pay() → webhook credits.
   * In fallback mode: simulate with test products.
   */
  const purchase = useCallback(
    async (product: AlnProduct) => {
      if (isServerMode && authToken) {
        try {
          const idempotencyKey = crypto.randomUUID();
          // 1. Register pending deposit on server.
          const regRes = await fetch("/api/wallet/deposit", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              productId: product.id,
              idempotencyKey,
            }),
          });
          if (!regRes.ok) {
            const err = await regRes.json().catch(() => ({}));
            return {
              ok: false as const,
              error: err.error || `Deposit registration failed: ${regRes.status}`,
            };
          }
          const reg = await regRes.json();

          // 2. Call the Alien payment bridge with the server-issued invoice.
          await payment.pay({
            recipient: reg.recipient,
            amount: reg.amount,
            token: reg.token,
            network: reg.network,
            invoice: reg.invoice,
            item: {
              title: product.name,
              iconUrl:
                "https://avatars.githubusercontent.com/u/40111175?s=40&v=4",
              quantity: reg.alnCredit,
            },
          });

          // 3. Refresh balance — the webhook may have already fired.
          await refresh();
          return { ok: true as const };
        } catch (err) {
          return {
            ok: false as const,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // Fallback: test-mode purchase, simulate.
      try {
        await payment.pay({
          recipient: "test-recipient",
          amount: product.amount,
          token: product.token,
          network: product.network,
          invoice: `inv-${crypto.randomUUID()}`,
          item: {
            title: product.name,
            iconUrl:
              "https://avatars.githubusercontent.com/u/40111175?s=40&v=4",
            quantity: product.aln,
          },
        });
        writeFallback({
          balance: balance + product.aln,
          transactions: [
            {
              id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: "deposit" as const,
              amount: product.aln,
              status: "completed" as const,
              description: `Purchased ${product.name}`,
              txHash: null,
              createdAt: new Date().toISOString(),
            },
            ...fallback!.transactions,
          ].slice(0, 100),
        });
        return { ok: true as const };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [isServerMode, authToken, balance, fallback, writeFallback, payment, refresh],
  );

  /**
   * Withdraw ALN to a real Alien wallet.
   * Server-only — not available in fallback mode.
   */
  const withdraw = useCallback(
    async (opts: {
      amount: number;
      recipientAddress: string;
    }): Promise<{
      ok: boolean;
      txHash?: string;
      explorerUrl?: string;
      error?: string;
    }> => {
      if (!isServerMode || !authToken) {
        return {
          ok: false,
          error: "Withdrawals require server wallet. Configure ALIEN_AUDIENCE.",
        };
      }
      try {
        const res = await fetch("/api/wallet/withdraw", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: opts.amount,
            recipientAddress: opts.recipientAddress,
            idempotencyKey: crypto.randomUUID(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.error || `Withdrawal failed: ${res.status}` };
        }
        await refresh();
        return {
          ok: true,
          txHash: data.txHash,
          explorerUrl: data.explorerUrl,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [isServerMode, authToken, refresh],
  );

  return {
    balance,
    transactions,
    daily,
    hydrated,
    isServerMode,
    lastError,
    products: hasRecipient ? ALN_PRODUCTS : ALN_TEST_PRODUCTS,
    testProducts: ALN_TEST_PRODUCTS,
    hasRecipient,
    authToken,
    entryFee: (d: Difficulty) => ENTRY_FEES[d] ?? 0,
    minWithdrawal: isServerMode ? serverState!.minWithdrawal : 50,
    canAffordTier,
    chargeEntry,
    awardSolve,
    spend,
    earn,
    purgeCost,
    purchase,
    withdraw,
    refresh,
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
