import { SudokuGame } from "@/components/sudoku/sudoku-game";

export default function Home() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1
              className="font-mono text-xl font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]"
              style={{ textShadow: "0 0 12px var(--accent-faint)" }}
            >
              Sudoku
            </h1>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--foreground-dim)]">
              v2.0
            </span>
          </div>
          <span
            className="rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.25em]"
            style={{
              borderColor: "var(--accent-soft)",
              color: "var(--accent)",
              background: "var(--accent-faint)",
              boxShadow: "0 0 8px var(--accent-faint)",
            }}
          >
            Alien · Mini App
          </span>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
          Decode the signal · fill the void
        </p>
      </header>

      <SudokuGame />

      <footer className="mt-auto pt-4 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--foreground-dim)]">
        Bridge online · deploy on Vercel
      </footer>
    </>
  );
}
