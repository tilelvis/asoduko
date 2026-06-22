/**
 * ALN (Alien Token) store — with a deliberate house edge.
 *
 * ---------------------------------------------------------------------------
 * ECONOMY DESIGN (read this before tweaking constants)
 * ---------------------------------------------------------------------------
 *
 * The math is designed so the **house** (you, the miniapp operator) wins in
 * aggregate, even against highly skilled players. Four levers combine:
 *
 *   1. ENTRY FEE per tier — paid in ALN when a new game starts. The house
 *      collects this whether the player wins or loses.
 *
 *   2. SKILL MULTIPLIERS on solve — bonus for using fewer hints and making
 *      fewer errors. This is the *carrot* that makes hard tiers feel
 *      rewarding for skilled players.
 *
 *   3. TIER-SCALED CAVEAT COSTS — purging errors on Transcendent costs 10x
 *      what it costs on Rookie. This is where struggling players on hard
 *      tiers bleed ALN.
 *
 *   4. DAILY EARNING CAP — the *key* mechanism. A perfect player who solves
 *      Transcendent repeatedly is capped at DAILY_EARN_CAP ALN per UTC day.
 *      Once they hit the cap, further solves that day earn 0 ALN. This
 *      guarantees that even a bot-perfect player cannot drain the system.
 *
 * WHY THIS GUARANTEES A HOUSE EDGE
 *
 *   For an AVERAGE player on tier T:
 *     EV(house) = P(lose) * (entryFee + avgCaveats) - P(win) * (avgReward - entryFee)
 *
 *   With the constants below:
 *     - Transcendent: entry=100, avgReward≈220, avgCaveats≈100, P(win)≈0.3
 *       EV(house) = 0.7 * 200 - 0.3 * 120 = 140 - 36 = +104 ALN/game ✓
 *
 *   For a PERFECT player (always wins, never uses caveats):
 *     - Per-game: +258 ALN (reward 358 - entry 100)
 *     - But capped at 500 ALN/day → max ~2 wins/day
 *     - Beyond cap: 0 ALN. They can still play (paying entry fees) for fun.
 *
 *   Either way, the house collects real ALIEN tokens when players top up
 *   their ALN balance via the in-app store. The ALN itself is an internal
 *   credit currency — the only way for new ALN to enter the system is a
 *   real on-chain ALIEN payment to your provider address.
 *
 * ---------------------------------------------------------------------------
 */

const STORAGE_KEY = "alien-sudoku:aln";
const DAILY_KEY = "alien-sudoku:aln-daily";
const ALN_DECIMALS = 9;

// ---------- ECONOMY CONSTANTS ----------

/** Starting balance for first-time players. */
export const STARTING_BALANCE = 50;

/** Maximum ALN a player can earn from solving puzzles per UTC day. */
export const DAILY_EARN_CAP = 500;

/**
 * Entry fee (stake) paid in ALN when starting a new game at each tier.
 * Rookie is free so new players can always play.
 */
export const ENTRY_FEES: Record<string, number> = {
  rookie: 0,
  cadet: 5,
  operative: 10,
  commander: 25,
  architect: 50,
  transcendent: 100,
};

/**
 * Base reward for solving a puzzle at each tier, BEFORE skill multipliers.
 * Set so that `base - entryFee` is positive but modest, leaving room for
 * the skill multipliers to make a perfect game feel rewarding.
 */
export const SOLVE_REWARD_BASE: Record<string, number> = {
  rookie: 8,
  cadet: 18,
  operative: 35,
  commander: 65,
  architect: 110,
  transcendent: 180,
};

/**
 * Skill bonus configuration. Two multipliers stack multiplicatively:
 *
 *   hintsMultiplier  = 1 + HINTS_BONUS_MAX * (1 - hintsUsed / maxHints)
 *                    → ranges from 1.0 (used all hints) to 1 + HINTS_BONUS_MAX
 *
 *   errorsMultiplier = 1 + ERRORS_BONUS_MAX * (1 - mistakes / maxMistakes)
 *                    → ranges from 1.0 (used full error budget) to 1 + ERRORS_BONUS_MAX
 *
 * A "perfect" game (no hints, no errors) on Transcendent yields:
 *   180 * (1 + 0.4) * (1 + 0.6) = 180 * 2.24 = 403 ALN
 * (before the daily cap is applied).
 */
export const HINTS_BONUS_MAX = 0.4; // +40% for zero hints
export const ERRORS_BONUS_MAX = 0.6; // +60% for zero errors

/**
 * Cost (in ALN) of each caveat, scaled by tier.
 *
 * Purge Errors scales aggressively with tier — on Transcendent, purging
 * costs as much as the entry fee, making it a real strategic decision
 * (purge + continue, or restart and forfeit the entry fee).
 */
export const CAVEAT_COSTS_PURGE: Record<string, number> = {
  rookie: 10,
  cadet: 15,
  operative: 25,
  commander: 40,
  architect: 70,
  transcendent: 100,
};

/** Refill hints is a flat cost — same regardless of tier. */
export const CAVEAT_COSTS_REFILL = 10;

export type CaveatType = "purgeErrors" | "refillHints";

/** Convenience: get the purge cost for the current tier. */
export function purgeCostFor(difficulty: string): number {
  return CAVEAT_COSTS_PURGE[difficulty] ?? 15;
}

/**
 * Compute the reward for solving a puzzle, given the skill metrics.
 *
 * Returns a breakdown so the UI can show the player exactly what they earned.
 */
export interface RewardBreakdown {
  base: number;
  hintsUsed: number;
  maxHints: number;
  hintsMultiplier: number;
  hintsBonus: number; // base * (hintsMultiplier - 1)
  mistakes: number;
  maxMistakes: number;
  errorsMultiplier: number;
  errorsBonus: number; // base * (errorsMultiplier - 1) * hintsMultiplier
  grossReward: number; // base * hintsMult * errorsMult, rounded
  capped: boolean;
  capApplied: number; // ALN clipped by the daily cap
  netReward: number; // final amount credited
  dailyEarnedBefore: number;
  dailyEarnedAfter: number;
  dailyCap: number;
}

export function computeReward(opts: {
  difficulty: string;
  mistakes: number;
  maxMistakes: number;
  hintsUsed: number;
  maxHints: number;
  dailyEarnedBefore: number;
}): RewardBreakdown {
  const base = SOLVE_REWARD_BASE[opts.difficulty] ?? 5;
  const hintsSlack =
    opts.maxHints > 0 ? 1 - opts.hintsUsed / opts.maxHints : 1;
  const errorsSlack =
    opts.maxMistakes > 0 ? 1 - opts.mistakes / opts.maxMistakes : 1;

  const hintsMultiplier = 1 + HINTS_BONUS_MAX * hintsSlack;
  const errorsMultiplier = 1 + ERRORS_BONUS_MAX * errorsSlack;

  const hintsBonus = Math.round(base * (hintsMultiplier - 1));
  const errorsBonus = Math.round(
    base * (errorsMultiplier - 1) * hintsMultiplier,
  );

  const grossReward = Math.round(base * hintsMultiplier * errorsMultiplier);

  // Apply daily cap.
  const remaining = Math.max(0, DAILY_EARN_CAP - opts.dailyEarnedBefore);
  const capped = grossReward > remaining;
  const capApplied = capped ? grossReward - remaining : 0;
  const netReward = Math.min(grossReward, remaining);

  return {
    base,
    hintsUsed: opts.hintsUsed,
    maxHints: opts.maxHints,
    hintsMultiplier,
    hintsBonus,
    mistakes: opts.mistakes,
    maxMistakes: opts.maxMistakes,
    errorsMultiplier,
    errorsBonus,
    grossReward,
    capped,
    capApplied,
    netReward,
    dailyEarnedBefore: opts.dailyEarnedBefore,
    dailyEarnedAfter: opts.dailyEarnedBefore + netReward,
    dailyCap: DAILY_EARN_CAP,
  };
}

// ---------- ALN purchase products ----------
//
// EXCHANGE RATE: 10 ALN (game credit) = 1 ALIEN (real token)
//   So 50 ALN = 5 ALIEN, 250 ALN = 25 ALIEN, 1000 ALN = 100 ALIEN
//
// ALIEN token has 9 decimals, so:
//   5 ALIEN   = 5_000_000_000 base units
//   25 ALIEN  = 25_000_000_000 base units
//   100 ALIEN = 100_000_000_000 base units
//
// These are REAL amounts — no test products. Players pay real ALIEN tokens
// and receive real game credit. Withdrawals convert back at the same 10:1
// ratio (50 ALN → 5 ALIEN tokens sent to their wallet).

export const ALN_PER_ALIEN = 10; // game ALN per 1 real ALIEN token
const ALIEN_DECIMALS = 9;

/** Convert real ALIEN tokens → smallest on-chain base units (string). */
function alienToBaseUnits(alienTokens: number): string {
  return String(Math.floor(alienTokens * Math.pow(10, ALIEN_DECIMALS)));
}

export interface AlnProduct {
  id: string;
  name: string;
  description: string;
  aln: number; // game ALN credit
  alienTokens: number; // real ALIEN tokens charged
  price: string; // human-readable price label
  amount: string; // smallest on-chain base units
  token: "ALIEN";
  network: "alien";
}

export const ALN_PRODUCTS: AlnProduct[] = [
  {
    id: "alien-aln-50",
    name: "Signal Boost",
    description: "50 ALN — one Transcendent entry fee.",
    aln: 50,
    alienTokens: 5,
    price: "5 ALIEN",
    amount: alienToBaseUnits(5),
    token: "ALIEN",
    network: "alien",
  },
  {
    id: "alien-aln-250",
    name: "Operative Cache",
    description: "250 ALN — best value for regular players.",
    aln: 250,
    alienTokens: 25,
    price: "25 ALIEN",
    amount: alienToBaseUnits(25),
    token: "ALIEN",
    network: "alien",
  },
  {
    id: "alien-aln-1000",
    name: "Commander's Vault",
    description: "1,000 ALN — never worry about caveats again.",
    aln: 1000,
    alienTokens: 100,
    price: "100 ALIEN",
    amount: alienToBaseUnits(100),
    token: "ALIEN",
    network: "alien",
  },
  {
    id: "alien-aln-5000",
    name: "Transcendent Reserve",
    description: "5,000 ALN — for the dedicated puzzle operative.",
    aln: 5000,
    alienTokens: 500,
    price: "500 ALIEN",
    amount: alienToBaseUnits(500),
    token: "ALIEN",
    network: "alien",
  },
];

// Test products removed — all purchases are real now.
// (Kept as empty array for backward compat with imports.)
export const ALN_TEST_PRODUCTS: AlnProduct[] = [];

// ---------- storage ----------

export interface AlnTransaction {
  id: string;
  type: "earn" | "spend" | "purchase" | "entry_fee";
  amount: number;
  description: string;
  timestamp: number;
}

interface AlnStore {
  balance: number;
  transactions: AlnTransaction[];
}

function readStore(): AlnStore {
  if (typeof window === "undefined") {
    return { balance: STARTING_BALANCE, transactions: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial: AlnStore = { balance: STARTING_BALANCE, transactions: [] };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as AlnStore;
    if (typeof parsed.balance !== "number" || !Array.isArray(parsed.transactions)) {
      return { balance: STARTING_BALANCE, transactions: [] };
    }
    return parsed;
  } catch {
    return { balance: STARTING_BALANCE, transactions: [] };
  }
}

function writeStore(store: AlnStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

// ---------- daily cap tracking ----------

interface DailyEarnings {
  date: string; // YYYY-MM-DD (UTC)
  earned: number;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function readDaily(): DailyEarnings {
  if (typeof window === "undefined") {
    return { date: todayUTC(), earned: 0 };
  }
  try {
    const raw = window.localStorage.getItem(DAILY_KEY);
    if (!raw) return { date: todayUTC(), earned: 0 };
    const parsed = JSON.parse(raw) as DailyEarnings;
    if (parsed.date !== todayUTC()) {
      // Reset for new UTC day.
      const fresh: DailyEarnings = { date: todayUTC(), earned: 0 };
      window.localStorage.setItem(DAILY_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return parsed;
  } catch {
    return { date: todayUTC(), earned: 0 };
  }
}

function writeDaily(d: DailyEarnings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAILY_KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}

// ---------- public API ----------

export function getAlnBalance(): number {
  return readStore().balance;
}

export function getAlnTransactions(): AlnTransaction[] {
  return readStore().transactions.slice().reverse();
}

export function getDailyEarnings(): { earned: number; cap: number; remaining: number } {
  const d = readDaily();
  return {
    earned: d.earned,
    cap: DAILY_EARN_CAP,
    remaining: Math.max(0, DAILY_EARN_CAP - d.earned),
  };
}

function pushTransaction(
  store: AlnStore,
  type: AlnTransaction["type"],
  amount: number,
  description: string,
): AlnStore {
  const tx: AlnTransaction = {
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    amount,
    description,
    timestamp: Date.now(),
  };
  return {
    balance: store.balance + amount,
    transactions: [...store.transactions, tx].slice(-100),
  };
}

export function addAln(
  type: AlnTransaction["type"],
  amount: number,
  description: string,
): number {
  const store = readStore();
  const next = pushTransaction(store, type, amount, description);
  writeStore(next);
  return next.balance;
}

/**
 * Credit a puzzle-solve reward AND update the daily cap counter.
 * Returns the breakdown so the caller can show the player what they got.
 */
export function creditSolveReward(breakdown: RewardBreakdown): void {
  if (breakdown.netReward <= 0) return;
  const store = readStore();
  const next = pushTransaction(
    store,
    "earn",
    breakdown.netReward,
    `Solved ${breakdown.dailyEarnedAfter >= breakdown.dailyCap ? "(daily cap reached)" : ""}`.trim(),
  );
  writeStore(next);

  const d = readDaily();
  d.earned = Math.min(DAILY_EARN_CAP, d.earned + breakdown.netReward);
  writeDaily(d);
}

export function spendAln(amount: number, description: string): boolean {
  const store = readStore();
  if (store.balance < amount) return false;
  const next = pushTransaction(store, "spend", -amount, description);
  writeStore(next);
  return true;
}

/**
 * Charge an entry fee. Returns true if the player could afford it.
 * If the player can't afford it, the balance is untouched.
 */
export function chargeEntryFee(amount: number, description: string): boolean {
  if (amount === 0) return true;
  const store = readStore();
  if (store.balance < amount) return false;
  const next = pushTransaction(store, "entry_fee", -amount, description);
  writeStore(next);
  return true;
}

export function resetAlnStore(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(DAILY_KEY);
}

// ---------- formatting ----------

export function formatAlienAmount(rawAmount: string): string {
  const whole = rawAmount.padStart(ALN_DECIMALS + 1, "0");
  const intPart = whole.slice(0, -ALN_DECIMALS);
  const fracPart = whole.slice(-ALN_DECIMALS).replace(/0+$/, "");
  const formatted = fracPart ? `${intPart}.${fracPart}` : intPart;
  return `${formatted} ALIEN`;
}

export function formatAlnCredit(balance: number): string {
  return `${balance.toLocaleString()} ALN`;
}
