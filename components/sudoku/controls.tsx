"use client";

import { memo } from "react";
import type { Difficulty } from "@/lib/sudoku/types";

interface ControlsProps {
  onNewGame: () => void;
  elapsedSeconds: number;
  mistakes: number;
  maxMistakes: number;
  onHint: () => void;
  hintsLeft: number;
  /** Compact potential payout (ALN) to show as a chip. */
  potentialPayout: number;
  dailyEarned: number;
  dailyCap: number;
}

function formatTime(total: number): string {
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Compact control strip — stats chips row + action buttons row.
 * The tier selector has moved to <TierBanner /> (swipeable carousel).
 */
function ControlsInner({
  onNewGame,
  elapsedSeconds,
  mistakes,
  maxMistakes,
  onHint,
  hintsLeft,
  potentialPayout,
  dailyEarned,
  dailyCap,
}: ControlsProps) {
  const errorTone =
    mistakes >= maxMistakes
      ? "#fb7185"
      : mistakes > 0
        ? "#fbbf24"
        : "var(--foreground)";

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
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
      </div>

      {/* Action buttons row — compact */}
      <div className="grid grid-cols-5 gap-1">
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
          color="var(--accent)"
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
          label="Buy"
          color="#c084fc"
          icon={
            <>
              <path d="M12 2v20" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </>
          }
        />
        <ActionButton
          onClick={() => {
            const evt = new CustomEvent("sudoku:open-withdraw");
            window.dispatchEvent(evt);
          }}
          label="Cash"
          color="#34d399"
          icon={
            <>
              <path d="M12 2v20" />
              <path d="m17 17 5-5-5-5" />
              <path d="M22 12H9" />
              <path d="M12 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h7" />
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
      className="flex items-center justify-center gap-1 rounded-md border px-1 py-1.5 font-mono text-[9px] font-medium uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-40"
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
        width="10"
        height="10"
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
