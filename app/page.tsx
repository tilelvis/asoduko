import { SudokuGame } from "@/components/sudoku/sudoku-game";

export default function Home() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Sudoku
          </h1>
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            Alien Mini App
          </span>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Tap a cell, then a digit. Long-press the Alien app for more.
        </p>
      </header>

      <SudokuGame />

      <footer className="mt-auto pt-4 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
        Built with the Alien Mini App SDK · Deploy on Vercel
      </footer>
    </>
  );
}
