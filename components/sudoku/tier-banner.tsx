"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { Difficulty } from "@/lib/sudoku/types";
import {
  DIFFICULTY_META,
  DIFFICULTY_ORDER,
  DIFFICULTY_CLUES,
} from "@/lib/sudoku/types";
import { ENTRY_FEES, SOLVE_REWARD_BASE, CAVEAT_COSTS_PURGE } from "@/lib/alien/aln-store";

interface TierBannerProps {
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  alnBalance: number;
}

/**
 * Swipeable horizontal tier banner.
 *
 * Each tier is a full-width "card" the player can swipe through. The active
 * card shows:
 *   - Tier name + tagline (huge, glowing)
 *   - Entry fee (red, prominent) + Base reward (green, prominent)
 *   - Clue count + mistake/hint budget
 *   - Purge cost (so players see what recovery costs at this tier)
 *   - A "PLAY" CTA button that glows in the tier's accent color
 *
 * Unaffordable tiers are visually marked but still swipeable — players see
 * what they're missing, which encourages them to deposit ALN to unlock
 * higher tiers (where rewards are bigger).
 *
 * Swipe mechanics:
 *   - Touch: drag left/right, snap on release
 *   - Mouse: drag, or click left/right arrows
 *   - Keyboard: arrow keys when focused
 */
export function TierBanner({
  difficulty,
  onDifficultyChange,
  alnBalance,
}: TierBannerProps) {
  const activeIndex = DIFFICULTY_ORDER.indexOf(difficulty);
  const [dragIndex, setDragIndex] = useState(activeIndex);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardWidth = useRef(0);

  useEffect(() => {
    setDragIndex(activeIndex);
  }, [activeIndex]);

  // Measure card width (container width — arrows are outside).
  useEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      cardWidth.current = containerRef.current?.offsetWidth ?? 0;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const goToIndex = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, idx));
      setDragIndex(clamped);
      setDragOffset(0);
      onDifficultyChange(DIFFICULTY_ORDER[clamped]);
    },
    [onDifficultyChange],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !cardWidth.current) return;
    const delta = e.clientX - startX.current;
    setDragOffset(delta);
  };

  const handlePointerUp = () => {
    if (!isDragging || !cardWidth.current) {
      setIsDragging(false);
      return;
    }
    setIsDragging(false);
    // Snap: if dragged more than 25% of card width, move to next/prev.
    const threshold = cardWidth.current * 0.25;
    if (dragOffset < -threshold && dragIndex < DIFFICULTY_ORDER.length - 1) {
      goToIndex(dragIndex + 1);
    } else if (dragOffset > threshold && dragIndex > 0) {
      goToIndex(dragIndex - 1);
    } else {
      setDragOffset(0);
    }
  };

  const currentTier = DIFFICULTY_ORDER[dragIndex];
  const meta = DIFFICULTY_META[currentTier];
  const entryFee = ENTRY_FEES[currentTier];
  const baseReward = SOLVE_REWARD_BASE[currentTier];
  const clues = DIFFICULTY_CLUES[currentTier];
  const purgeCost = CAVEAT_COSTS_PURGE[currentTier];
  const affordable = alnBalance >= entryFee;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {/* Left arrow */}
      <button
        type="button"
        onClick={() => goToIndex(dragIndex - 1)}
        disabled={dragIndex === 0}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--grid-line)] bg-[var(--background-elevated)] text-[var(--foreground-muted)] transition-all hover:border-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="Previous tier"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>

      {/* Swipeable card area */}
      <div
        ref={containerRef}
        className="relative flex-1 cursor-grab overflow-hidden rounded-md active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="region"
        aria-label="Tier selector — swipe to browse"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") goToIndex(dragIndex - 1);
          if (e.key === "ArrowRight") goToIndex(dragIndex + 1);
        }}
      >
        {/* Card backdrop with tier accent glow */}
        <div
          className="relative h-[108px] overflow-hidden rounded-md border transition-colors"
          style={{
            borderColor: `${meta.accent}55`,
            background: `linear-gradient(135deg, ${meta.accent}1a 0%, var(--background-elevated) 60%)`,
            boxShadow: `0 0 18px ${meta.accent}33, inset 0 0 12px ${meta.accent}11`,
          }}
        >
          {/* Sliding card track */}
          <div
            className="flex h-full transition-transform"
            style={{
              transform: `translateX(calc(-${dragIndex * 100}% + ${dragOffset}px))`,
              transitionDuration: isDragging ? "0ms" : "250ms",
            }}
          >
            {DIFFICULTY_ORDER.map((d) => {
              const m = DIFFICULTY_META[d];
              const fee = ENTRY_FEES[d];
              const base = SOLVE_REWARD_BASE[d];
              const c = DIFFICULTY_CLUES[d];
              const purge = CAVEAT_COSTS_PURGE[d];
              const canAfford = alnBalance >= fee;
              const isActive = d === currentTier;
              return (
                <div
                  key={d}
                  className="flex h-full w-full shrink-0 flex-col justify-between p-2.5"
                >
                  {/* Top row: tier name + tagline */}
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col leading-tight">
                      <span
                        className="font-mono text-base font-bold uppercase tracking-wider"
                        style={{
                          color: m.accent,
                          textShadow: `0 0 10px ${m.accent}66`,
                        }}
                      >
                        {m.label}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--foreground-dim)]">
                        {m.tagline}
                      </span>
                    </div>
                    {!canAfford && (
                      <span className="rounded border border-[rgba(251,113,133,0.4)] bg-[rgba(251,113,133,0.1)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[#fb7185]">
                        Need {fee}
                      </span>
                    )}
                  </div>

                  {/* Middle row: entry vs reward — the spending trigger */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--foreground-dim)]">
                        Entry
                      </span>
                      <span
                        className="font-mono text-sm font-bold"
                        style={{
                          color: fee === 0 ? "var(--foreground-muted)" : "#fb7185",
                          textShadow: fee > 0 ? "0 0 6px rgba(251,113,133,0.4)" : "none",
                        }}
                      >
                        {fee === 0 ? "FREE" : `−${fee}`}
                      </span>
                    </div>
                    <div
                      className="flex flex-1 flex-col items-center justify-center rounded border px-1.5 py-0.5"
                      style={{
                        borderColor: `${m.accent}33`,
                        background: `${m.accent}0d`,
                      }}
                    >
                      <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--foreground-dim)]">
                        Payout
                      </span>
                      <span
                        className="font-mono text-sm font-bold"
                        style={{
                          color: "#34d399",
                          textShadow: "0 0 6px rgba(52,211,153,0.4)",
                        }}
                      >
                        +{base}
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--foreground-dim)]">
                        Purge
                      </span>
                      <span className="font-mono text-sm font-bold text-[#fbbf24]">
                        {purge}
                      </span>
                    </div>
                  </div>

                  {/* Bottom row: clues + dot indicators */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--foreground-dim)]">
                      {c} clues
                    </span>
                    <div className="flex gap-1">
                      {DIFFICULTY_ORDER.map((_, i) => (
                        <div
                          key={i}
                          className="h-1 rounded-full transition-all"
                          style={{
                            width: i === dragIndex ? 12 : 4,
                            background:
                              i === dragIndex ? m.accent : "var(--grid-line)",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* "Swipe" hint overlay when at first tier (Rookie) */}
          {dragIndex === 0 && !isDragging && (
            <div
              className="pointer-events-none absolute bottom-1 right-2 font-mono text-[8px] uppercase tracking-wider opacity-50"
              style={{ color: meta.accent }}
            >
              swipe →
            </div>
          )}
        </div>
      </div>

      {/* Right arrow */}
      <button
        type="button"
        onClick={() => goToIndex(dragIndex + 1)}
        disabled={dragIndex === DIFFICULTY_ORDER.length - 1}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--grid-line)] bg-[var(--background-elevated)] text-[var(--foreground-muted)] transition-all hover:border-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="Next tier"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
