"use client";

import { memo } from "react";
import { Cell } from "./cell";

export interface CellRenderMeta {
  value: number;
  notes: number[];
  given: boolean;
  selected: boolean;
  highlighted: boolean;
  sameValue: boolean;
  conflict: boolean;
  hint: boolean;
}

interface BoardProps {
  cells: CellRenderMeta[];
  onCellClick: (index: number) => void;
}

/**
 * 9x9 Sudoku grid styled as a holographic console panel.
 *
 * Layout strategy:
 *  - Outer frame uses a dark elevated surface with a neon accent border.
 *  - Cells are separated by thin grid lines via 1px gap.
 *  - 3x3 sub-grids are visually separated by 2px gaps in the accent color.
 *  - A subtle scanline overlay (`.scanlines::after`) sits on top of the
 *    whole board to evoke a CRT/holographic display.
 *
 * Memoised — only re-renders when the cells array reference changes.
 */
function BoardInner({ cells, onCellClick }: BoardProps) {
  return (
    <div
      className="scanlines relative w-full overflow-hidden rounded-lg p-[2px]"
      style={{
        background: "var(--background-elevated)",
        boxShadow:
          "0 0 0 1px var(--accent-soft), 0 0 22px var(--accent-faint), inset 0 0 22px rgba(0,0,0,0.6)",
      }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(9, minmax(0, 1fr))",
          gap: "1px",
          background: "var(--grid-line)",
        }}
      >
        {cells.map((meta, idx) => {
          const row = Math.floor(idx / 9);
          const col = idx % 9;

          // Thicker accent-colored gap between 3x3 boxes.
          const boxLeft = col % 3 === 0 && col !== 0;
          const boxTop = row % 3 === 0 && row !== 0;

          return (
            <div
              key={idx}
              className="aspect-square"
              style={{
                marginLeft: boxLeft ? 2 : 0,
                marginTop: boxTop ? 2 : 0,
              }}
            >
              <Cell {...meta} onClick={() => onCellClick(idx)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Board = memo(BoardInner);
