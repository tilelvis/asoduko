"use client";

import { useCallback, useEffect, useState } from "react";
import { useAlien, usePayment } from "@alien-id/miniapps-react";
import {
  addAln,
  ALN_PRODUCTS,
  ALN_TEST_PRODUCTS,
  type AlnProduct,
  type AlnTransaction,
  getAlnBalance,
  getAlnTransactions,
  spendAln,
} from "@/lib/alien/aln-store";

/**
 * Hook that exposes the player's ALN balance, transaction history, and the
 * ability to (a) spend ALN on caveats and (b) purchase ALN with real ALIEN
 * tokens via the Alien payment bridge.
 *
 * The purchase flow follows the official Alien Mini App payments contract:
 *   1. Pick a product.
 *   2. Call `payment.pay({ recipient, amount, token, network, invoice, item, test? })`.
 *   3. On `onPaid`, credit the player's local ALN balance.
 *
 * We don't POST to `/api/invoices` like the full boilerplate does — that
 * requires a database + JWT auth. Instead we generate the invoice ID
 * client-side (`inv-<uuid>`) which is fine for a self-contained miniapp
 * that only tracks balance locally. The actual on-chain payment is still
 * real and goes to your provider address.
 */
export function useAln() {
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<AlnTransaction[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const { authToken } = useAlien();

  // Whether we have a configured recipient. If not, we fall back to test
  // products so devs can try the flow without registering a provider.
  const hasRecipient = Boolean(
    process.env.NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS,
  );

  const payment = usePayment({
    onPaid: () => {
      // Crediting happens in `purchase()` itself based on which product was
      // selected — `onPaid` is just a signal that the transaction settled.
    },
    onCancelled: () => {
      // No-op — UI handles the cancel state.
    },
    onFailed: () => {
      // No-op — UI handles the failure state.
    },
  });

  // Hydrate from localStorage on mount (client-only).
  useEffect(() => {
    setBalance(getAlnBalance());
    setTransactions(getAlnTransactions());
    setHydrated(true);
  }, []);

  const refresh = useCallback(() => {
    setBalance(getAlnBalance());
    setTransactions(getAlnTransactions());
  }, []);

  /** Spend ALN on a caveat. Returns true if the spend succeeded. */
  const spend = useCallback(
    (amount: number, description: string): boolean => {
      const ok = spendAln(amount, description);
      if (ok) refresh();
      return ok;
    },
    [refresh],
  );

  /** Award ALN (e.g. on puzzle solve). */
  const earn = useCallback(
    (amount: number, description: string) => {
      addAln("earn", amount, description);
      refresh();
    },
    [refresh],
  );

  /**
   * Purchase ALN with real ALIEN tokens via the Alien payment bridge.
   * Falls back to test products when no recipient address is configured
   * (e.g. local dev outside the Alien app).
   */
  const purchase = useCallback(
    async (product: AlnProduct) => {
      // Generate an invoice ID client-side. Format matches the boilerplate:
      // "inv-" + UUID-ish string, well under the 64-byte UTF-8 limit.
      const invoice = `inv-${crypto.randomUUID()}`;

      try {
        await payment.pay({
          recipient: process.env.NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS || "test-recipient",
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

        // If pay() resolved without throwing, the bridge accepted the
        // payment. For test scenarios with `test: "paid"`, this means
        // success. For real payments, the on-chain tx has been submitted.
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
    hydrated,
    /** Available products — real ones if recipient configured, else test ones. */
    products: hasRecipient ? ALN_PRODUCTS : ALN_TEST_PRODUCTS,
    /** Always include test products in dev mode for explicit testing. */
    testProducts: ALN_TEST_PRODUCTS,
    hasRecipient,
    authToken,
    spend,
    earn,
    purchase,
    /** Payment bridge status — exposed for the UI to show loading states. */
    paymentStatus: payment.status,
    paymentLoading: payment.isLoading,
    paymentPaid: payment.isPaid,
    paymentCancelled: payment.isCancelled,
    paymentFailed: payment.isFailed,
    paymentError: payment.error,
    /** Whether the `payment:request` bridge method is callable in this host. */
    paymentCallable: payment.callable,
    paymentReset: payment.reset,
  };
}
