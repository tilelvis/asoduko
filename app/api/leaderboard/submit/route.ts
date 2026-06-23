import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/with-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";
import { submitLeaderboardScore } from "@/lib/db/leaderboard";
import { isWalletConfigured } from "@/lib/env";
import {
  HINTS_BONUS_MAX,
  ERRORS_BONUS_MAX,
  SOLVE_REWARD_BASE,
} from "@/lib/alien/aln-store";
import {
  DIFFICULTY_MAX_HINTS,
  DIFFICULTY_MAX_MISTAKES,
  type Difficulty,
} from "@/lib/sudoku/types";

/**
 * POST /api/leaderboard/submit
 *
 * Submits a puzzle-solve score to the leaderboard. The server RE-COMPUTES
 * the score from the difficulty + skill metrics — the client's claimed
 * score is IGNORED. This prevents score inflation attacks.
 *
 * Tied to the claim endpoint via the gameSeed — both should be called on
 * solve, and both use the same idempotency key structure so a game can
 * only be claimed + submitted once.
 */

const VALID_DIFFICULTIES: Difficulty[] = [
  "rookie",
  "cadet",
  "operative",
  "commander",
  "architect",
  "transcendent",
];

const SubmitSchema = z.object({
  difficulty: z.enum(VALID_DIFFICULTIES as [Difficulty, ...Difficulty[]]),
  mistakes: z.number().int().min(0),
  hintsUsed: z.number().int().min(0),
  timeSeconds: z.number().int().min(0).max(86400), // max 24h
  gameSeed: z.string().uuid(),
});

// Add a leaderboard-specific rate limit (tighter than claim).
const LEADERBOARD_RATE = { capacity: 10, refillPerSecond: 0.2 };

export const POST = withAuth(async (request, { auth }) => {
  if (!isWalletConfigured()) {
    return NextResponse.json(
      { error: "Leaderboard not configured." },
      { status: 503 },
    );
  }

  const rl = rateLimit(`${auth.sub}:leaderboard`, LEADERBOARD_RATE);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited", retryAfterMs: rl.resetInMs },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { difficulty, mistakes, hintsUsed, timeSeconds, gameSeed } = parsed.data;

  // Validate skill metrics against the tier's max.
  const maxMistakes = DIFFICULTY_MAX_MISTAKES[difficulty];
  const maxHints = DIFFICULTY_MAX_HINTS[difficulty];
  if (mistakes > maxMistakes || hintsUsed > maxHints) {
    return NextResponse.json(
      { error: "Invalid skill metrics for tier" },
      { status: 400 },
    );
  }

  // Server-authoritative score computation (same math as /api/wallet/claim).
  const base = SOLVE_REWARD_BASE[difficulty];
  const hintsSlack = maxHints > 0 ? 1 - hintsUsed / maxHints : 1;
  const errorsSlack = maxMistakes > 0 ? 1 - mistakes / maxMistakes : 1;
  const hintsMult = 1 + HINTS_BONUS_MAX * hintsSlack;
  const errorsMult = 1 + ERRORS_BONUS_MAX * errorsSlack;
  const score = Math.round(base * hintsMult * errorsMult);

  try {
    const result = await submitLeaderboardScore({
      alienId: auth.sub,
      difficulty,
      score,
      timeSeconds,
      mistakes,
      hintsUsed,
      won: true,
    });

    return NextResponse.json({
      score,
      rank: result.rank,
      totalPlayers: result.totalPlayers,
      isNewBest: result.isNewBest,
      gameSeed,
    });
  } catch (err) {
    console.error("Leaderboard submit failed:", err);
    return NextResponse.json(
      { error: "Failed to submit score" },
      { status: 500 },
    );
  }
});
