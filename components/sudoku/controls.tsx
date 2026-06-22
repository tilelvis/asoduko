"use client";

import { memo } from "react";
import type { Difficulty } from "@/lib/sudoku/types";
import { DIFFICULTY_LABEL } from "@/lib/sudoku/types";

interface ControlsProps {
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  onNewGame: () => void;
  elapsedSeconds: number;
  mistakes: number;
  maxMistakes: number;
  onHint: () => void;
  hintsLeft: number;
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
}: ControlsProps) {
  const difficulties: Difficulty[] = ["easy", "medium", "hard"];

  return (
    <div className="flex flex-col gap-3">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Time
          </div>
          <div className="font-mono text-base font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatTime(elapsedSeconds)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Mistakes
          </div>
          <div
            className={[
              "font-mono text-base font-semibold tabular-nums",
              mistakes >= maxMistakes
                ? "text-rose-600 dark:text-rose-400"
                : mistakes > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-zinc-900 dark:text-zinc-100",
            ].join(" ")}
          >
            {mistakes}/{maxMistakes}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Hints
          </div>
          <div className="font-mono text-base font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {hintsLeft}
          </div>
        </div>
      </div>

      {/* Difficulty selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Level
        </span>
        <div className="flex flex-1 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {difficulties.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDifficultyChange(d)}
              className={[
                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                d === difficulty
                  ? "bg-white text-indigo-600 shadow-sm dark:bg-zinc-900 dark:text-indigo-300"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
              ].join(" ")}
              aria-pressed={d === difficulty}
            >
              {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onHint}
          disabled={hintsLeft <= 0}
          className={[
            "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
            hintsLeft <= 0
              ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
          ].join(" ")}
          aria-label="Get a hint"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M2 9a10 10 0 0 1 20 0c0 4-3 6-4 8H6c-1-2-4-4-4-8z" />
          </svg>
          Hint
        </button>
        <button
          type="button"
          onClick={onNewGame}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 dark:border-indigo-800 dark:bg-indigo-700 dark:hover:bg-indigo-600"
          aria-label="New game"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.4 0 4.6 1 6.2 2.5L21 6" />
            <path d="M21 3v3h-3" />
          </svg>
          New Game
        </button>
      </div>
    </div>
  );
}

export const Controls = memo(ControlsInner);
