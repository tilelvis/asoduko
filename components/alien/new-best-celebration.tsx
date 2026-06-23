"use client";

import { useEffect, useState, useMemo } from "react";
import type { Difficulty } from "@/lib/sudoku/types";
import { DIFFICULTY_META } from "@/lib/sudoku/types";

interface NewBestCelebrationProps {
  open: boolean;
  onClose: () => void;
  difficulty: Difficulty;
  rank: number;
  totalPlayers: number;
  score: number;
}

const CELEBRATION_ACCENT = "#a3e635"; // lime — celebration color

const CONFETTI_COLORS = [
  "#22d3ee", // cyan
  "#34d399", // emerald
  "#a3e635", // lime
  "#fbbf24", // amber
  "#fb7185", // rose
  "#c084fc", // violet
];

function rankBadge(rank: number): string {
  if (rank === 1) return "🥇 #1";
  if (rank === 2) return "🥈 #2";
  if (rank === 3) return "🥉 #3";
  return `#${rank}`;
}

/**
 * Full-screen celebration overlay shown when a player achieves a new
 * personal best on the leaderboard.
 *
 * Triggers:
 *   - The win useEffect in sudoku-game.tsx calls awardSolve(), which
 *     returns { isNewBest, leaderboardRank }.
 *   - If isNewBest is true, this component is rendered on top of the
 *     win overlay.
 *
 * Visuals:
 *   - Confetti rain (40 pieces, 6 neon colors, randomized fall)
 *   - "NEW PERSONAL BEST" pop-in with glowing text
 *   - Tier name in the tier's accent color
 *   - Rank badge (🥇/🥈/🥉 for top 3)
 *   - Score + total players
 *   - Auto-dismiss after 5s, or tap to dismiss
 */
export function NewBestCelebration({
  open,
  onClose,
  difficulty,
  rank,
  totalPlayers,
  score,
}: NewBestCelebrationProps) {
  const [visible, setVisible] = useState(false);

  // Generate confetti pieces once per open (memoized so they don't
  // regenerate on every render).
  const confetti = useMemo(() => {
    if (!open) return [];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2.5 + Math.random() * 2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
    }));
  }, [open]);

  useEffect(() => {
    if (open) {
      // Small delay so the win overlay settles first.
      const showTimer = setTimeout(() => setVisible(true), 200);
      const autoCloseTimer = setTimeout(() => {
        setVisible(false);
        setTimeout(onClose, 300);
      }, 5500);
      return () => {
        clearTimeout(showTimer);
        clearTimeout(autoCloseTimer);
      };
    }
    setVisible(false);
  }, [open, onClose]);

  if (!open) return null;

  const meta = DIFFICULTY_META[difficulty];
  const isTop3 = rank <= 3;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={() => {
        setVisible(false);
        setTimeout(onClose, 200);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="New personal best celebration"
    >
      {/* Dark backdrop */}
      <div
        className="absolute inset-0 bg-[rgba(5,8,19,0.9)] backdrop-blur-md"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s" }}
      />

      {/* Confetti rain */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map((piece) => (
          <div
            key={piece.id}
            className="confetti-piece"
            style={{
              left: `${piece.left}%`,
              backgroundColor: piece.color,
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
              transform: `rotate(${piece.rotate}deg)`,
              boxShadow: `0 0 4px ${piece.color}88`,
            }}
          />
        ))}
      </div>

      {/* Center content */}
      <div
        className="relative z-10 flex flex-col items-center gap-3 px-6 text-center"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.8)",
          transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Trophy / medal icon */}
        <div
          className="celebration-pop flex h-16 w-16 items-center justify-center rounded-full border-2"
          style={{
            borderColor: CELEBRATION_ACCENT,
            background: `radial-gradient(circle, ${CELEBRATION_ACCENT}33, transparent 70%)`,
            boxShadow: `0 0 24px ${CELEBRATION_ACCENT}55`,
            color: CELEBRATION_ACCENT,
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        </div>

        {/* "NEW PERSONAL BEST" headline */}
        <h2
          className="celebration-glow font-mono text-xl font-bold uppercase tracking-[0.2em]"
          style={{ color: CELEBRATION_ACCENT }}
        >
          New Personal Best!
        </h2>

        {/* Tier name */}
        <p
          className="font-mono text-sm uppercase tracking-[0.25em]"
          style={{ color: meta.accent, textShadow: `0 0 8px ${meta.accent}66` }}
        >
          {meta.label} tier
        </p>

        {/* Rank badge */}
        <div
          className="rank-slide-up flex items-center gap-3 rounded-md border px-4 py-2"
          style={{
            borderColor: isTop3 ? `${CELEBRATION_ACCENT}88` : "var(--grid-line)",
            background: isTop3 ? `${CELEBRATION_ACCENT}11` : "var(--background-cell)",
            boxShadow: isTop3 ? `0 0 16px ${CELEBRATION_ACCENT}33` : "none",
          }}
        >
          <span
            className="font-mono text-2xl font-bold"
            style={{
              color: isTop3 ? CELEBRATION_ACCENT : "var(--foreground)",
              textShadow: isTop3 ? `0 0 12px ${CELEBRATION_ACCENT}66` : "none",
            }}
          >
            {rankBadge(rank)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
            of {totalPlayers.toLocaleString()} players
          </span>
        </div>

        {/* Score */}
        <p className="font-mono text-xs text-[var(--foreground-muted)]">
          Score: <span style={{ color: "#34d399" }}>{score.toLocaleString()}</span> ALN
        </p>

        {/* Dismiss hint */}
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--foreground-dim)]">
          Tap to dismiss
        </p>
      </div>
    </div>
  );
}
