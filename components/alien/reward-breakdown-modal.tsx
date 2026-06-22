"use client";

import { Modal } from "./modal";
import type { RewardBreakdown } from "@/lib/alien/aln-store";

interface RewardBreakdownModalProps {
  open: boolean;
  onClose: () => void;
  breakdown: RewardBreakdown | null;
  difficultyLabel: string;
}

const ACCENT = "#34d399"; // emerald — reward color

/**
 * Modal shown after a puzzle is solved, breaking down exactly how the
 * reward was computed. Transparency builds trust and motivates the player
 * to chase the perfect-game multiplier next time.
 */
export function RewardBreakdownModal({
  open,
  onClose,
  breakdown,
  difficultyLabel,
}: RewardBreakdownModalProps) {
  if (!breakdown) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reward Credited"
      subtitle={`${difficultyLabel} mission complete`}
      accent={ACCENT}
    >
      <div className="flex flex-col gap-4">
        {/* Big total */}
        <div
          className="flex flex-col items-center gap-1 rounded-md border p-5"
          style={{
            borderColor: `${ACCENT}55`,
            background: `linear-gradient(135deg, ${ACCENT}22, transparent 80%)`,
            boxShadow: `0 0 18px ${ACCENT}22`,
          }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--foreground-muted)]">
            Earned
          </span>
          <span
            className="font-mono text-3xl font-semibold"
            style={{ color: ACCENT, textShadow: `0 0 14px ${ACCENT}66` }}
          >
            +{breakdown.netReward.toLocaleString()} ALN
          </span>
          {breakdown.capped && breakdown.capApplied > 0 && (
            <span className="mt-1 font-mono text-[10px] text-[#fbbf24]">
              Daily cap applied · −{breakdown.capApplied.toLocaleString()} ALN
            </span>
          )}
        </div>

        {/* Breakdown table */}
        <div className="flex flex-col gap-1.5 font-mono text-xs">
          <Row
            label="Base reward"
            value={`+${breakdown.base.toLocaleString()}`}
            muted
          />
          <Row
            label={`Hints bonus ×${breakdown.hintsMultiplier.toFixed(2)}`}
            value={`+${breakdown.hintsBonus.toLocaleString()}`}
            sub={`${breakdown.maxHints - breakdown.hintsUsed}/${breakdown.maxHints} hints unused`}
          />
          <Row
            label={`Errors bonus ×${breakdown.errorsMultiplier.toFixed(2)}`}
            value={`+${breakdown.errorsBonus.toLocaleString()}`}
            sub={`${breakdown.maxMistakes - breakdown.mistakes}/${breakdown.maxMistakes} errors avoided`}
          />
          <div
            className="my-1 h-px w-full"
            style={{ background: "var(--grid-line)" }}
          />
          <Row
            label="Gross reward"
            value={`+${breakdown.grossReward.toLocaleString()}`}
            strong
          />
          {breakdown.capped && (
            <Row
              label="Daily cap adjustment"
              value={`−${breakdown.capApplied.toLocaleString()}`}
              warn
            />
          )}
          <Row
            label="Net credited"
            value={`+${breakdown.netReward.toLocaleString()}`}
            strong
            highlight
          />
        </div>

        {/* Daily cap status */}
        <div
          className="rounded-md border px-3 py-2 font-mono text-[10px]"
          style={{
            borderColor: "var(--grid-line)",
            background: "var(--background-cell)",
            color: "var(--foreground-muted)",
          }}
        >
          Daily earning: {breakdown.dailyEarnedAfter.toLocaleString()} /{" "}
          {breakdown.dailyCap.toLocaleString()} ALN
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-md border px-4 py-2 font-mono text-xs font-medium uppercase tracking-wider transition-all"
          style={{
            borderColor: ACCENT,
            background: ACCENT,
            color: "#050813",
            boxShadow: `0 0 14px ${ACCENT}55`,
          }}
        >
          Continue
        </button>

        <p className="text-center font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--foreground-dim)]">
          Fewer hints + fewer errors = bigger payout. Push for the perfect game.
        </p>
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  sub,
  muted,
  strong,
  warn,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
  strong?: boolean;
  warn?: boolean;
  highlight?: boolean;
}) {
  const color = warn
    ? "#fbbf24"
    : highlight
      ? ACCENT
      : strong
        ? "var(--foreground)"
        : muted
          ? "var(--foreground-muted)"
          : "var(--foreground)";
  return (
    <div
      className="flex items-center justify-between gap-3"
      style={{
        padding: highlight ? "6px 8px" : undefined,
        borderRadius: highlight ? "4px" : undefined,
        background: highlight ? `${ACCENT}11` : undefined,
      }}
    >
      <div className="flex flex-col">
        <span
          className={strong ? "font-semibold uppercase tracking-wider" : ""}
          style={{ color, fontSize: strong ? "11px" : "11px" }}
        >
          {label}
        </span>
        {sub && (
          <span className="text-[9px] text-[var(--foreground-dim)]">{sub}</span>
        )}
      </div>
      <span
        className={strong ? "text-sm font-semibold tabular-nums" : "tabular-nums"}
        style={{ color, textShadow: highlight ? `0 0 8px ${ACCENT}44` : undefined }}
      >
        {value} ALN
      </span>
    </div>
  );
}
