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
 * 9x9 Sudoku grid. Renders the thick borders between 3x3 sub-grids using
 * a wrapper div with `gap` plus per-cell border classes. Memoised so it
 * only re-renders when the cell metadata array reference changes.
 */
function BoardInner({ cells, onCellClick }: BoardProps) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-zinc-300 bg-zinc-300 shadow-sm dark:border-zinc-700 dark:bg-zinc-700">
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: "repeat(9, minmax(0, 1fr))" }}
      >
        {cells.map((meta, idx) => {
          const row = Math.floor(idx / 9);
          const col = idx % 9;

          // Add 2px outer gaps between 3x3 boxes by giving the cells on the
          // box edge a thicker margin. We use margin instead of border so the
          // inner cell stays square.
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
              <Cell
                {...meta}
                onClick={() => onCellClick(idx)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Board = memo(BoardInner);
