/**
 * Sudoku solver — backtracking with constraint checking.
 * Used internally by the generator to produce a valid full solution
 * and to verify uniqueness of generated puzzles.
 */

import type { Board } from "./types";

/** Returns true if placing `num` at `index` is valid for the board. */
export function isValidPlacement(board: Board, index: number, num: number): boolean {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;

  for (let i = 0; i < 9; i++) {
    // same row
    if (board[row * 9 + i] === num) return false;
    // same column
    if (board[i * 9 + col] === num) return false;
  }

  // same 3x3 box
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (board[(boxRow + r) * 9 + (boxCol + c)] === num) return false;
    }
  }
  return true;
}

/** Find the index of the next empty cell, or -1 if the board is full. */
export function findEmpty(board: Board): number {
  for (let i = 0; i < 81; i++) {
    if (board[i] === 0) return i;
  }
  return -1;
}

/** Solve the board in place using backtracking. Returns true if solved. */
export function solve(board: Board): boolean {
  const index = findEmpty(board);
  if (index === -1) return true; // no empty cells → solved

  // Try digits 1-9 in random order so each call produces a different
  // valid solution — used by the generator to seed random full boards.
  const order = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const num of order) {
    if (isValidPlacement(board, index, num)) {
      board[index] = num;
      if (solve(board)) return true;
      board[index] = 0;
    }
  }
  return false;
}

/** Count the number of distinct solutions (capped at `cap`, default 2). */
export function countSolutions(board: Board, cap = 2): number {
  let count = 0;
  const work = board.slice();

  const backtrack = (): void => {
    if (count >= cap) return;
    const index = findEmpty(work);
    if (index === -1) {
      count++;
      return;
    }
    for (let num = 1; num <= 9; num++) {
      if (isValidPlacement(work, index, num)) {
        work[index] = num;
        backtrack();
        work[index] = 0;
        if (count >= cap) return;
      }
    }
  };

  backtrack();
  return count;
}

/** Check whether a complete board is well-formed (every cell 1-9, no conflicts). */
export function isComplete(board: Board): boolean {
  if (board.length !== 81) return false;
  for (let i = 0; i < 81; i++) {
    const v = board[i];
    if (v < 1 || v > 9) return false;
    if (!isValidPlacement(board, i, v)) return false;
  }
  return true;
}

/** Fisher–Yates shuffle. */
function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
