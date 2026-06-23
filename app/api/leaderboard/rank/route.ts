import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/with-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";
import {
  getPlayerRankWithContext,
  getPlayerAllTierStats,
} from "@/lib/db/leaderboard";
import { isWalletConfigured } from "@/lib/env";
import type { Difficulty } from "@/lib/sudoku/types";

const QuerySchema = z.object({
  difficulty: z.enum([
    "rookie",
    "cadet",
    "operative",
    "commander",
    "architect",
    "transcendent",
  ]).optional(),
  all: z.enum(["true", "1", "yes"]).optional(),
});

/**
 * GET /api/leaderboard/rank?difficulty=transcendent
 * GET /api/leaderboard/rank?all=true
 *
 * JWT-authed. Returns the player's rank + neighbors for a specific tier,
 * OR (with ?all=true) their best stats across all tiers.
 */
export const GET = withAuth(async (request, { auth }) => {
  if (!isWalletConfigured()) {
    return NextResponse.json(
      { error: "Leaderboard not configured." },
      { status: 503 },
    );
  }

  const rl = rateLimit(`${auth.sub}:lb-rank`, RATE_LIMITS.balance);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited", retryAfterMs: rl.resetInMs },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    difficulty: url.searchParams.get("difficulty") || undefined,
    all: url.searchParams.get("all") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.all) {
      const stats = await getPlayerAllTierStats(auth.sub);
      return NextResponse.json({ tierStats: stats });
    }

    const difficulty = (parsed.data.difficulty || "rookie") as Difficulty;
    const result = await getPlayerRankWithContext(auth.sub, difficulty);
    return NextResponse.json({
      difficulty,
      rank: result.rank,
      totalPlayers: result.totalPlayers,
      neighbors: result.neighbors,
    });
  } catch (err) {
    console.error("Rank fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch rank" },
      { status: 500 },
    );
  }
});
