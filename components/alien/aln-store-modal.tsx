"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { useAln } from "@/lib/alien/use-aln";
import {
  formatAlienAmount,
  formatAlnCredit,
  type AlnProduct,
} from "@/lib/alien/aln-store";

interface AlnStoreModalProps {
  open: boolean;
  onClose: () => void;
}

const STORE_ACCENT = "#c084fc"; // violet — distinct from gameplay accent

/**
 * Modal showing the player's ALN balance, transaction history, and a list
 * of purchasable ALN packs. Real ALIEN tokens are transferred to your
 * provider address via the Alien payment bridge.
 *
 * If no provider address is configured (`NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS`),
 * the modal falls back to test products so the flow can be exercised in
 * local dev without spending real tokens.
 */
export function AlnStoreModal({ open, onClose }: AlnStoreModalProps) {
  const aln = useAln();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  const handleBuy = async (product: AlnProduct) => {
    setPurchasing(product.id);
    setLastError(null);
    setLastSuccess(null);

    const result = await aln.purchase(product);

    if (result.ok) {
      setLastSuccess(`+${formatAlnCredit(product.aln)} credited`);
    } else {
      setLastError(result.error || "Payment failed");
    }
    setPurchasing(null);
  };

  const callable = aln.paymentCallable ?? false;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ALN Token Store"
      subtitle="Power your caveats with Alien tokens"
      accent={STORE_ACCENT}
    >
      <div className="flex flex-col gap-4">
        {/* Balance card */}
        <div
          className="rounded-md border p-4"
          style={{
            borderColor: `${STORE_ACCENT}44`,
            background: `linear-gradient(135deg, ${STORE_ACCENT}22, transparent 80%)`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--foreground-muted)]">
                Your balance
              </span>
              <span
                className="font-mono text-2xl font-semibold"
                style={{ color: STORE_ACCENT, textShadow: `0 0 12px ${STORE_ACCENT}66` }}
              >
                {aln.hydrated ? formatAlnCredit(aln.balance) : "—"}
              </span>
            </div>
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full border-2"
              style={{
                borderColor: `${STORE_ACCENT}88`,
                boxShadow: `0 0 14px ${STORE_ACCENT}55`,
                color: STORE_ACCENT,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                <path d="m2 17 10 5 10-5" />
                <path d="m2 12 10 5 10-5" />
              </svg>
            </div>
          </div>
        </div>

        {/* Bridge availability warning */}
        {!callable && (
          <div
            className="rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed"
            style={{
              borderColor: "rgba(251,191,36,0.4)",
              background: "rgba(251,191,36,0.08)",
              color: "#fbbf24",
            }}
          >
            ⚠ Payment bridge not detected. Running in test mode — purchases
            simulate successfully but no real ALIEN tokens are transferred.
            Open this miniapp inside the Alien app to enable real payments.
          </div>
        )}

        {/* Status messages */}
        {lastSuccess && (
          <div
            className="rounded-md border px-3 py-2 font-mono text-[11px]"
            style={{
              borderColor: "rgba(52,211,153,0.4)",
              background: "rgba(52,211,153,0.08)",
              color: "#34d399",
            }}
          >
            ✓ {lastSuccess}
          </div>
        )}
        {lastError && (
          <div
            className="rounded-md border px-3 py-2 font-mono text-[11px]"
            style={{
              borderColor: "rgba(251,113,133,0.4)",
              background: "rgba(251,113,133,0.08)",
              color: "#fb7185",
            }}
          >
            ✗ {lastError}
          </div>
        )}

        {/* Payment in progress */}
        {aln.paymentLoading && (
          <div
            className="rounded-md border px-3 py-2 font-mono text-[11px]"
            style={{
              borderColor: `${STORE_ACCENT}44`,
              background: `${STORE_ACCENT}11`,
              color: STORE_ACCENT,
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="orbit-spin h-3 w-3 rounded-full border border-current border-t-transparent"
                style={{ color: STORE_ACCENT }}
              />
              Awaiting confirmation on the Alien network…
            </div>
          </div>
        )}

        {/* Product grid */}
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
            {aln.hasRecipient ? "Available packs" : "Test packs (no real charge)"}
          </span>
          {aln.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onBuy={() => handleBuy(product)}
              disabled={purchasing !== null || aln.paymentLoading}
              loading={purchasing === product.id}
            />
          ))}
        </div>

        {/* Recent transactions */}
        {aln.transactions.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
              Recent activity
            </span>
            <div className="flex flex-col gap-1.5">
              {aln.transactions.slice(0, 5).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-md border border-[var(--grid-line)] bg-[var(--background-cell)] px-3 py-2 font-mono text-[11px]"
                >
                  <span className="text-[var(--foreground-muted)]">
                    {tx.description}
                  </span>
                  <span
                    style={{
                      color: tx.amount > 0 ? "#34d399" : "#fb7185",
                    }}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount} ALN
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer info */}
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--foreground-dim)]">
          Real ALIEN tokens · Network: alien · Decimals: 9
        </p>
      </div>
    </Modal>
  );
}

function ProductCard({
  product,
  onBuy,
  disabled,
  loading,
}: {
  product: AlnProduct;
  onBuy: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md border bg-[var(--background-cell)] p-3"
      style={{ borderColor: `${STORE_ACCENT}33` }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-[var(--foreground)]">
            {product.name}
          </span>
          {product.test && (
            <span
              className="rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
              style={{
                borderColor: "rgba(251,191,36,0.4)",
                color: "#fbbf24",
              }}
            >
              Test
            </span>
          )}
        </div>
        <span className="mt-0.5 truncate font-mono text-[10px] text-[var(--foreground-muted)]">
          {product.description}
        </span>
        <span className="mt-0.5 font-mono text-[10px] text-[var(--foreground-dim)]">
          {formatAlienAmount(product.amount)} · +{product.aln} ALN credit
        </span>
      </div>
      <button
        type="button"
        onClick={onBuy}
        disabled={disabled}
        className="shrink-0 rounded-md border px-3 py-2 font-mono text-xs font-medium uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          borderColor: STORE_ACCENT,
          background: STORE_ACCENT,
          color: "#050813",
          boxShadow: loading ? `0 0 14px ${STORE_ACCENT}` : `0 0 8px ${STORE_ACCENT}33`,
        }}
      >
        {loading ? "···" : "Buy"}
      </button>
    </div>
  );
}
