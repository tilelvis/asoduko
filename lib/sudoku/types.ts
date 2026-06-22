/**
 * Sudoku core types
 */

/** A single cell value: 0 = empty, 1-9 = the digit. */
export type CellValue = number;

/** A 9x9 board represented as a flat array of 81 numbers. */
export type Board = CellValue[];

/**
 * Six progressive difficulty tiers, themed as ranks in an interstellar
 * exploration programme. Each tier drops more clues and tightens the
 * mistake budget, so the player must climb the ladder.
 */
export type Difficulty =
  | "rookie" // 50 clues — gentle intro
  | "cadet" // 42 clues
  | "operative" // 36 clues — equivalent to classic "Medium"
  | "commander" // 30 clues
  | "architect" // 26 clues — equivalent to classic "Hard"
  | "transcendent"; // 22 clues — extreme

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

/** Approximate number of revealed (non-blank) cells per difficulty tier. */
export const DIFFICULTY_CLUES: Record<Difficulty, number> = {
  rookie: 50,
  cadet: 42,
  operative: 36,
  commander: 30,
  architect: 26,
  transcendent: 22,
};

/** Mistake budget per tier — harder tiers are less forgiving. */
export const DIFFICULTY_MAX_MISTAKES: Record<Difficulty, number> = {
  rookie: 7,
  cadet: 6,
  operative: 5,
  commander: 4,
  architect: 3,
  transcendent: 3,
};

/** Hints allowed per tier — harder tiers give fewer hints. */
export const DIFFICULTY_MAX_HINTS: Record<Difficulty, number> = {
  rookie: 5,
  cadet: 4,
  operative: 3,
  commander: 2,
  architect: 2,
  transcendent: 1,
};

/** Ordered list of all difficulties, lowest → highest. */
export const DIFFICULTY_ORDER: Difficulty[] = [
  "rookie",
  "cadet",
  "operative",
  "commander",
  "architect",
  "transcendent",
];

/** Display metadata for each difficulty tier. */
export interface DifficultyMeta {
  label: string;
  /** Short tagline shown in the UI. */
  tagline: string;
  /** Glow accent color (hex or CSS color). */
  accent: string;
  /** Secondary accent for gradients. */
  accent2: string;
}

export const DIFFICULTY_META: Record<Difficulty, DifficultyMeta> = {
  rookie: {
    label: "Rookie",
    tagline: "First contact",
    accent: "#22d3ee", // cyan
    accent2: "#0891b2",
  },
  cadet: {
    label: "Cadet",
    tagline: "Orbital training",
    accent: "#34d399", // emerald
    accent2: "#059669",
  },
  operative: {
    label: "Operative",
    tagline: "Field deployment",
    accent: "#a3e635", // lime
    accent2: "#65a30d",
  },
  commander: {
    label: "Commander",
    tagline: "Sector authority",
    accent: "#fbbf24", // amber
    accent2: "#d97706",
  },
  architect: {
    label: "Architect",
    tagline: "Mind of the hive",
    accent: "#fb7185", // rose
    accent2: "#e11d48",
  },
  transcendent: {
    label: "Transcendent",
    tagline: "Beyond computation",
    accent: "#c084fc", // violet
    accent2: "#9333ea",
  },
};

/** Convenience: human label. */
export const DIFFICULTY_LABEL: Record<Difficulty, string> = Object.fromEntries(
  Object.entries(DIFFICULTY_META).map(([k, v]) => [k, v.label]),
) as Record<Difficulty, string>;
