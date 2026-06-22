"use client";

import { memo } from "react";
import {
  HINTS_BONUS_MAX,
  ERRORS_BONUS_MAX,
  SOLVE_REWARD_BASE,
} from "@/lib/alien/aln-store";
import type { Difficulty } from "@/lib/sudoku/types";

interface RewardPreviewProps {
  difficulty: Difficulty;
  mistakes: number;
  maxMistakes: number;
  hintsLeft: number;
  maxHints: number;
  dailyEarned: number;
  dailyCap: number;
}

/**
 * Live "potential earnings" panel shown above the board. Updates in real time
 * as the player makes mistakes or uses hints — the multiplier visibly shrinks,
 * which encourages careful play.
 *
 * Math mirrors `computeReward()` in `lib/alien/aln-store.ts` but is computed
 * here in the component for live display without writing to the store.
 */
function RewardPreviewInner({
  difficulty,
  mistakes,
  maxMistakes,
  hintsLeft,
  maxHints,
  dailyEarned,
  dailyCap,
}: RewardPreviewProps) {
  const base = SOLVE_REWARD_BASE[difficulty] ?? 5;
  const hintsUsed = Math.max(0, maxHints - hintsLeft);
  const hintsSlack = maxHints > 0 ? 1 - hintsUsed / maxHints : 1;
  const errorsSlack = maxMistakes > 0 ? 1 - mistakes / maxMistakes : 1;
  const hintsMult = 1 + HINTS_BONUS_MAX * hintsSlack;
  const errorsMult = 1 + ERRORS_BONUS_MAX * errorsSlack;
  const gross = Math.round(base * hintsMult * errorsMult);
  const remaining = Math.max(0, dailyCap - dailyEarned);
  const net = Math.min(gross, remaining);
  const capped = gross > remaining;

  // Multiplier label e.g. "×1.68"
  const totalMult = hintsMult * errorsMult;
  const multLabel = `×${totalMult.toFixed(2)}`;

  return (
    <div
      className="rounded-md border p-3"
      style={{
        borderColor: "var(--accent-soft)",
        background:
          "linear-gradient(135deg, var(--accent-faint), transparent 80%)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
            Potential payout
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className="font-mono text-xl font-semibold"
              style={{
                color: "var(--accent)",
                textShadow: "0 0 12px var(--accent-soft)",
              }}
            >
              {net.toLocaleString()}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
              ALN
            </span>
            <span
              className="ml-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium"
              style={{
                color: "var(--accent)",
                background: "var(--accent-faint)",
              }}
            >
              {multLabel}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1 font-mono text-[10px] text-[var(--foreground-muted)]">
            <span className="text-[var(--foreground-dim)]">base</span>
            <span className="text-[var(--foreground)]">{base}</span>
            <span className="text-[var(--accent)]">
              ×{hintsMult.toFixed(2)}
            </span>
            <span className="text-[var(--foreground-dim)]">hints</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-[var(--foreground-muted)]">
            <span className="text-[var(--accent)]">
              ×{errorsMult.toFixed(2)}
            </span>
            <span className="text-[var(--foreground-dim)]">errors</span>
          </div>
        </div>
      </div>

      {/* Daily cap progress bar */}
      <div className="mt-2 flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-[var(--foreground-dim)]">
          <span>Daily cap</span>
          <span>
            {dailyEarned} / {dailyCap}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--grid-line)]">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${(dailyEarned / dailyCap) * 100}%`,
              background: "var(--accent)",
              boxShadow: "0 0 6px var(--accent-soft)",
            }}
          />
        </div>
        {capped && (
          <p className="font-mono text-[9px] text-[#fbbf24]">
            ⚠ Daily cap reached — further solves earn 0 ALN today.
          </p>
        )}
      </div>
    </div>
  );
}

export const RewardPreview = memo(RewardPreviewInner);
