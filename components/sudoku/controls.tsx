"use client";

import { memo, useState } from "react";
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
  alnBalance: number;
  /** Compact potential payout (ALN) to show as a chip. */
  potentialPayout: number;
  dailyEarned: number;
  dailyCap: number;
}

function formatTime(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Compact single-row control strip:
 *
 *   [⏱ 00:42] [✗ 2/5] [💡 3] [+ 47 ALN] [▾ Transcendent]
 *
 * The tier dropdown opens on click and shows entry/base per tier.
 * Below the strip sits the action row: Hint · Caveats · Buy ALN · New Mission.
 *
 * All elements use shrink-0 so the board keeps all the flexible vertical space.
 */
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
  potentialPayout,
  dailyEarned,
  dailyCap,
}: ControlsProps) {
  const meta = DIFFICULTY_META[difficulty];
  const [tierOpen, setTierOpen] = useState(false);

  const errorTone =
    mistakes >= maxMistakes
      ? "#fb7185"
      : mistakes > 0
        ? "#fbbf24"
        : "var(--foreground)";

  return (
    <div className="relative flex shrink-0 flex-col gap-1.5">
      {/* Stats chips row */}
      <div className="flex items-center gap-1.5">
        <Chip label="⏱" value={formatTime(elapsedSeconds)} />
        <Chip
          label="✗"
          value={`${mistakes}/${maxMistakes}`}
          color={errorTone}
        />
        <Chip label="💡" value={`${hintsLeft}`} />
        <Chip
          label="▲"
          value={`${potentialPayout}`}
          color="#34d399"
          title={`Potential payout (today: ${dailyEarned}/${dailyCap} ALN)`}
        />

        {/* Tier pill — opens dropdown */}
        <button
          type="button"
          onClick={() => setTierOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wider transition-all"
          style={{
            borderColor: `${meta.accent}88`,
            color: meta.accent,
            background: `${meta.accent}1a`,
            boxShadow: `0 0 6px ${meta.accent}33`,
          }}
          aria-expanded={tierOpen}
          title={`${meta.label} · Entry ${ENTRY_FEES[difficulty] || "FREE"} ALN · Base +${SOLVE_REWARD_BASE[difficulty] || 0}`}
        >
          {meta.label}
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: tierOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Tier dropdown — opens below the strip */}
      {tierOpen && (
        <>
          {/* Click-away catcher */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setTierOpen(false)}
          />
          <div
            className="absolute right-0 top-full z-20 mt-1 w-full min-w-[260px] overflow-hidden rounded-md border bg-[var(--background-elevated)] shadow-2xl"
            style={{ borderColor: "var(--grid-line)" }}
          >
            {DIFFICULTY_ORDER.map((d) => {
              const m = DIFFICULTY_META[d];
              const fee = ENTRY_FEES[d] ?? 0;
              const base = SOLVE_REWARD_BASE[d] ?? 0;
              const isActive = d === difficulty;
              const affordable = alnBalance >= fee;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    onDifficultyChange(d);
                    setTierOpen(false);
                  }}
                  disabled={!affordable && !isActive}
                  className={[
                    "flex w-full items-center justify-between gap-2 px-3 py-2 font-mono text-[11px] transition-colors",
                    isActive
                      ? ""
                      : affordable
                        ? "hover:bg-[var(--grid-line)]"
                        : "cursor-not-allowed opacity-40",
                  ].join(" ")}
                  style={{
                    background: isActive ? `${m.accent}1a` : undefined,
                    color: isActive ? m.accent : "var(--foreground)",
                  }}
                >
                  <div className="flex flex-col items-start leading-tight">
                    <span className="font-semibold uppercase tracking-wider">
                      {m.label}
                    </span>
                    <span className="text-[9px] text-[var(--foreground-dim)]">
                      {m.tagline}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-[#fb7185]">
                      {fee === 0 ? "FREE" : `−${fee}`}
                    </span>
                    <span className="text-[#34d399]">+{base}</span>
                    <span className="text-[var(--foreground-dim)]">
                      {DIFFICULTY_CLUES[d]}c
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Action buttons row — compact */}
      <div className="grid grid-cols-4 gap-1.5">
        <ActionButton
          onClick={onHint}
          disabled={hintsLeft <= 0}
          label="Hint"
          color="#34d399"
          icon={
            <>
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M2 9a10 10 0 0 1 20 0c0 4-3 6-4 8H6c-1-2-4-4-4-8z" />
            </>
          }
        />
        <ActionButton
          onClick={onNewGame}
          label="New"
          color={meta.accent}
          filled
          icon={
            <>
              <path d="M21 12a9 9 0 1 1-9-9c2.4 0 4.6 1 6.2 2.5L21 6" />
              <path d="M21 3v3h-3" />
            </>
          }
        />
        <ActionButton
          onClick={() => {
            /* Caveats modal triggered from parent — see sudoku-game */
            const evt = new CustomEvent("sudoku:open-caveats");
            window.dispatchEvent(evt);
          }}
          label="Caveats"
          color="#fbbf24"
          icon={
            <>
              <path d="M12 2 2 7l10 5 10-5-10-5Z" />
              <path d="m2 17 10 5 10-5" />
              <path d="m2 12 10 5 10-5" />
            </>
          }
        />
        <ActionButton
          onClick={() => {
            const evt = new CustomEvent("sudoku:open-store");
            window.dispatchEvent(evt);
          }}
          label="+ALN"
          color="#c084fc"
          icon={
            <>
              <path d="M12 2v20" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </>
          }
        />
      </div>
    </div>
  );
}

function Chip({
  label,
  value,
  color = "var(--foreground)",
  title,
}: {
  label: string;
  value: string;
  color?: string;
  title?: string;
}) {
  return (
    <div
      className="glass-panel flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
      title={title}
    >
      <span className="text-[var(--foreground-dim)]">{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  icon,
  disabled,
  color,
  filled,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  color: string;
  filled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 font-mono text-[10px] font-medium uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        borderColor: color,
        background: filled
          ? `linear-gradient(135deg, ${color}, ${color}cc)`
          : `${color}1a`,
        color: filled ? "#050813" : color,
        boxShadow: disabled ? "none" : `0 0 6px ${color}33`,
      }}
      aria-label={label}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon}
      </svg>
      {label}
    </button>
  );
}

export const Controls = memo(ControlsInner);
