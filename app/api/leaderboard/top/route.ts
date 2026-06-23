import { NextResponse } from "next/server";
import { z } from "zod";
import { getTopPlayers } from "@/lib/db/leaderboard";
import { isWalletConfigured } from "@/lib/env";

const QuerySchema = z.object({
  difficulty: z.enum([
    "rookie",
    "cadet",
    "operative",
    "commander",
    "architect",
    "transcendent",
  ]),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * GET /api/leaderboard/top?difficulty=transcendent&limit=10
 *
 * Public endpoint — returns the top N players for a difficulty tier.
 * No auth required (alien_id is pseudonymous).
 */
export async function GET(request: Request) {
  if (!isWalletConfigured()) {
    return NextResponse.json(
      { error: "Leaderboard not configured." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    difficulty: url.searchParams.get("difficulty") || "rookie",
    limit: url.searchParams.get("limit") || "10",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const entries = await getTopPlayers(
      parsed.data.difficulty,
      parsed.data.limit,
    );
    return NextResponse.json({
      difficulty: parsed.data.difficulty,
      entries,
    });
  } catch (err) {
    console.error("Leaderboard fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 },
    );
  }
}
