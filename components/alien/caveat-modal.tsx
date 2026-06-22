"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { useAln } from "@/lib/alien/use-aln";
import {
  CAVEAT_COSTS,
  formatAlnCredit,
} from "@/lib/alien/aln-store";

interface CaveatModalProps {
  open: boolean;
  onClose: () => void;
  currentMistakes: number;
  maxMistakes: number;
  currentHints: number;
  maxHints: number;
  onPurgeErrors: () => void;
  onRefillHints: () => void;
}

const CAVEAT_ACCENT = "#fbbf24"; // amber — "caveat" warning color

/**
 * Modal listing the available caveats the player can purchase with ALN.
 *
 * Caveats are "power-ups" that let the player recover from a near-loss
 * situation. They are intentionally limited to two recovery actions so
 * they don't trivialise the puzzle:
 *
 *   - Purge Errors: reset the mistake counter to 0. Doesn't touch the
 *     board state — just gives the player more breathing room.
 *   - Refill Hints: restore hints to the tier's max. Useful on harder
 *     tiers where the hint budget is tight.
 *
 * Both cost ALN. ALN can be earned by solving puzzles or bought with
 * real ALIEN tokens in the ALN Store modal.
 */
export function CaveatModal({
  open,
  onClose,
  currentMistakes,
  maxMistakes,
  currentHints,
  maxHints,
  onPurgeErrors,
  onRefillHints,
}: CaveatModalProps) {
  const aln = useAln();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const purgeDisabled =
    currentMistakes === 0 || aln.balance < CAVEAT_COSTS.purgeErrors;
  const refillDisabled =
    currentHints >= maxHints || aln.balance < CAVEAT_COSTS.refillHints;

  const handlePurge = () => {
    setError(null);
    setSuccess(null);
    const ok = aln.spend(
      CAVEAT_COSTS.purgeErrors,
      "Caveat · Purge Errors",
    );
    if (ok) {
      onPurgeErrors();
      setSuccess("Errors purged. Mistake counter reset.");
    } else {
      setError("Insufficient ALN balance.");
    }
  };

  const handleRefill = () => {
    setError(null);
    setSuccess(null);
    const ok = aln.spend(
      CAVEAT_COSTS.refillHints,
      "Caveat · Refill Hints",
    );
    if (ok) {
      onRefillHints();
      setSuccess("Hints refilled.");
    } else {
      setError("Insufficient ALN balance.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Caveats"
      subtitle="Spend ALN to recover"
      accent={CAVEAT_ACCENT}
    >
      <div className="flex flex-col gap-4">
        {/* Balance strip */}
        <div
          className="flex items-center justify-between rounded-md border px-3 py-2"
          style={{
            borderColor: `${CAVEAT_ACCENT}33`,
            background: `${CAVEAT_ACCENT}0d`,
          }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--foreground-muted)]">
            Balance
          </span>
          <span
            className="font-mono text-sm font-semibold"
            style={{ color: CAVEAT_ACCENT }}
          >
            {aln.hydrated ? formatAlnCredit(aln.balance) : "—"}
          </span>
        </div>

        {error && (
          <div
            className="rounded-md border px-3 py-2 font-mono text-[11px]"
            style={{
              borderColor: "rgba(251,113,133,0.4)",
              background: "rgba(251,113,133,0.08)",
              color: "#fb7185",
            }}
          >
            ✗ {error}
          </div>
        )}
        {success && (
          <div
            className="rounded-md border px-3 py-2 font-mono text-[11px]"
            style={{
              borderColor: "rgba(52,211,153,0.4)",
              background: "rgba(52,211,153,0.08)",
              color: "#34d399",
            }}
          >
            ✓ {success}
          </div>
        )}

        {/* Caveat: Purge Errors */}
        <CaveatCard
          title="Purge Errors"
          description="Reset your mistake counter to 0. The board state is untouched — you keep your placed digits."
          cost={CAVEAT_COSTS.purgeErrors}
          accent={CAVEAT_ACCENT}
          status={
            currentMistakes === 0
              ? "No errors to purge"
              : `${currentMistakes}/${maxMistakes} errors`
          }
          disabled={purgeDisabled}
          onActivate={handlePurge}
          icon={
            <>
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="m18 18-6-6-6 6" />
            </>
          }
        />

        {/* Caveat: Refill Hints */}
        <CaveatCard
          title="Refill Hints"
          description={`Restore your hint budget to the tier maximum (${maxHints}).`}
          cost={CAVEAT_COSTS.refillHints}
          accent={CAVEAT_ACCENT}
          status={
            currentHints >= maxHints
              ? "Hints already full"
              : `${currentHints}/${maxHints} hints`
          }
          disabled={refillDisabled}
          onActivate={handleRefill}
          icon={
            <>
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M2 9a10 10 0 0 1 20 0c0 4-3 6-4 8H6c-1-2-4-4-4-8z" />
            </>
          }
        />

        <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--foreground-dim)]">
          Need more ALN? Solve puzzles or visit the ALN Store.
        </p>
      </div>
    </Modal>
  );
}

function CaveatCard({
  title,
  description,
  cost,
  accent,
  status,
  disabled,
  onActivate,
  icon,
}: {
  title: string;
  description: string;
  cost: number;
  accent: string;
  status: string;
  disabled: boolean;
  onActivate: () => void;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-3"
      style={{ borderColor: `${accent}33`, background: "var(--background-cell)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
          style={{
            borderColor: `${accent}55`,
            background: `${accent}11`,
            color: accent,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon}
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-semibold text-[var(--foreground)]">
              {title}
            </span>
            <span
              className="font-mono text-[10px] uppercase tracking-wider"
              style={{ color: accent }}
            >
              {status}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-[var(--foreground-muted)]">
            {description}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onActivate}
        disabled={disabled}
        className="mt-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 font-mono text-xs font-medium uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          borderColor: accent,
          background: disabled ? "transparent" : `${accent}1a`,
          color: disabled ? "var(--foreground-dim)" : accent,
          boxShadow: disabled ? "none" : `0 0 8px ${accent}33`,
        }}
      >
        Activate · {cost} ALN
      </button>
    </div>
  );
}
