/**
 * Leaderboard database queries.
 *
 * Uses the same NeonDB connection as the wallet. The leaderboard tracks
 * each player's BEST score per difficulty tier (not cumulative), so a
 * player's rank reflects their peak performance.
 *
 * Score = the reward they earned for that game (base × hintsMult × errorsMult).
 * This naturally rewards: harder tier + fewer hints + fewer errors.
 *
 * Tie-breaker: faster time wins (best_time_seconds ascending).
 */

import { neon } from "@neondatabase/serverless";
import type { Difficulty } from "@/lib/sudoku/types";

let _sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) return null;
  _sql = neon(url);
  return _sql;
}

function requireSql(): ReturnType<typeof neon> {
  const sql = getSql();
  if (!sql) throw new Error("WALLET_NOT_CONFIGURED");
  return sql;
}

export interface LeaderboardEntry {
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

/**
 * Upsert a player's leaderboard entry after a puzzle solve.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE — atomic, no read-then-write race.
 * Only updates best_score if the new score is higher (or equal with a
 * faster time). Always increments games_played + games_won.
 *
 * Returns the player's new rank for that difficulty.
 */
export async function submitLeaderboardScore(opts: {
  alienId: string;
  difficulty: Difficulty;
  score: number;
  timeSeconds: number;
  mistakes: number;
  hintsUsed: number;
  won: boolean;
}): Promise<{ rank: number; totalPlayers: number; isNewBest: boolean }> {
  const sql = requireSql();

  // Ensure the user exists in the users table (FK requirement).
  await sql`INSERT INTO users (alien_id) VALUES (${opts.alienId}) ON CONFLICT (alien_id) DO NOTHING`;

  // Atomic upsert. The WHERE clause on the UPDATE ensures we only overwrite
  // best_score / best_time if the new score is strictly better, OR if the
  // score is equal and the time is faster.
  const rows = (await sql`
    INSERT INTO leaderboard_entries
      (alien_id, difficulty, best_score, best_time_seconds, best_mistakes,
       best_hints_used, games_played, games_won, last_played_at)
    VALUES
      (${opts.alienId}, ${opts.difficulty}, ${opts.score}, ${opts.timeSeconds},
       ${opts.mistakes}, ${opts.hintsUsed}, 1, ${opts.won ? 1 : 0}, now())
    ON CONFLICT (user_id, difficulty) DO UPDATE SET
      best_score = CASE
        WHEN ${opts.score} > leaderboard_entries.best_score THEN ${opts.score}
        ELSE leaderboard_entries.best_score
      END,
      best_time_seconds = CASE
        WHEN ${opts.score} > leaderboard_entries.best_score THEN ${opts.timeSeconds}
        WHEN ${opts.score} = leaderboard_entries.best_score AND ${opts.timeSeconds} < leaderboard_entries.best_time_seconds THEN ${opts.timeSeconds}
        ELSE leaderboard_entries.best_time_seconds
      END,
      best_mistakes = CASE
        WHEN ${opts.score} > leaderboard_entries.best_score THEN ${opts.mistakes}
        ELSE leaderboard_entries.best_mistakes
      END,
      best_hints_used = CASE
        WHEN ${opts.score} > leaderboard_entries.best_score THEN ${opts.hintsUsed}
        ELSE leaderboard_entries.best_hints_used
      END,
      games_played = leaderboard_entries.games_played + 1,
      games_won = leaderboard_entries.games_won + ${opts.won ? 1 : 0},
      last_played_at = now()
    RETURNING
      best_score,
      (SELECT COUNT(*) + 1 FROM leaderboard_entries le
       WHERE le.difficulty = ${opts.difficulty}
         AND le.user_id != leaderboard_entries.user_id
         AND (le.best_score > leaderboard_entries.best_score
              OR (le.best_score = leaderboard_entries.best_score
                  AND le.best_time_seconds < leaderboard_entries.best_time_seconds))) AS rank,
      (SELECT COUNT(*) FROM leaderboard_entries WHERE difficulty = ${opts.difficulty}) AS total,
      (CASE WHEN ${opts.score} >= leaderboard_entries.best_score THEN true ELSE false END) AS is_new_best
  `) as Array<{
    best_score: number;
    rank: number;
    total: number;
    is_new_best: boolean;
  }>;

  // Note: is_new_best from the RETURNING clause reflects the state AFTER the
  // upsert. If the player's new score equals or exceeds their previous best,
  // it's a new best.
  return {
    rank: rows[0].rank,
    totalPlayers: rows[0].total,
    isNewBest: rows[0].is_new_best,
  };
}

/**
 * Get the top N players for a difficulty tier.
 * Public — no auth required (alien_id is a pseudonymous ID, not PII).
 */
export async function getTopPlayers(
  difficulty: Difficulty,
  limit = 10,
): Promise<Omit<LeaderboardEntry, "is_current_user">[]> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT
      alien_id,
      difficulty,
      best_score,
      best_time_seconds,
      best_mistakes,
      best_hints_used,
      games_played,
      games_won,
      last_played_at,
      updated_at,
      ROW_NUMBER() OVER (
        ORDER BY best_score DESC, best_time_seconds ASC
      ) AS rank
    FROM leaderboard_entries
    WHERE difficulty = ${difficulty}
    ORDER BY best_score DESC, best_time_seconds ASC
    LIMIT ${limit}
  `) as Array<Omit<LeaderboardEntry, "is_current_user">>;

  return rows.map((r) => ({
    rank: r.rank,
    alien_id: r.alien_id,
    difficulty: r.difficulty as Difficulty,
    best_score: r.best_score,
    best_time_seconds: r.best_time_seconds,
    best_mistakes: r.best_mistakes,
    best_hints_used: r.best_hints_used,
    games_played: r.games_played,
    games_won: r.games_won,
    last_played_at: r.last_played_at,
    updated_at: r.updated_at,
  }));
}

/**
 * Get a player's rank + their neighbors (2 above, 2 below).
 * Useful for showing context in the leaderboard modal.
 */
export async function getPlayerRankWithContext(
  alienId: string,
  difficulty: Difficulty,
): Promise<{
  rank: number;
  totalPlayers: number;
  neighbors: LeaderboardEntry[];
}> {
  const sql = requireSql();

  // Get the player's entry + rank.
  const playerRows = (await sql`
    SELECT
      le.*,
      ROW_NUMBER() OVER (
        ORDER BY le.best_score DESC, le.best_time_seconds ASC
      ) AS rank,
      (SELECT COUNT(*) FROM leaderboard_entries WHERE difficulty = ${difficulty}) AS total
    FROM leaderboard_entries le
    WHERE le.alien_id = ${alienId} AND le.difficulty = ${difficulty}
  `) as Array<LeaderboardEntry & { rank: number; total: number }>;

  if (playerRows.length === 0) {
    // Player hasn't played this tier yet.
    const totalRows = (await sql`
      SELECT COUNT(*)::int AS total FROM leaderboard_entries WHERE difficulty = ${difficulty}
    `) as Array<{ total: number }>;
    return {
      rank: 0,
      totalPlayers: totalRows[0]?.total ?? 0,
      neighbors: [],
    };
  }

  const player = playerRows[0];
  const playerRank = player.rank;

  // Fetch neighbors: 2 ranks above + 2 ranks below + the player themselves.
  // We use a window of ±2 around the player's rank.
  const neighborRows = (await sql`
    WITH ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          ORDER BY best_score DESC, best_time_seconds ASC
        ) AS rank
      FROM leaderboard_entries
      WHERE difficulty = ${difficulty}
    )
    SELECT * FROM ranked
    WHERE rank BETWEEN ${Math.max(1, playerRank - 2)} AND ${playerRank + 2}
    ORDER BY rank ASC
  `) as Array<LeaderboardEntry & { rank: number }>;

  return {
    rank: playerRank,
    totalPlayers: player.total,
    neighbors: neighborRows.map((n) => ({
      ...n,
      is_current_user: n.alien_id === alienId,
    })),
  };
}

/**
 * Get a player's best stats across ALL tiers.
 * Used for the "your records" summary in the leaderboard modal.
 */
export async function getPlayerAllTierStats(
  alienId: string,
): Promise<LeaderboardEntry[]> {
  const sql = requireSql();
  const rows = (await sql`
    SELECT
      alien_id,
      difficulty,
      best_score,
      best_time_seconds,
      best_mistakes,
      best_hints_used,
      games_played,
      games_won,
      last_played_at,
      updated_at,
      ROW_NUMBER() OVER (
        PARTITION BY difficulty
        ORDER BY best_score DESC, best_time_seconds ASC
      ) AS rank
    FROM leaderboard_entries
    WHERE alien_id = ${alienId}
    ORDER BY
      CASE difficulty
        WHEN 'transcendent' THEN 1
        WHEN 'architect' THEN 2
        WHEN 'commander' THEN 3
        WHEN 'operative' THEN 4
        WHEN 'cadet' THEN 5
        WHEN 'rookie' THEN 6
      END
  `) as Array<LeaderboardEntry & { rank: number }>;
  return rows.map((r) => ({ ...r, is_current_user: true }));
}
