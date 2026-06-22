"use client";

import { memo } from "react";
import type { Difficulty } from "@/lib/sudoku/types";
import {
  DIFFICULTY_CLUES,
  DIFFICULTY_META,
  DIFFICULTY_ORDER,
} from "@/lib/sudoku/types";
import { ENTRY_FEES, SOLVE_REWARD_BASE } from "@/lib/alien/aln-store";

interface ControlsProps {
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  onNewGame: () => void;
  elapsedSeconds: number;
  mistakes: number;
  maxMistakes: number;
  onHint: () => void;
  hintsLeft: number;
  /** Current ALN balance (for tier-affordability check). */
  alnBalance: number;
}

function formatTime(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function ControlsInner({
  difficulty,
  onDifficultyChange,
  onNewGame,
  elapsedSeconds,
  mistakes,
  maxMistakes,
  onHint,
  hintsLeft,
  alnBalance,
}: ControlsProps) {
  const meta = DIFFICULTY_META[difficulty];
  const entryFee = ENTRY_FEES[difficulty] ?? 0;
  const baseReward = SOLVE_REWARD_BASE[difficulty] ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Stats row — three holographic readouts */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Time" value={formatTime(elapsedSeconds)} />
        <Stat
          label="Errors"
          value={`${mistakes}/${maxMistakes}`}
          tone={
            mistakes >= maxMistakes
              ? "error"
              : mistakes > 0
                ? "warn"
                : "default"
          }
        />
        <Stat label="Hints" value={`${hintsLeft}`} />
      </div>

      {/* Active difficulty banner */}
      <div
        className="flex items-center justify-between rounded-md border px-3 py-2"
        style={{
          borderColor: `${meta.accent}55`,
          background: `linear-gradient(90deg, ${meta.accent}22, transparent 70%)`,
          boxShadow: `0 0 12px ${meta.accent}33, inset 0 0 8px ${meta.accent}11`,
        }}
      >
        <div className="flex flex-col">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.25em]"
            style={{ color: meta.accent }}
          >
            Rank · {meta.tagline}
          </span>
          <span
            className="font-mono text-base font-semibold"
            style={{
              color: meta.accent,
              textShadow: `0 0 8px ${meta.accent}88`,
            }}
          >
            {meta.label}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider">
            <div className="flex flex-col items-end">
              <span className="text-[var(--foreground-dim)]">Entry</span>
              <span
                className="text-[#fb7185]"
                style={{ textShadow: "0 0 6px rgba(251,113,133,0.4)" }}
              >
                {entryFee === 0 ? "FREE" : `−${entryFee}`}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[var(--foreground-dim)]">Base</span>
              <span
                className="text-[#34d399]"
                style={{ textShadow: "0 0 6px rgba(52,211,153,0.4)" }}
              >
                +{baseReward}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[var(--foreground-dim)]">Clues</span>
              <span className="text-[var(--foreground-muted)]">
                <ClueCount difficulty={difficulty} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tier selector — 6 ranks horizontally scrollable on narrow screens */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
          Tier
        </span>
        <div className="flex flex-1 gap-1 overflow-x-auto rounded-md border border-[var(--grid-line)] bg-[var(--background-elevated)] p-1">
          {DIFFICULTY_ORDER.map((d) => {
            const m = DIFFICULTY_META[d];
            const isActive = d === difficulty;
            const fee = ENTRY_FEES[d] ?? 0;
            const affordable = alnBalance >= fee;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onDifficultyChange(d)}
                className={[
                  "flex-1 whitespace-nowrap rounded px-2 py-1.5 font-mono text-[10px] font-medium uppercase tracking-wider transition-all",
                  isActive ? "tier-active" : "",
                  !affordable && !isActive ? "opacity-40" : "",
                ].join(" ")}
                style={{
                  color: isActive ? m.accent : "var(--foreground-dim)",
                  background: isActive ? `${m.accent}22` : "transparent",
                  border: `1px solid ${isActive ? `${m.accent}88` : "transparent"}`,
                }}
                aria-pressed={isActive}
                title={fee > 0 ? `Entry: ${fee} ALN` : "Free entry"}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onHint}
          disabled={hintsLeft <= 0}
          className={[
            "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 font-mono text-xs font-medium uppercase tracking-wider transition-all",
            hintsLeft <= 0
              ? "cursor-not-allowed border-[var(--grid-line)] bg-[var(--background-cell)] text-[var(--foreground-dim)]"
              : "border-[rgba(52,211,153,0.5)] bg-[rgba(52,211,153,0.08)] text-[#34d399] hover:bg-[rgba(52,211,153,0.16)]",
          ].join(" ")}
          style={
            hintsLeft > 0
              ? { boxShadow: "0 0 10px rgba(52,211,153,0.18)" }
              : undefined
          }
          aria-label="Get a hint"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M2 9a10 10 0 0 1 20 0c0 4-3 6-4 8H6c-1-2-4-4-4-8z" />
          </svg>
          Hint
        </button>
        <button
          type="button"
          onClick={onNewGame}
          className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 font-mono text-xs font-medium uppercase tracking-wider transition-all"
          style={{
            borderColor: `${meta.accent}`,
            background: `linear-gradient(90deg, ${meta.accent}, ${meta.accent2})`,
            color: "#050813",
            boxShadow: `0 0 14px ${meta.accent}66`,
          }}
          aria-label="New game"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.4 0 4.6 1 6.2 2.5L21 6" />
            <path d="M21 3v3h-3" />
          </svg>
          New Mission
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "error";
}) {
  const color =
    tone === "error"
      ? "#fb7185"
      : tone === "warn"
        ? "#fbbf24"
        : "var(--foreground)";
  const glow =
    tone === "error"
      ? "rgba(251,113,133,0.5)"
      : tone === "warn"
        ? "rgba(251,191,36,0.4)"
        : "var(--accent-faint)";
  return (
    <div className="glass-panel rounded-md px-3 py-2 text-center">
      <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
        {label}
      </div>
      <div
        className="font-mono text-base font-semibold tabular-nums"
        style={{ color, textShadow: `0 0 8px ${glow}` }}
      >
        {value}
      </div>
    </div>
  );
}

function ClueCount({ difficulty }: { difficulty: Difficulty }) {
  return <>{DIFFICULTY_CLUES[difficulty]}</>;
}

export const Controls = memo(ControlsInner);
