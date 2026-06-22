/**
 * Sudoku puzzle generator.
 *
 * Strategy:
 *  1. Start from an empty board and use the backtracking solver with
 *     randomised digit order to produce a fully solved, valid grid.
 *  2. Remove cells one at a time (in random order) while checking that
 *     the puzzle still has a unique solution. Stop when the target
 *     number of clues (revealed cells) is reached or no more removable
 *     cells can be removed without breaking uniqueness.
 */

import type { Board, Difficulty, Puzzle } from "./types";
import { DIFFICULTY_CLUES } from "./types";
import { countSolutions, isValidPlacement, solve } from "./solver";

/** Generate a random fully-solved 9x9 Sudoku board. */
export function generateSolvedBoard(): Board {
  const board: Board = new Array(81).fill(0);
  solve(board);
  return board;
}

/**
 * Generate a puzzle for the requested difficulty.
 * Returns the puzzle (with blanks as 0), the full solution, and difficulty.
 */
export function generatePuzzle(difficulty: Difficulty): Puzzle {
  const solution = generateSolvedBoard();
  const puzzle = solution.slice();
  const targetClues = DIFFICULTY_CLUES[difficulty];

  // Build a shuffled list of all 81 indices so we remove cells in random order.
  const indices = shuffleIndices(Array.from({ length: 81 }, (_, i) => i));
  let cluesLeft = 81;

  for (const idx of indices) {
    if (cluesLeft <= targetClues) break;

    const backup = puzzle[idx];
    puzzle[idx] = 0;

    // Keep the removal only if the puzzle still has exactly one solution.
    const solutions = countSolutions(puzzle, 2);
    if (solutions !== 1) {
      puzzle[idx] = backup; // restore — removing this would create ambiguity
    } else {
      cluesLeft--;
    }
  }

  return { puzzle, solution, difficulty };
}

/**
 * Check whether the player's current board matches the known solution.
 * Used by the UI to detect a win.
 */
export function isSolved(board: Board, solution: Board): boolean {
  for (let i = 0; i < 81; i++) {
    if (board[i] !== solution[i]) return false;
  }
  return true;
}

/**
 * Find indices of cells that conflict with the given cell's value.
 * Returns the list of peer cell indices (same row/col/box) that hold the
 * same value. The cell itself is NOT included.
 */
export function findConflicts(board: Board, index: number): number[] {
  const value = board[index];
  if (!value) return [];

  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;

  const conflicts = new Set<number>();

  for (let i = 0; i < 9; i++) {
    // row peers
    const rIdx = row * 9 + i;
    if (rIdx !== index && board[rIdx] === value) conflicts.add(rIdx);
    // column peers
    const cIdx = i * 9 + col;
    if (cIdx !== index && board[cIdx] === value) conflicts.add(cIdx);
  }
  // box peers
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const bIdx = (boxRow + r) * 9 + (boxCol + c);
      if (bIdx !== index && board[bIdx] === value) conflicts.add(bIdx);
    }
  }
  return Array.from(conflicts);
}

/** Convenience: returns true if `num` can be placed at `index` without conflict. */
export function canPlace(board: Board, index: number, num: number): boolean {
  if (num === 0) return true;
  return isValidPlacement(board, index, num);
}

/** Fisher–Yates shuffle on an array of numbers (in place). */
function shuffleIndices(arr: number[]): number[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
