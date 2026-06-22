import { SudokuGame } from "@/components/sudoku/sudoku-game";

export default function Home() {
  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1
            className="font-mono text-base font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]"
            style={{ textShadow: "0 0 12px var(--accent-faint)" }}
          >
            Sudoku
          </h1>
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--foreground-dim)]">
            v2.0
          </span>
        </div>
        <span
          className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]"
          style={{
            borderColor: "var(--accent-soft)",
            color: "var(--accent)",
            background: "var(--accent-faint)",
            boxShadow: "0 0 6px var(--accent-faint)",
          }}
        >
          Alien Miniapp
        </span>
      </header>

      <SudokuGame />

      <footer className="shrink-0 text-center font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--foreground-dim)]">
        Powered by Alien Miniapps SDK
      </footer>
    </>
  );
}
