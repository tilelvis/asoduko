"use client";

import { memo } from "react";

interface CellProps {
  value: number;
  notes: number[];
  given: boolean;
  selected: boolean;
  highlighted: boolean;
  sameValue: boolean;
  conflict: boolean;
  hint: boolean;
  onClick: () => void;
}

/**
 * A single Sudoku cell. Purely presentational — all game state lives in the
 * parent `<Board />` component. Memoised so only the cells that actually
 * change re-render on each move.
 */
function CellInner({
  value,
  notes,
  given,
  selected,
  highlighted,
  sameValue,
  conflict,
  hint,
  onClick,
}: CellProps) {
  // Tailwind classes — careful to keep them stable strings for memoisation.
  const base =
    "relative flex h-full w-full items-center justify-center select-none transition-colors duration-100";

  // Background layers, applied in priority order.
  let bg = "bg-white dark:bg-zinc-900";
  if (highlighted) bg = "bg-zinc-100 dark:bg-zinc-800/60";
  if (sameValue && !selected) bg = "bg-indigo-50 dark:bg-indigo-950/40";
  if (selected) bg = "bg-indigo-200/70 dark:bg-indigo-800/60";
  if (conflict) bg = "bg-rose-100 dark:bg-rose-950/50";

  // Text colour.
  let text = "text-zinc-900 dark:text-zinc-100";
  if (given) text = "text-zinc-900 dark:text-zinc-100 font-semibold";
  else if (conflict) text = "text-rose-600 dark:text-rose-400 font-medium";
  else text = "text-indigo-600 dark:text-indigo-300 font-medium";
  if (hint) text = "text-emerald-600 dark:text-emerald-400 font-semibold";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${bg} ${text}`}
      aria-label={`Cell ${value || "empty"}`}
    >
      {value !== 0 ? (
        <span className="text-lg leading-none sm:text-xl">{value}</span>
      ) : notes.length > 0 ? (
        <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-0 p-0.5">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className="flex items-center justify-center text-[8px] leading-none text-zinc-400 dark:text-zinc-600 sm:text-[9px]"
            >
              {notes.includes(n) ? n : ""}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

export const Cell = memo(CellInner);
