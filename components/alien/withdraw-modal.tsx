"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { useAln } from "@/lib/alien/use-aln";
import { formatAlnCredit } from "@/lib/alien/aln-store";

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
}

const WITHDRAW_ACCENT = "#34d399"; // emerald — money-out color

/**
 * Withdrawal modal — converts in-game ALN credit to real ALIEN tokens
 * sent to the player's wallet.
 *
 * Security UX:
 *   - Shows current balance (read from server)
 *   - Player enters amount + recipient address
 *   - Two-step confirmation: review → confirm → broadcast
 *   - On success: shows tx hash + explorer link
 *   - On failure: explains the error + confirms ALN was refunded
 *
 * The actual on-chain transfer is signed server-side with
 * ALIEN_WITHDRAW_PRIVATE_KEY which never leaves the server.
 */
export function WithdrawModal({ open, onClose }: WithdrawModalProps) {
  const aln = useAln();
  const [step, setStep] = useState<"form" | "confirm" | "broadcasting" | "done" | "error">("form");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const balance = aln.balance;
  const minWithdrawal = aln.minWithdrawal;
  const amountNum = parseInt(amount || "0", 10);
  const amountValid =
    amountNum >= minWithdrawal && amountNum <= balance;
  const recipientValid =
    recipient.length >= 32 && recipient.length <= 64 && /^[a-zA-Z0-9]+$/.test(recipient);

  const handleReset = () => {
    setStep("form");
    setAmount("");
    setRecipient("");
    setTxHash(null);
    setExplorerUrl(null);
    setErrorMsg(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleConfirm = async () => {
    setStep("broadcasting");
    setErrorMsg(null);
    const result = await aln.withdraw({
      amount: amountNum,
      recipientAddress: recipient,
    });
    if (result.ok) {
      setTxHash(result.txHash || null);
      setExplorerUrl(result.explorerUrl || null);
      setStep("done");
    } else {
      setErrorMsg(result.error || "Withdrawal failed");
      setStep("error");
    }
  };

  // ALN → ALIEN conversion display (10 ALN = 1 ALIEN)
  const ALN_PER_ALIEN = 10;
  const alienAmount = (amountNum / ALN_PER_ALIEN).toFixed(2);

  if (!aln.isServerMode) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Withdraw ALN"
        subtitle="Convert credit to ALIEN tokens"
        accent={WITHDRAW_ACCENT}
      >
        <div
          className="rounded-md border px-3 py-3 font-mono text-[11px] leading-relaxed"
          style={{
            borderColor: "rgba(251,191,36,0.4)",
            background: "rgba(251,191,36,0.08)",
            color: "#fbbf24",
          }}
        >
          ⚠ Withdrawals require the server-authoritative wallet to be
          configured. Set <code>ALIEN_AUDIENCE</code> and{" "}
          <code>ALIEN_WITHDRAW_PRIVATE_KEY</code> in your Vercel environment
          variables to enable withdrawals.
          <br />
          <br />
          Currently running in client-only fallback mode (dev) — ALN balance
          here is untrusted and cannot be withdrawn.
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Withdraw ALN"
      subtitle="Convert credit to ALIEN tokens"
      accent={WITHDRAW_ACCENT}
    >
      {step === "form" && (
        <div className="flex flex-col gap-4">
          <div
            className="flex items-center justify-between rounded-md border px-3 py-2"
            style={{
              borderColor: `${WITHDRAW_ACCENT}33`,
              background: `${WITHDRAW_ACCENT}0d`,
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--foreground-muted)]">
              Available
            </span>
            <span
              className="font-mono text-sm font-semibold"
              style={{ color: WITHDRAW_ACCENT }}
            >
              {aln.hydrated ? formatAlnCredit(balance) : "—"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
              Amount (ALN)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={minWithdrawal}
              max={balance}
              placeholder={String(minWithdrawal)}
              className="rounded-md border bg-[var(--background-cell)] px-3 py-2 font-mono text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--grid-line)" }}
            />
            {amount && !amountValid && (
              <span className="font-mono text-[10px] text-[#fb7185]">
                Min {minWithdrawal} · Max {balance}
              </span>
            )}
            {amountValid && (
              <span className="font-mono text-[10px] text-[var(--foreground-muted)]">
                ≈ {alienAmount} ALIEN tokens
              </span>
            )}
            <div className="flex gap-1.5">
              {[minWithdrawal, Math.floor(balance / 4), Math.floor(balance / 2), balance].map((v, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  disabled={v <= 0 || v > balance}
                  className="flex-1 rounded border border-[var(--grid-line)] bg-[var(--background-cell)] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[var(--foreground-muted)] transition-colors hover:border-[var(--accent-soft)] disabled:opacity-40"
                >
                  {i === 0 ? "Min" : i === 3 ? "Max" : `${["¼", "½"][i - 1]}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
              Recipient Alien wallet address
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Alien wallet address"
              className="rounded-md border bg-[var(--background-cell)] px-3 py-2 font-mono text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--grid-line)" }}
            />
            {recipient && !recipientValid && (
              <span className="font-mono text-[10px] text-[#fb7185]">
                Invalid address format
              </span>
            )}
          </div>

          <div
            className="rounded-md border px-3 py-2 font-mono text-[10px] leading-relaxed"
            style={{
              borderColor: "rgba(122,139,179,0.25)",
              background: "var(--background-cell)",
              color: "var(--foreground-muted)",
            }}
          >
            🔒 Withdrawals are signed server-side and broadcast on-chain.
            Your ALN is debited atomically — if the broadcast fails, it's
            refunded automatically.
          </div>

          <button
            type="button"
            onClick={() => setStep("confirm")}
            disabled={!amountValid || !recipientValid}
            className="rounded-md border px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              borderColor: WITHDRAW_ACCENT,
              background: WITHDRAW_ACCENT,
              color: "#050813",
              boxShadow: `0 0 12px ${WITHDRAW_ACCENT}55`,
            }}
          >
            Review withdrawal
          </button>
        </div>
      )}

      {step === "confirm" && (
        <div className="flex flex-col gap-4">
          <div
            className="rounded-md border p-4"
            style={{
              borderColor: `${WITHDRAW_ACCENT}55`,
              background: `${WITHDRAW_ACCENT}11`,
            }}
          >
            <div className="flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Amount</span>
                <span style={{ color: WITHDRAW_ACCENT }}>
                  {amountNum.toLocaleString()} ALN
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">≈ ALIEN tokens</span>
                <span className="text-[var(--foreground)]">
                  {alienAmount} ALIEN
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--foreground-muted)]">Recipient</span>
                <span className="text-[var(--foreground)]">
                  {recipient.slice(0, 8)}…{recipient.slice(-6)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--grid-line)] pt-2">
                <span className="text-[var(--foreground-muted)]">Network</span>
                <span className="text-[var(--foreground)]">Alien</span>
              </div>
            </div>
          </div>

          <div
            className="rounded-md border px-3 py-2 font-mono text-[10px] leading-relaxed"
            style={{
              borderColor: "rgba(251,191,36,0.4)",
              background: "rgba(251,191,36,0.08)",
              color: "#fbbf24",
            }}
          >
            ⚠ This will broadcast a real on-chain ALIEN transfer. Double-check
            the recipient address — transactions are irreversible.
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStep("form")}
              className="rounded-md border border-[var(--grid-line)] bg-[var(--background-elevated)] px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-cell)]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-md border px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-wider transition-all"
              style={{
                borderColor: WITHDRAW_ACCENT,
                background: WITHDRAW_ACCENT,
                color: "#050813",
                boxShadow: `0 0 12px ${WITHDRAW_ACCENT}55`,
              }}
            >
              Confirm & broadcast
            </button>
          </div>
        </div>
      )}

      {step === "broadcasting" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div
            className="orbit-spin h-10 w-10 rounded-full border-2"
            style={{
              borderColor: `${WITHDRAW_ACCENT}33`,
              borderTopColor: WITHDRAW_ACCENT,
            }}
          />
          <p
            className="font-mono text-xs uppercase tracking-[0.3em]"
            style={{ color: WITHDRAW_ACCENT }}
          >
            Broadcasting on Alien network…
          </p>
          <p className="font-mono text-[10px] text-[var(--foreground-dim)]">
            Do not close this window.
          </p>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col gap-4">
          <div
            className="flex flex-col items-center gap-2 rounded-md border p-5"
            style={{
              borderColor: `${WITHDRAW_ACCENT}55`,
              background: `${WITHDRAW_ACCENT}11`,
              boxShadow: `0 0 18px ${WITHDRAW_ACCENT}22`,
            }}
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full border-2"
              style={{
                borderColor: WITHDRAW_ACCENT,
                color: WITHDRAW_ACCENT,
                boxShadow: `0 0 14px ${WITHDRAW_ACCENT}55`,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <span
              className="font-mono text-base font-semibold"
              style={{ color: WITHDRAW_ACCENT }}
            >
              Withdrawal complete
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--foreground-muted)]">
              {amountNum.toLocaleString()} ALN → {alienAmount} ALIEN
            </span>
          </div>

          {txHash && (
            <div className="rounded-md border border-[var(--grid-line)] bg-[var(--background-cell)] px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
                Transaction hash
              </div>
              <div className="mt-0.5 break-all font-mono text-[10px] text-[var(--foreground)]">
                {txHash}
              </div>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-mono text-[10px] uppercase tracking-wider"
                  style={{ color: WITHDRAW_ACCENT }}
                >
                  View on explorer →
                </a>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-wider"
            style={{
              borderColor: WITHDRAW_ACCENT,
              background: WITHDRAW_ACCENT,
              color: "#050813",
              boxShadow: `0 0 12px ${WITHDRAW_ACCENT}55`,
            }}
          >
            Done
          </button>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col gap-4">
          <div
            className="flex flex-col items-center gap-2 rounded-md border p-5"
            style={{
              borderColor: "rgba(251,113,133,0.55)",
              background: "rgba(251,113,133,0.11)",
            }}
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full border-2"
              style={{
                borderColor: "#fb7185",
                color: "#fb7185",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </div>
            <span className="font-mono text-base font-semibold text-[#fb7185]">
              Withdrawal failed
            </span>
            <span className="font-mono text-[10px] text-center leading-relaxed text-[var(--foreground-muted)]">
              {errorMsg}
            </span>
          </div>
          <div
            className="rounded-md border px-3 py-2 font-mono text-[10px]"
            style={{
              borderColor: "rgba(52,211,153,0.4)",
              background: "rgba(52,211,153,0.08)",
              color: "#34d399",
            }}
          >
            ✓ Your ALN has been refunded to your wallet balance.
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-[var(--grid-line)] bg-[var(--background-elevated)] px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)]"
          >
            Try again
          </button>
        </div>
      )}
    </Modal>
  );
}
