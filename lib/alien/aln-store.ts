/**
 * ALN (Alien Token) store.
 *
 * A lightweight client-side balance ledger. The player earns ALN by solving
 * puzzles and spends ALN on caveats (currently: "Purge Errors" — reset the
 * mistake counter). Real ALN can also be purchased via the Alien payment
 * bridge using the ALIEN token on the Alien network.
 *
 * Persistence: localStorage, namespaced under `alien-sudoku:aln`.
 * Shape: `{ balance: number, transactions: Transaction[] }`.
 *
 * Why localStorage and not a backend?
 *   The Alien boilerplate ships a full Postgres + webhook stack for payments,
 *   but a simple Sudoku game doesn't need a server-side ledger. The purchase
 *   itself still goes through the real Alien `payment:request` bridge call,
 *   so real tokens are transferred to your provider address — we just track
 *   the resulting credit locally.
 */

const STORAGE_KEY = "alien-sudoku:aln";
const ALN_DECIMALS = 9;

export interface AlnTransaction {
  id: string;
  type: "earn" | "spend" | "purchase";
  amount: number; // positive for earn/purchase, negative for spend
  description: string;
  timestamp: number;
}

interface AlnStore {
  balance: number;
  transactions: AlnTransaction[];
}

// ---------- defaults ----------

/** Starting balance for first-time players. */
export const STARTING_BALANCE = 50;

/** Reward for solving a puzzle, scaled by difficulty tier. */
export const SOLVE_REWARD: Record<string, number> = {
  rookie: 5,
  cadet: 10,
  operative: 18,
  commander: 30,
  architect: 50,
  transcendent: 80,
};

/** Cost (in ALN) of each caveat. */
export const CAVEAT_COSTS = {
  purgeErrors: 15, // reset mistake counter to 0
  refillHints: 10, // restore hints to the tier's max
} as const;

export type CaveatType = keyof typeof CAVEAT_COSTS;

// ---------- ALN purchase products ----------

/**
 * Purchase options for buying ALN with real Alien tokens.
 *
 * `amount` is in the smallest on-chain unit. ALIEN has 9 decimals,
 * so 1 ALN = 10^9 base units. We use small USDC-style prices that
 * match the boilerplate's `DIAMOND_PRODUCTS` shape.
 */
export interface AlnProduct {
  id: string;
  name: string;
  description: string;
  aln: number; // ALN credit added to local balance on success
  price: string; // human-readable price label
  amount: string; // smallest on-chain unit (string for precision)
  token: "ALIEN";
  network: "alien";
  test?: "paid" | "paid:failed" | "cancelled" | "error:insufficient_balance" | "error:network_error" | "error:unknown";
}

const RECIPIENT = process.env.NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS || "";

export const ALN_PRODUCTS: AlnProduct[] = [
  {
    id: "alien-aln-50",
    name: "Signal Boost",
    description: "50 ALN — enough for three error purges.",
    aln: 50,
    price: "0.01 ALIEN",
    amount: "10000000",
    token: "ALIEN",
    network: "alien",
  },
  {
    id: "alien-aln-250",
    name: "Operative Cache",
    description: "250 ALN — best value for regular players.",
    aln: 250,
    price: "0.04 ALIEN",
    amount: "40000000",
    token: "ALIEN",
    network: "alien",
  },
  {
    id: "alien-aln-1000",
    name: "Commander's Vault",
    description: "1,000 ALN — never worry about mistakes again.",
    aln: 1000,
    price: "0.10 ALIEN",
    amount: "100000000",
    token: "ALIEN",
    network: "alien",
  },
];

/**
 * Test-mode products — used when running outside the Alien app or when
 * `NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS` is not set. They go through the
 * same `payment.pay()` call but with `test: "paid"`, which the bridge
 * simulates without moving real tokens.
 */
export const ALN_TEST_PRODUCTS: AlnProduct[] = [
  {
    id: "test-alien-aln-50",
    name: "Signal Boost (Test)",
    description: "Test purchase — no real ALIEN transferred.",
    aln: 50,
    price: "0.01 ALIEN",
    amount: "10000000",
    token: "ALIEN",
    network: "alien",
    test: "paid",
  },
  {
    id: "test-alien-aln-250",
    name: "Operative Cache (Test)",
    description: "Test purchase — no real ALIEN transferred.",
    aln: 250,
    price: "0.04 ALIEN",
    amount: "40000000",
    token: "ALIEN",
    network: "alien",
    test: "paid",
  },
];

// ---------- storage helpers ----------

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
    // localStorage might be full or disabled (private mode) — fail silently.
  }
}

// ---------- public API ----------

export function getAlnBalance(): number {
  return readStore().balance;
}

export function getAlnTransactions(): AlnTransaction[] {
  return readStore().transactions.slice().reverse(); // newest first
}

export function addAln(
  type: AlnTransaction["type"],
  amount: number,
  description: string,
): number {
  const store = readStore();
  const tx: AlnTransaction = {
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    amount,
    description,
    timestamp: Date.now(),
  };
  const next: AlnStore = {
    balance: store.balance + amount,
    transactions: [...store.transactions, tx].slice(-100), // cap history
  };
  writeStore(next);
  return next.balance;
}

export function spendAln(amount: number, description: string): boolean {
  const store = readStore();
  if (store.balance < amount) return false;
  const tx: AlnTransaction = {
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "spend",
    amount: -amount,
    description,
    timestamp: Date.now(),
  };
  const next: AlnStore = {
    balance: store.balance - amount,
    transactions: [...store.transactions, tx].slice(-100),
  };
  writeStore(next);
  return true;
}

export function resetAlnStore(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

// ---------- formatting ----------

/** Format a raw on-chain amount (smallest unit) as a human-readable ALIEN string. */
export function formatAlienAmount(rawAmount: string): string {
  const whole = rawAmount.padStart(ALN_DECIMALS + 1, "0");
  const intPart = whole.slice(0, -ALN_DECIMALS);
  const fracPart = whole.slice(-ALN_DECIMALS).replace(/0+$/, "");
  const formatted = fracPart ? `${intPart}.${fracPart}` : intPart;
  return `${formatted} ALIEN`;
}

/** Format an integer ALN credit balance (e.g. 1234) as "1,234 ALN". */
export function formatAlnCredit(balance: number): string {
  return `${balance.toLocaleString()} ALN`;
}
