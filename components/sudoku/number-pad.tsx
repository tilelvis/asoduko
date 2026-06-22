"use client";

import { memo } from "react";

interface NumberPadProps {
  /** Whether each digit 1-9 is fully "used up" on the board (all 9 placed). */
  counts: number[]; // length 10, index 1..9 hold how many of that digit remain
  notesMode: boolean;
  onDigit: (n: number) => void;
  onErase: () => void;
  onToggleNotes: () => void;
  onUndo: () => void;
  canUndo: boolean;
}

/**
 * Number pad + action buttons (notes toggle, erase, undo).
 * Designed to be reachable with the thumb on a mobile WebView.
 */
function NumberPadInner({
  counts,
  notesMode,
  onDigit,
  onErase,
  onToggleNotes,
  onUndo,
  canUndo,
}: NumberPadProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Digits 1-9 in a 3x3 + 9-wide responsive grid. */}
      <div className="grid grid-cols-9 gap-1.5 sm:gap-2">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
          const remaining = counts[n] ?? 0;
          const disabled = remaining <= 0 && !notesMode;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onDigit(n)}
              disabled={disabled}
              className={[
                "relative flex aspect-square items-center justify-center rounded-lg border text-lg font-medium transition-colors sm:text-xl",
                disabled
                  ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-700"
                  : notesMode
                    ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-900/60",
              ].join(" ")}
              aria-label={`Place ${n}`}
            >
              {n}
              {!notesMode && remaining > 0 && (
                <span className="absolute bottom-0.5 right-1 text-[9px] font-normal text-zinc-400 dark:text-zinc-500">
                  {remaining}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={[
            "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
            !canUndo
              ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-700"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
          ].join(" ")}
          aria-label="Undo"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
          </svg>
          Undo
        </button>

        <button
          type="button"
          onClick={onErase}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-label="Erase cell"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20H7L3 16a1 1 0 0 1 0-1.4l9.6-9.6a2 2 0 0 1 2.8 0l4.6 4.6a2 2 0 0 1 0 2.8L13 19" />
            <path d="m22 21-12 0" />
          </svg>
          Erase
        </button>

        <button
          type="button"
          onClick={onToggleNotes}
          className={[
            "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
            notesMode
              ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
          ].join(" ")}
          aria-pressed={notesMode}
          aria-label="Toggle notes mode"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Notes
        </button>
      </div>
    </div>
  );
}

export const NumberPad = memo(NumberPadInner);
