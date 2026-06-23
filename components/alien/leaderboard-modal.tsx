"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "./modal";
import type { Difficulty } from "@/lib/sudoku/types";
import {
  DIFFICULTY_META,
  DIFFICULTY_ORDER,
} from "@/lib/sudoku/types";

interface LeaderboardEntry {
  rank: number;
  alien_id: string;
  difficulty: Difficulty;
  best_score: number;
  best_time_seconds: number;
  best_mistakes: number;
  best_hints_used: number;
  games_played: number;
  games_won: number;
  last_played_at: string | null;
  updated_at: string;
  is_current_user?: boolean;
}

interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
  currentDifficulty: Difficulty;
  authToken: string | null;
}

const LB_ACCENT = "#a3e635"; // lime — leaderboard color

function formatTime(total: number): string {
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function shortenAlienId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function rankBadge(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

/**
 * Leaderboard modal — shows top 10 players for the selected tier + the
 * current player's rank with neighbors.
 *
 * Data is fetched fresh from /api/leaderboard/top + /api/leaderboard/rank
 * every time the modal opens. The tier selector inside the modal lets
 * players browse all 6 tiers.
 */
export function LeaderboardModal({
  open,
  onClose,
  currentDifficulty,
  authToken,
}: LeaderboardModalProps) {
  const [tier, setTier] = useState<Difficulty>(currentDifficulty);
  const [topEntries, setTopEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number>(0);
  const [myTotal, setMyTotal] = useState<number>(0);
  const [myNeighbors, setMyNeighbors] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch top players (public, no auth).
      const topRes = await fetch(
        `/api/leaderboard/top?difficulty=${tier}&limit=10`,
      );
      if (topRes.ok) {
        const topData = await topRes.json();
        setTopEntries(topData.entries || []);
      }

      // Fetch the player's rank + neighbors (auth required).
      if (authToken) {
        const rankRes = await fetch(
          `/api/leaderboard/rank?difficulty=${tier}`,
          { headers: { Authorization: `Bearer ${authToken}` } },
        );
        if (rankRes.ok) {
          const rankData = await rankRes.json();
          setMyRank(rankData.rank || 0);
          setMyTotal(rankData.totalPlayers || 0);
          setMyNeighbors(rankData.neighbors || []);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [tier, authToken]);

  useEffect(() => {
    if (open) {
      setTier(currentDifficulty);
      fetchLeaderboard();
    }
  }, [open, currentDifficulty, fetchLeaderboard]);

  // Re-fetch when the tier changes inside the modal.
  useEffect(() => {
    if (open) fetchLeaderboard();
  }, [tier, open, fetchLeaderboard]);

  const meta = DIFFICULTY_META[tier];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Leaderboard"
      subtitle="Top operatives by tier"
      accent={LB_ACCENT}
    >
      <div className="flex flex-col gap-3">
        {/* Tier selector — horizontal pills */}
        <div className="flex gap-1 overflow-x-auto rounded-md border border-[var(--grid-line)] bg-[var(--background-elevated)] p-1">
          {DIFFICULTY_ORDER.map((d) => {
            const m = DIFFICULTY_META[d];
            const isActive = d === tier;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setTier(d)}
                className={[
                  "flex-1 whitespace-nowrap rounded px-2 py-1 font-mono text-[9px] font-medium uppercase tracking-wider transition-all",
                  isActive ? "tier-active" : "",
                ].join(" ")}
                style={{
                  color: isActive ? m.accent : "var(--foreground-dim)",
                  background: isActive ? `${m.accent}22` : "transparent",
                  border: `1px solid ${isActive ? `${m.accent}88` : "transparent"}`,
                }}
                aria-pressed={isActive}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* My rank banner */}
        {authToken && myRank > 0 && (
          <div
            className="flex items-center justify-between rounded-md border px-3 py-2"
            style={{
              borderColor: `${LB_ACCENT}44`,
              background: `linear-gradient(90deg, ${LB_ACCENT}1a, transparent 80%)`,
            }}
          >
            <div className="flex flex-col">
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
                Your rank
              </span>
              <span
                className="font-mono text-base font-bold"
                style={{ color: LB_ACCENT, textShadow: `0 0 8px ${LB_ACCENT}55` }}
              >
                {rankBadge(myRank)}
              </span>
            </div>
            <span className="font-mono text-[10px] text-[var(--foreground-muted)]">
              of {myTotal.toLocaleString()} players
            </span>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div
              className="orbit-spin h-6 w-6 rounded-full border-2"
              style={{ borderColor: `${LB_ACCENT}33`, borderTopColor: LB_ACCENT }}
            />
          </div>
        )}

        {error && (
          <div
            className="rounded-md border px-3 py-2 font-mono text-[11px]"
            style={{
              borderColor: "rgba(251,113,133,0.4)",
              background: "rgba(251,113,133,0.08)",
              color: "#fb7185",
            }}
          >
            ✗ {error}
          </div>
        )}

        {/* Top 10 list */}
        {!loading && !error && (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
              Top 10 · {meta.label}
            </span>
            {topEntries.length === 0 ? (
              <div className="rounded-md border border-[var(--grid-line)] bg-[var(--background-cell)] px-3 py-6 text-center font-mono text-[10px] text-[var(--foreground-dim)]">
                No scores yet. Be the first!
              </div>
            ) : (
              topEntries.map((entry, idx) => (
                <LeaderboardRow key={entry.alien_id + idx} entry={entry} />
              ))
            )}
          </div>
        )}

        {/* My neighbors */}
        {!loading && !error && authToken && myNeighbors.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--foreground-dim)]">
              Around your rank
            </span>
            {myNeighbors.map((entry, idx) => (
              <LeaderboardRow
                key={entry.alien_id + idx}
                entry={entry}
                highlight={entry.is_current_user}
              />
            ))}
          </div>
        )}

        <p className="text-center font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--foreground-dim)]">
          Score = reward earned · Tie-break: fastest time
        </p>
      </div>
    </Modal>
  );
}

function LeaderboardRow({
  entry,
  highlight = false,
}: {
  entry: LeaderboardEntry;
  highlight?: boolean;
}) {
  const meta = DIFFICULTY_META[entry.difficulty];
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[10px]"
      style={{
        borderColor: highlight ? `${meta.accent}88` : "var(--grid-line)",
        background: highlight ? `${meta.accent}1a` : "var(--background-cell)",
        boxShadow: highlight ? `0 0 8px ${meta.accent}33` : "none",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-7 text-center font-bold"
          style={{ color: highlight ? meta.accent : "var(--foreground-muted)" }}
        >
          {rankBadge(entry.rank)}
        </span>
        <span
          className="truncate"
          style={{ color: highlight ? meta.accent : "var(--foreground)" }}
        >
          {shortenAlienId(entry.alien_id)}
          {highlight && (
            <span className="ml-1 font-mono text-[8px] uppercase tracking-wider opacity-70">
              (you)
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className="font-bold"
          style={{ color: "#34d399" }}
          title="Best score"
        >
          {entry.best_score}
        </span>
        <span
          className="text-[var(--foreground-dim)]"
          title="Best time"
        >
          {formatTime(entry.best_time_seconds)}
        </span>
        <span
          className="text-[var(--foreground-dim)]"
          title="Games won / played"
        >
          {entry.games_won}/{entry.games_played}
        </span>
      </div>
    </div>
  );
}
