/**
 * Sudoku core types
 */

/** A single cell value: 0 = empty, 1-9 = the digit. */
export type CellValue = number;

/** A 9x9 board represented as a flat array of 81 numbers. */
export type Board = CellValue[];

/** Difficulty levels mapped to how many cells are revealed. */
export type Difficulty = "easy" | "medium" | "hard";

/** Per-cell metadata for the UI. */
export interface CellMeta {
  /** Whether this cell was part of the original puzzle (cannot be edited). */
  readonly given: boolean;
  /** Current pencil-mark notes (1-9). */
  notes: Set<number>;
}

/** Snapshot of a puzzle for the UI to render. */
export interface Puzzle {
  /** The original puzzle with blanks as 0. */
  puzzle: Board;
  /** The fully solved board. */
  solution: Board;
  /** Difficulty that was used to generate this puzzle. */
  difficulty: Difficulty;
}

/** Approximate number of revealed (non-blank) cells per difficulty. */
export const DIFFICULTY_CLUES: Record<Difficulty, number> = {
  easy: 45,
  medium: 36,
  hard: 28,
};

/** Difficulty display metadata for the UI. */
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};
