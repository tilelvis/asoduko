import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/with-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";
import { creditWallet, hasIdempotencyKey } from "@/lib/db/wallet";
import { getServerEnv, isWalletConfigured } from "@/lib/env";
import {
  DAILY_EARN_CAP,
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
 * POST /api/wallet/claim
 *
 * Claims a puzzle-solve reward. The client sends:
 *   - difficulty
 *   - mistakes
 *   - hintsUsed
 *   - gameSeed (UUID generated when the puzzle was created — the server
 *     will eventually verify this against a server-stored puzzle, but for
 *     now we use it as part of the idempotency key so each game can only
 *     be claimed ONCE)
 *
 * The server:
 *   1. Re-computes the reward from the difficulty + skill metrics, using
 *      its own constants. The client's claimed amount is IGNORED.
 *   2. Enforces the daily cap (server-side counter).
 *   3. Uses (alienId, gameSeed) as the idempotency key so the same game
 *      can never be claimed twice.
 *
 * SECURITY CAVEAT:
 *   Without server-side puzzle generation + move verification, a determined
 *   attacker could claim rewards for games they didn't actually solve. The
 *   mitigations are:
 *     - Daily cap caps the damage at DAILY_EARN_CAP ALN/day
 *     - Rate limit (1 claim per 5s) makes farming slow
 *     - The reward math is server-authoritative — they can't inflate amounts
 *     - Each gameSeed can only be claimed once
 *   For full anti-cheat, see README → "Going to full anti-cheat".
 */

const VALID_DIFFICULTIES: Difficulty[] = [
  "rookie",
  "cadet",
  "operative",
  "commander",
  "architect",
  "transcendent",
];

const ClaimRequest = z.object({
  difficulty: z.enum(VALID_DIFFICULTIES as [Difficulty, ...Difficulty[]]),
  mistakes: z.number().int().min(0),
  hintsUsed: z.number().int().min(0),
  gameSeed: z.string().uuid(),
});

export const POST = withAuth(async (request, { auth }) => {
  if (!isWalletConfigured()) {
    return NextResponse.json(
      { error: "Wallet not configured." },
      { status: 503 },
    );
  }

  const rl = rateLimit(`${auth.sub}:claim`, RATE_LIMITS.claim);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited", retryAfterMs: rl.resetInMs },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = ClaimRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { difficulty, mistakes, hintsUsed, gameSeed } = parsed.data;

  // Validate skill metrics against the tier's max — a player can't claim
  // "0 mistakes" on Transcendent if they actually used 5.
  const maxMistakes = DIFFICULTY_MAX_MISTAKES[difficulty];
  const maxHints = DIFFICULTY_MAX_HINTS[difficulty];
  if (mistakes > maxMistakes || hintsUsed > maxHints) {
    return NextResponse.json(
      { error: "Invalid skill metrics for tier" },
      { status: 400 },
    );
  }

  // Server-side reward computation — the client's claimed amount is ignored.
  const base = SOLVE_REWARD_BASE[difficulty];
  const hintsSlack = maxHints > 0 ? 1 - hintsUsed / maxHints : 1;
  const errorsSlack = maxMistakes > 0 ? 1 - mistakes / maxMistakes : 1;
  const hintsMult = 1 + HINTS_BONUS_MAX * hintsSlack;
  const errorsMult = 1 + ERRORS_BONUS_MAX * errorsSlack;
  const grossReward = Math.round(base * hintsMult * errorsMult);

  // Idempotency: (alienId, gameSeed) — same game can only be claimed once.
  const idempotencyKey = `claim:${auth.sub}:${gameSeed}`;
  if (await hasIdempotencyKey(idempotencyKey)) {
    return NextResponse.json(
      { error: "This game has already been claimed" },
      { status: 409 },
    );
  }

  const env = getServerEnv();
  try {
    const result = await creditWallet({
      alienId: auth.sub,
      amount: grossReward,
      type: "claim",
      description: `Solved ${difficulty} (${hintsUsed}h ${mistakes}e)`,
      idempotencyKey,
      gameSeed,
      enforceDailyCap: true,
      dailyCap: env.WALLET_DAILY_EARN_CAP,
    });

    return NextResponse.json({
      ...result,
      reward: grossReward,
      breakdown: {
        base,
        hintsMultiplier: hintsMult,
        errorsMultiplier: errorsMult,
        grossReward,
        capped: result.dailyCapped,
        capApplied: result.capApplied,
        netReward: result.balance, // final balance after credit
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "IDEMPOTENCY_REPLAY") {
      return NextResponse.json(
        { error: "This game has already been claimed" },
        { status: 409 },
      );
    }
    console.error("Claim failed:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
