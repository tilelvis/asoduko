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
 * A single Sudoku cell, styled as a panel on an alien control console.
 * - Empty cells: deep void background.
 * - Given cells: bright cyan glyph (system-provided).
 * - Player digits: accent-colored glyph with a soft neon glow.
 * - Selected cell: solid accent fill + bright outer glow.
 * - Same-row/col/box peers: faint accent wash.
 * - Same-value cells: stronger accent wash.
 * - Conflicts: rose-red glow.
 * - Hint-revealed cells: emerald glow.
 *
 * Purely presentational; memoised so only changed cells re-render.
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
  // Background layers, applied in priority order.
  let bg = "bg-[var(--background-cell)]";
  if (highlighted) bg = "bg-[rgba(34,211,238,0.06)]";
  if (sameValue) bg = "bg-[rgba(34,211,238,0.14)]";
  if (selected) bg = "bg-[rgba(34,211,238,0.28)]";
  if (conflict) bg = "bg-[rgba(251,113,133,0.18)]";

  // Text colour + glow.
  let text = "text-[var(--foreground)]";
  let glow = "";
  if (given) {
    text = "text-[#67e8f9] font-semibold";
    glow = "drop-shadow-[0_0_6px_rgba(34,211,238,0.55)]";
  } else if (hint) {
    text = "text-[#6ee7b7] font-semibold";
    glow = "drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]";
  } else if (conflict) {
    text = "text-[#fda4af] font-semibold";
    glow = "drop-shadow-[0_0_8px_rgba(251,113,133,0.7)]";
  } else if (value !== 0) {
    text = "text-[var(--accent)] font-medium";
    glow = "drop-shadow-[0_0_5px_var(--accent-faint)]";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative flex h-full w-full items-center justify-center select-none",
        "transition-colors duration-100",
        bg,
        text,
        glow,
      ].join(" ")}
      aria-label={`Cell ${value || "empty"}`}
    >
      {value !== 0 ? (
        <span className="font-mono text-base leading-none sm:text-lg">
          {value}
        </span>
      ) : notes.length > 0 ? (
        <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-0 p-0.5">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className="flex items-center justify-center font-mono text-[8px] leading-none text-[var(--foreground-dim)] sm:text-[9px]"
            >
              {notes.includes(n) ? n : ""}
            </span>
          ))}
        </div>
      ) : null}

      {/* Selection ring */}
      {selected && (
        <span
          className="pointer-events-none absolute inset-0 rounded-[2px] ring-2 ring-inset"
          style={{
            // CSS var --accent is set on a parent based on the active tier.
            boxShadow: "inset 0 0 0 2px var(--accent), 0 0 14px var(--accent-soft)",
          }}
        />
      )}
    </button>
  );
}

export const Cell = memo(CellInner);
