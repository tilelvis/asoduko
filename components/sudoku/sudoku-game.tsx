"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Board as BoardArray, Difficulty, Puzzle } from "@/lib/sudoku/types";
import {
  DIFFICULTY_MAX_HINTS,
  DIFFICULTY_MAX_MISTAKES,
  DIFFICULTY_META,
} from "@/lib/sudoku/types";
import { findConflicts, generatePuzzle, isSolved } from "@/lib/sudoku/generator";
import {
  ENTRY_FEES,
  ERRORS_BONUS_MAX,
  HINTS_BONUS_MAX,
  SOLVE_REWARD_BASE,
  type RewardBreakdown,
} from "@/lib/alien/aln-store";
import { useAln } from "@/lib/alien/use-aln";
import { AlnStoreModal } from "@/components/alien/aln-store-modal";
import { CaveatModal } from "@/components/alien/caveat-modal";
import { RewardBreakdownModal } from "@/components/alien/reward-breakdown-modal";
import { WithdrawModal } from "@/components/alien/withdraw-modal";
import { TierBanner } from "@/components/sudoku/tier-banner";
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
  hint: boolean;
}

interface GameState {
  cells: CellState[];
  solution: BoardArray;
  difficulty: Difficulty;
  /** Unique seed for this game — sent to the server on claim so each game
   *  can only be claimed once. Generated client-side, validated server-side. */
  gameSeed: string;
  selectedIndex: number;
  notesMode: boolean;
  mistakes: number;
  maxMistakes: number;
  hintsLeft: number;
  maxHints: number;
  history: HistoryEntry[];
  status: "playing" | "won" | "lost";
}

interface HistoryEntry {
  index: number;
  prevValue: number;
  prevNotes: Set<number>;
  prevMistakes: number;
}

// ---------- helpers ----------

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
  | { type: "set_difficulty"; difficulty: Difficulty }
  | { type: "purge_errors" }
  | { type: "refill_hints" };

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
        const notes = new Set(cells[idx].notes);
        if (notes.has(action.value)) notes.delete(action.value);
        else notes.add(action.value);
        cells[idx].notes = notes;
        return { ...state, cells, history };
      }

      cells[idx].notes = new Set();
      cells[idx].value = action.value;
      cells[idx].hint = false;

      let mistakes = state.mistakes;
      if (action.value !== state.solution[idx]) {
        mistakes = state.mistakes + 1;
      }

      const boardNow: BoardArray = cells.map((c) => c.value);
      const won = isSolved(boardNow, state.solution);
      const lost = mistakes >= state.maxMistakes && !won;

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

    case "toggle_notes":
      return { ...state, notesMode: !state.notesMode };

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
        status: "playing",
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

    case "set_difficulty":
      return { ...state, difficulty: action.difficulty };

    case "purge_errors": {
      // Caveat: reset mistake counter to 0 and revive a lost game.
      // Does NOT touch the board state — only the budget.
      if (state.mistakes === 0 && state.status === "playing") return state;
      return {
        ...state,
        mistakes: 0,
        status: "playing",
      };
    }

    case "refill_hints": {
      // Caveat: restore hints to the tier maximum.
      if (state.hintsLeft >= state.maxHints) return state;
      return { ...state, hintsLeft: state.maxHints };
    }

    case "new_game": {
      const cells = buildFromPuzzle(action.puzzle);
      return {
        cells,
        solution: action.puzzle.solution,
        difficulty: action.puzzle.difficulty,
        gameSeed: crypto.randomUUID(),
        selectedIndex: -1,
        notesMode: false,
        mistakes: 0,
        maxMistakes: DIFFICULTY_MAX_MISTAKES[action.puzzle.difficulty],
        hintsLeft: DIFFICULTY_MAX_HINTS[action.puzzle.difficulty],
        maxHints: DIFFICULTY_MAX_HINTS[action.puzzle.difficulty],
        history: [],
        status: "playing",
      };
    }

    default:
      return state;
  }
}

// ---------- component ----------

/**
 * Build an empty initial state — puzzle is generated client-side after mount
 * to avoid SSR hydration mismatch (Math.random differs between server and
 * client).
 */
function createEmptyInitialState(difficulty: Difficulty): GameState {
  return {
    cells: Array.from({ length: 81 }, () => ({
      value: 0,
      given: false,
      notes: new Set<number>(),
      hint: false,
    })),
    solution: new Array(81).fill(0),
    difficulty,
    gameSeed: "",
    selectedIndex: -1,
    notesMode: false,
    mistakes: 0,
    maxMistakes: DIFFICULTY_MAX_MISTAKES[difficulty],
    hintsLeft: DIFFICULTY_MAX_HINTS[difficulty],
    maxHints: DIFFICULTY_MAX_HINTS[difficulty],
    history: [],
    status: "playing",
  };
}

export function SudokuGame() {
  const [state, dispatch] = useReducer(
    reducer,
    "rookie" as Difficulty,
    createEmptyInitialState,
  );
  const [elapsed, setElapsed] = useState(0);
  const [generating, setGenerating] = useState(true);
  const [storeOpen, setStoreOpen] = useState(false);
  const [caveatOpen, setCaveatOpen] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [lastBreakdown, setLastBreakdown] = useState<RewardBreakdown | null>(null);
  const [entryDenied, setEntryDenied] = useState<Difficulty | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(false);
  const aln = useAln();
  const prevStatusRef = useRef<typeof state.status>("playing");
  // Track hints used at the moment of the win — set when the win triggers,
  // so the reward breakdown shows the correct count even after state resets.
  const winSnapshotRef = useRef<{ hintsUsed: number; mistakes: number } | null>(null);

  // Generate the first puzzle on mount (client-only). Rookie is free.
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const puzzle = generatePuzzle("rookie");
    dispatch({ type: "new_game", puzzle });
    setGenerating(false);
  }, []);

  // ---------- award ALN with skill multipliers when the puzzle is solved ----------
  useEffect(() => {
    if (
      prevStatusRef.current === "playing" &&
      state.status === "won" &&
      state.gameSeed // ensure we have a seed to claim with
    ) {
      const hintsUsed = Math.max(0, state.maxHints - state.hintsLeft);
      winSnapshotRef.current = { hintsUsed, mistakes: state.mistakes };
      // awardSolve is async — fire and forget, store the breakdown when it resolves.
      let cancelled = false;
      aln
        .awardSolve({
          difficulty: state.difficulty,
          mistakes: state.mistakes,
          maxMistakes: state.maxMistakes,
          hintsUsed,
          maxHints: state.maxHints,
          gameSeed: state.gameSeed,
        })
        .then((result) => {
          if (cancelled || !result) return;
          setLastBreakdown({
            base: 0, // not returned from server; computed client-side below
            hintsUsed,
            maxHints: state.maxHints,
            hintsMultiplier: 1,
            hintsBonus: 0,
            mistakes: state.mistakes,
            maxMistakes: state.maxMistakes,
            errorsMultiplier: 1,
            errorsBonus: 0,
            grossReward: result.grossReward,
            capped: result.capped,
            capApplied: result.capApplied,
            netReward: result.netReward,
            dailyEarnedBefore: 0,
            dailyEarnedAfter: 0,
            dailyCap: aln.daily.cap,
          });
          const t = setTimeout(() => setRewardOpen(true), 1100);
          return () => clearTimeout(t);
        });
      return () => {
        cancelled = true;
      };
    }
    prevStatusRef.current = state.status;
  }, [state.status, state.difficulty, state.mistakes, state.maxMistakes, state.hintsLeft, state.maxHints, state.gameSeed, aln]);

  // ---------- apply active tier's accent color to <html> CSS vars ----------
  useEffect(() => {
    const meta = DIFFICULTY_META[state.difficulty];
    const root = document.documentElement;
    root.style.setProperty("--accent", meta.accent);
    root.style.setProperty("--accent-2", meta.accent2);
    root.style.setProperty("--accent-soft", hexToRgba(meta.accent, 0.5));
    root.style.setProperty("--accent-faint", hexToRgba(meta.accent, 0.15));
  }, [state.difficulty]);

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
  // Charges the entry fee (if any). If the player can't afford the tier,
  // they're bumped down to Rookie (free) and shown an "entry denied" notice.
  const startNewGame = useCallback(
    (difficulty: Difficulty) => {
      const fee = ENTRY_FEES[difficulty] ?? 0;
      if (!aln.chargeEntry(difficulty)) {
        // Can't afford — fall back to Rookie.
        setEntryDenied(difficulty);
        setTimeout(() => setEntryDenied(null), 4000);
        const fallback: Difficulty = "rookie";
        setGenerating(true);
        setElapsed(0);
        setTimeout(() => {
          const puzzle = generatePuzzle(fallback);
          dispatch({ type: "new_game", puzzle });
          setGenerating(false);
        }, 10);
        return;
      }
      setGenerating(true);
      setElapsed(0);
      setTimeout(() => {
        const puzzle = generatePuzzle(difficulty);
        dispatch({ type: "new_game", puzzle });
        setGenerating(false);
      }, 10);
    },
    [aln],
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

  // ---------- caveat handlers (called by CaveatModal after ALN spend) ----------
  const handlePurgeErrors = useCallback(() => {
    dispatch({ type: "purge_errors" });
    setCaveatOpen(false);
  }, []);
  const handleRefillHints = useCallback(() => {
    dispatch({ type: "refill_hints" });
  }, []);

  const handleHint = useCallback(() => {
    if (state.hintsLeft <= 0) return;
    let target = state.selectedIndex;
    if (
      target < 0 ||
      state.cells[target].given ||
      state.cells[target].value === state.solution[target]
    ) {
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
      } else if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
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
          idx % 9 === sel % 9 ||
          (Math.floor(idx / 27) === Math.floor(sel / 27) &&
            Math.floor((idx % 9) / 3) === Math.floor((sel % 9) / 3)));
      const sameValue = !selected && selValue > 0 && cell.value === selValue;
      const conflict = cell.value !== 0 && findConflicts(board, idx).length > 0;
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

  const showOverlay = state.status === "won" || state.status === "lost";

  // Compute the live potential payout (mirrors RewardPreview / computeReward
  // but without writing to the store — just for the chip display).
  const potentialPayout = useMemo(() => {
    const base = SOLVE_REWARD_BASE[state.difficulty] ?? 5;
    const hintsUsed = Math.max(0, state.maxHints - state.hintsLeft);
    const hintsSlack = state.maxHints > 0 ? 1 - hintsUsed / state.maxHints : 1;
    const errorsSlack =
      state.maxMistakes > 0 ? 1 - state.mistakes / state.maxMistakes : 1;
    const hintsMult = 1 + HINTS_BONUS_MAX * hintsSlack;
    const errorsMult = 1 + ERRORS_BONUS_MAX * errorsSlack;
    const gross = Math.round(base * hintsMult * errorsMult);
    const remaining = Math.max(0, aln.daily.cap - aln.daily.earned);
    return Math.min(gross, remaining);
  }, [state.difficulty, state.mistakes, state.maxMistakes, state.hintsLeft, state.maxHints, aln.daily]);

  // Listen for the open-caveats / open-store / open-withdraw events dispatched
  // by the compact Controls action buttons.
  useEffect(() => {
    const openCaveats = () => setCaveatOpen(true);
    const openStore = () => setStoreOpen(true);
    const openWithdraw = () => setWithdrawOpen(true);
    window.addEventListener("sudoku:open-caveats", openCaveats);
    window.addEventListener("sudoku:open-store", openStore);
    window.addEventListener("sudoku:open-withdraw", openWithdraw);
    return () => {
      window.removeEventListener("sudoku:open-caveats", openCaveats);
      window.removeEventListener("sudoku:open-store", openStore);
      window.removeEventListener("sudoku:open-withdraw", openWithdraw);
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <TierBanner
        difficulty={state.difficulty}
        onDifficultyChange={handleDifficultyChange}
        alnBalance={aln.hydrated ? aln.balance : 0}
      />
      <Controls
        onNewGame={handleNewGame}
        elapsedSeconds={elapsed}
        mistakes={state.mistakes}
        maxMistakes={state.maxMistakes}
        onHint={handleHint}
        hintsLeft={state.hintsLeft}
        potentialPayout={potentialPayout}
        dailyEarned={aln.daily.earned}
        dailyCap={aln.daily.cap}
      />

      {/* Entry-denied notice — shown briefly when the player can't afford a tier */}
      {entryDenied && (
        <div
          className="shrink-0 rounded-md border px-2 py-1 font-mono text-[10px]"
          style={{
            borderColor: "rgba(251,113,133,0.5)",
            background: "rgba(251,113,133,0.1)",
            color: "#fb7185",
          }}
        >
          ⚠ Need {ENTRY_FEES[entryDenied]} ALN for {DIFFICULTY_META[entryDenied].label} — falling back to Rookie.
        </div>
      )}

      {/* Board — flex-1 claims all remaining vertical space.
          aspect-square keeps it square; max-h-full prevents overflow. */}
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="relative aspect-square w-full max-h-full">
          <Board cells={renderCells} onCellClick={handleCellClick} />

          {generating && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-[rgba(5,8,19,0.85)] backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <div className="orbit-spin h-7 w-7 rounded-full border-2 border-[var(--grid-line)] border-t-[var(--accent)]" />
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.3em]"
                  style={{ color: "var(--accent)" }}
                >
                  Calibrating…
                </p>
              </div>
            </div>
          )}

          {showOverlay && !generating && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-[rgba(5,8,19,0.92)] backdrop-blur-md">
              <div className="flex flex-col items-center gap-2 px-4 text-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2"
                  style={{
                    borderColor:
                      state.status === "won"
                        ? "rgba(52,211,153,0.7)"
                        : "rgba(251,113,133,0.7)",
                    boxShadow:
                    state.status === "won"
                      ? "0 0 24px rgba(52,211,153,0.5)"
                      : "0 0 24px rgba(251,113,133,0.5)",
                  color:
                    state.status === "won" ? "#34d399" : "#fb7185",
                }}
              >
                {state.status === "won" ? (
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                )}
              </div>
              <div>
                <p
                  className="font-mono text-sm font-semibold uppercase tracking-wider"
                  style={{
                    color:
                      state.status === "won" ? "#34d399" : "#fb7185",
                    textShadow:
                      state.status === "won"
                        ? "0 0 10px rgba(52,211,153,0.6)"
                        : "0 0 10px rgba(251,113,133,0.6)",
                  }}
                >
                  {state.status === "won"
                    ? "Signal resolved"
                    : "Grid overloaded"}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
                  {state.status === "won"
                    ? `${formatElapsed(elapsed)} · ${DIFFICULTY_META[state.difficulty].label}`
                    : "Try again or purge."}
                </p>
              </div>
              <div className="mt-1 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleNewGame}
                  className="rounded-md border px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-all"
                  style={{
                    borderColor: "var(--accent)",
                    background: "var(--accent)",
                    color: "#050813",
                    boxShadow: "0 0 12px var(--accent-soft)",
                  }}
                >
                  New Mission
                </button>

                {state.status === "lost" && (
                  <button
                    type="button"
                    onClick={() => setCaveatOpen(true)}
                    disabled={aln.balance < aln.purgeCost(state.difficulty)}
                    className="rounded-md border border-[rgba(251,191,36,0.5)] bg-[rgba(251,191,36,0.1)] px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-[#fbbf24] transition-all hover:bg-[rgba(251,191,36,0.2)] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      boxShadow:
                        aln.balance >= aln.purgeCost(state.difficulty)
                          ? "0 0 8px rgba(251,191,36,0.3)"
                          : "none",
                    }}
                  >
                    {aln.balance >= aln.purgeCost(state.difficulty)
                      ? `Purge · ${aln.purgeCost(state.difficulty)} ALN`
                      : `Need ${aln.purgeCost(state.difficulty)} ALN`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
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

      {/* ALN Store + Caveats + Reward breakdown + Withdraw modals */}
      <AlnStoreModal open={storeOpen} onClose={() => setStoreOpen(false)} />
      <CaveatModal
        open={caveatOpen}
        onClose={() => setCaveatOpen(false)}
        difficulty={state.difficulty}
        currentMistakes={state.mistakes}
        maxMistakes={state.maxMistakes}
        currentHints={state.hintsLeft}
        maxHints={state.maxHints}
        onPurgeErrors={handlePurgeErrors}
        onRefillHints={handleRefillHints}
      />
      <RewardBreakdownModal
        open={rewardOpen}
        onClose={() => setRewardOpen(false)}
        breakdown={lastBreakdown}
        difficultyLabel={DIFFICULTY_META[state.difficulty].label}
      />
      <WithdrawModal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
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

/** Convert "#22d3ee" + alpha → "rgba(34,211,238,alpha)". */
function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16);
  const g = parseInt(m.substring(2, 4), 16);
  const b = parseInt(m.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
