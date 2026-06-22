"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Board as BoardArray, Difficulty, Puzzle } from "@/lib/sudoku/types";
import {
  findConflicts,
  generatePuzzle,
  isSolved,
} from "@/lib/sudoku/generator";
import { Board, type CellRenderMeta } from "./board";
import { NumberPad } from "./number-pad";
import { Controls } from "./controls";

/**
 * Per-cell metadata. We keep this in the reducer state alongside the board so
 * the UI can render highlights / notes / given flag without recomputing.
 */
interface CellState {
  value: number;
  given: boolean;
  notes: Set<number>;
  hint: boolean; // revealed by a hint
}

interface GameState {
  cells: CellState[]; // length 81
  solution: BoardArray;
  difficulty: Difficulty;
  selectedIndex: number;
  notesMode: boolean;
  mistakes: number;
  hintsLeft: number;
  history: HistoryEntry[];
  status: "playing" | "won" | "lost";
}

interface HistoryEntry {
  index: number;
  prevValue: number;
  prevNotes: Set<number>;
  prevMistakes: number;
}

const MAX_MISTAKES = 5;
const MAX_HINTS = 3;

// ---------- helpers ----------

function emptyCellStates(): CellState[] {
  return Array.from({ length: 81 }, () => ({
    value: 0,
    given: false,
    notes: new Set<number>(),
    hint: false,
  }));
}

function buildFromPuzzle(p: Puzzle): CellState[] {
  return p.puzzle.map((v) => ({
    value: v,
    given: v !== 0,
    notes: new Set<number>(),
    hint: false,
  }));
}

function cloneCells(cells: CellState[]): CellState[] {
  return cells.map((c) => ({
    value: c.value,
    given: c.given,
    notes: new Set(c.notes),
    hint: c.hint,
  }));
}

function countDigits(cells: CellState[]): number[] {
  const counts = new Array(10).fill(0);
  for (const c of cells) {
    if (c.value > 0) counts[c.value]++;
  }
  // remaining = 9 - already-placed
  return counts.map((n) => 9 - n);
}

// ---------- reducer ----------

type Action =
  | { type: "select"; index: number }
  | { type: "place"; value: number }
  | { type: "erase" }
  | { type: "toggle_notes" }
  | { type: "undo" }
  | { type: "hint"; index: number; value: number }
  | { type: "new_game"; puzzle: Puzzle }
  | { type: "set_difficulty"; difficulty: Difficulty };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "select": {
      if (state.status !== "playing") return state;
      return { ...state, selectedIndex: action.index };
    }

    case "place": {
      if (state.status !== "playing") return state;
      const idx = state.selectedIndex;
      if (idx < 0) return state;
      const cell = state.cells[idx];
      if (cell.given) return state;

      const cells = cloneCells(state.cells);
      const history = state.history.slice();
      history.push({
        index: idx,
        prevValue: cell.value,
        prevNotes: new Set(cell.notes),
        prevMistakes: state.mistakes,
      });

      if (state.notesMode && cells[idx].value === 0) {
        // Toggle the digit in the notes set.
        const notes = new Set(cells[idx].notes);
        if (notes.has(action.value)) notes.delete(action.value);
        else notes.add(action.value);
        cells[idx].notes = notes;
        return { ...state, cells, history };
      }

      // Normal placement.
      cells[idx].notes = new Set();
      cells[idx].value = action.value;
      cells[idx].hint = false;

      // Mistake tracking.
      let mistakes = state.mistakes;
      if (action.value !== state.solution[idx]) {
        mistakes = state.mistakes + 1;
      }

      // Win check.
      const boardNow: BoardArray = cells.map((c) => c.value);
      const won = isSolved(boardNow, state.solution);
      const lost = mistakes >= MAX_MISTAKES && !won;

      return {
        ...state,
        cells,
        history,
        mistakes,
        status: won ? "won" : lost ? "lost" : "playing",
      };
    }

    case "erase": {
      if (state.status !== "playing") return state;
      const idx = state.selectedIndex;
      if (idx < 0) return state;
      const cell = state.cells[idx];
      if (cell.given) return state;
      if (cell.value === 0 && cell.notes.size === 0) return state;

      const cells = cloneCells(state.cells);
      const history = state.history.slice();
      history.push({
        index: idx,
        prevValue: cell.value,
        prevNotes: new Set(cell.notes),
        prevMistakes: state.mistakes,
      });
      cells[idx].value = 0;
      cells[idx].notes = new Set();
      cells[idx].hint = false;
      return { ...state, cells, history };
    }

    case "toggle_notes": {
      return { ...state, notesMode: !state.notesMode };
    }

    case "undo": {
      if (state.history.length === 0) return state;
      const last = state.history[state.history.length - 1];
      const cells = cloneCells(state.cells);
      cells[last.index].value = last.prevValue;
      cells[last.index].notes = new Set(last.prevNotes);
      cells[last.index].hint = false;
      return {
        ...state,
        cells,
        history: state.history.slice(0, -1),
        mistakes: last.prevMistakes,
        status: "playing", // undoing can never end the game
        selectedIndex: last.index,
      };
    }

    case "hint": {
      if (state.status !== "playing") return state;
      if (state.hintsLeft <= 0) return state;
      const idx = action.index;
      const cell = state.cells[idx];
      if (cell.given || cell.value === state.solution[idx]) return state;

      const cells = cloneCells(state.cells);
      const history = state.history.slice();
      history.push({
        index: idx,
        prevValue: cell.value,
        prevNotes: new Set(cell.notes),
        prevMistakes: state.mistakes,
      });
      cells[idx].value = action.value;
      cells[idx].notes = new Set();
      cells[idx].hint = true;

      const boardNow: BoardArray = cells.map((c) => c.value);
      const won = isSolved(boardNow, state.solution);

      return {
        ...state,
        cells,
        history,
        hintsLeft: state.hintsLeft - 1,
        status: won ? "won" : "playing",
      };
    }

    case "set_difficulty": {
      // Don't reset immediately — the component triggers a new game.
      return { ...state, difficulty: action.difficulty };
    }

    case "new_game": {
      const cells = buildFromPuzzle(action.puzzle);
      return {
        cells,
        solution: action.puzzle.solution,
        difficulty: action.puzzle.difficulty,
        selectedIndex: -1,
        notesMode: false,
        mistakes: 0,
        hintsLeft: MAX_HINTS,
        history: [],
        status: "playing",
      };
    }

    default:
      return state;
  }
}

// ---------- component ----------

function createInitialState(difficulty: Difficulty): GameState {
  const puzzle = generatePuzzle(difficulty);
  return {
    cells: buildFromPuzzle(puzzle),
    solution: puzzle.solution,
    difficulty,
    selectedIndex: -1,
    notesMode: false,
    mistakes: 0,
    hintsLeft: MAX_HINTS,
    history: [],
    status: "playing",
  };
}

export function SudokuGame() {
  // Lazily create the initial puzzle on first render.
  const [state, dispatch] = useReducer(
    reducer,
    "easy" as Difficulty,
    createInitialState,
  );
  const [elapsed, setElapsed] = useState(0);
  const [generating, setGenerating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- timer ----------
  useEffect(() => {
    if (state.status === "playing" && !generating) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return undefined;
  }, [state.status, generating]);

  // ---------- new game ----------
  const startNewGame = useCallback(
    (difficulty: Difficulty) => {
      setGenerating(true);
      setElapsed(0);
      // Generation can take ~50-300ms — defer to the next tick so the UI
      // can show a loading state without blocking the main thread.
      setTimeout(() => {
        const puzzle = generatePuzzle(difficulty);
        dispatch({ type: "new_game", puzzle });
        setGenerating(false);
      }, 10);
    },
    [],
  );

  const handleNewGame = useCallback(() => {
    startNewGame(state.difficulty);
  }, [startNewGame, state.difficulty]);

  const handleDifficultyChange = useCallback(
    (d: Difficulty) => {
      dispatch({ type: "set_difficulty", difficulty: d });
      startNewGame(d);
    },
    [startNewGame],
  );

  // ---------- selection & input ----------
  const handleCellClick = useCallback((index: number) => {
    dispatch({ type: "select", index });
  }, []);

  const handleDigit = useCallback(
    (n: number) => dispatch({ type: "place", value: n }),
    [],
  );
  const handleErase = useCallback(() => dispatch({ type: "erase" }), []);
  const handleToggleNotes = useCallback(
    () => dispatch({ type: "toggle_notes" }),
    [],
  );
  const handleUndo = useCallback(() => dispatch({ type: "undo" }), []);

  const handleHint = useCallback(() => {
    if (state.hintsLeft <= 0) return;
    // Prefer the currently selected cell if it's empty or wrong; otherwise
    // find the first empty cell.
    let target = state.selectedIndex;
    if (
      target < 0 ||
      state.cells[target].given ||
      state.cells[target].value === state.solution[target]
    ) {
      target = state.cells.findIndex(
        (c) => !c.given && c.value !== state.solution[c.value !== 0 ? 0 : 0],
      );
      // simpler: first empty non-given cell
      target = state.cells.findIndex(
        (c, i) => !c.given && c.value !== state.solution[i],
      );
    }
    if (target < 0) return;
    dispatch({ type: "hint", index: target, value: state.solution[target] });
  }, [state.selectedIndex, state.cells, state.solution, state.hintsLeft]);

  // ---------- keyboard input ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.status !== "playing") return;
      if (e.key >= "1" && e.key <= "9") {
        dispatch({ type: "place", value: parseInt(e.key, 10) });
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        dispatch({ type: "erase" });
      } else if (e.key === "n" || e.key === "N") {
        dispatch({ type: "toggle_notes" });
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dispatch({ type: "undo" });
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const cur = state.selectedIndex < 0 ? 0 : state.selectedIndex;
        const row = Math.floor(cur / 9);
        const col = cur % 9;
        let nr = row;
        let nc = col;
        if (e.key === "ArrowUp") nr = (row + 8) % 9;
        if (e.key === "ArrowDown") nr = (row + 1) % 9;
        if (e.key === "ArrowLeft") nc = (col + 8) % 9;
        if (e.key === "ArrowRight") nc = (col + 1) % 9;
        dispatch({ type: "select", index: nr * 9 + nc });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.status, state.selectedIndex]);

  // ---------- derived render metadata ----------
  const renderCells: CellRenderMeta[] = useMemo(() => {
    const sel = state.selectedIndex;
    const selValue = sel >= 0 ? state.cells[sel].value : 0;
    const board: BoardArray = state.cells.map((c) => c.value);

    return state.cells.map((cell, idx) => {
      const selected = idx === sel;
      const highlighted =
        sel >= 0 &&
        !selected &&
        (Math.floor(idx / 9) === Math.floor(sel / 9) ||
          (idx % 9) === (sel % 9) ||
          (Math.floor(idx / 27) === Math.floor(sel / 27) &&
            Math.floor((idx % 9) / 3) === Math.floor((sel % 9) / 3)));
      const sameValue = !selected && selValue > 0 && cell.value === selValue;
      const conflict =
        cell.value !== 0 && findConflicts(board, idx).length > 0;
      return {
        value: cell.value,
        notes: Array.from(cell.notes).sort((a, b) => a - b),
        given: cell.given,
        selected,
        highlighted,
        sameValue,
        conflict,
        hint: cell.hint,
      };
    });
  }, [state.cells, state.selectedIndex]);

  const digitCounts = useMemo(() => countDigits(state.cells), [state.cells]);

  // ---------- win/lose banner ----------
  const showOverlay = state.status === "won" || state.status === "lost";

  return (
    <div className="flex flex-col gap-4">
      <Controls
        difficulty={state.difficulty}
        onDifficultyChange={handleDifficultyChange}
        onNewGame={handleNewGame}
        elapsedSeconds={elapsed}
        mistakes={state.mistakes}
        maxMistakes={MAX_MISTAKES}
        onHint={handleHint}
        hintsLeft={state.hintsLeft}
      />

      <div className="relative">
        <Board cells={renderCells} onCellClick={handleCellClick} />

        {generating && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-sm dark:bg-zinc-950/70">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-indigo-900 dark:border-t-indigo-300" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Generating puzzle…
              </p>
            </div>
          </div>
        )}

        {showOverlay && !generating && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/85 backdrop-blur-sm dark:bg-zinc-950/85">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <div
                className={[
                  "flex h-14 w-14 items-center justify-center rounded-full",
                  state.status === "won"
                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
                ].join(" ")}
              >
                {state.status === "won" ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {state.status === "won" ? "You solved it!" : "Out of mistakes"}
                </p>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {state.status === "won"
                    ? `Time: ${formatElapsed(elapsed)}`
                    : "Better luck next round."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleNewGame}
                className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>

      <NumberPad
        counts={digitCounts}
        notesMode={state.notesMode}
        onDigit={handleDigit}
        onErase={handleErase}
        onToggleNotes={handleToggleNotes}
        onUndo={handleUndo}
        canUndo={state.history.length > 0}
      />
    </div>
  );
}

function formatElapsed(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
