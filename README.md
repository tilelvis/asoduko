# Alien Sudoku — Mini App

A clean, mobile-first Sudoku puzzle built as an [Alien](https://alien.org) Mini App, themed as a holographic alien control console. Deploy on Vercel and launch it inside the Alien app via your mini-app deeplink.

Built on top of the [Alien Mini App boilerplate](https://docs.alien.org/quickstart/install-boilerplate) conventions:

- **Next.js 16** (App Router) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS 4** with Alien safe-area insets
- **`@alien-id/miniapps-react`** (`AlienProvider`) for the host bridge

No database, no auth, no webhook server — just a self-contained Sudoku game with an integrated ALN token economy that runs in the Alien WebView. Real ALIEN token purchases go through the official Alien payment bridge to your provider address; the spendable ALN balance is tracked client-side in `localStorage`.

---

## Difficulty Tiers

Six progressive ranks. Each tier drops more clues and tightens the mistake / hint budgets.

| Tier | Clues | Mistakes | Hints | Accent | Tagline |
|---|---|---|---|---|---|
| Rookie | 50 | 7 | 5 | cyan | First contact |
| Cadet | 42 | 6 | 4 | emerald | Orbital training |
| Operative | 36 | 5 | 3 | lime | Field deployment |
| Commander | 30 | 4 | 2 | amber | Sector authority |
| Architect | 26 | 3 | 2 | rose | Mind of the hive |
| Transcendent | 22 | 3 | 1 | violet | Beyond computation |

The active tier's accent color is applied to the entire UI in real time via CSS custom properties (`--accent`, `--accent-soft`, `--accent-faint`).

---

## ALN Token Economy

Players earn and spend **ALN** (Alien tokens) to recover from tough puzzles. The economy is deliberately tuned so the **house wins in aggregate** — even against highly skilled players — by combining four mechanisms:

1. **Entry fees** per tier (paid in ALN every game, win or lose)
2. **Skill multipliers** (the carrot — fewer hints + fewer errors = bigger payout)
3. **Tier-scaled caveat costs** (purging errors on Transcendent costs 10× Rookie)
4. **Daily earning cap** (the key — caps how much a perfect player can farm per UTC day)

### Earning ALN

Solve a puzzle to earn ALN, computed as:

```
reward = base × hintsMultiplier × errorsMultiplier
```

where:

```
hintsMultiplier  = 1 + 0.4 × (1 - hintsUsed / maxHints)    # 1.0 to 1.4
errorsMultiplier = 1 + 0.6 × (1 - mistakes / maxMistakes)  # 1.0 to 1.6
```

A **perfect game** (0 hints, 0 errors) gets a **2.24× multiplier**.

| Tier | Entry fee | Base reward | Avg reward (2 err, 1 hint) | Perfect reward |
|---|---|---|---|---|
| Rookie | 0 | 8 | 11 | 18 |
| Cadet | 5 | 18 | 24 | 40 |
| Operative | 10 | 35 | 47 | 78 |
| Commander | 25 | 65 | 87 | 146 |
| Architect | 50 | 110 | 147 | 246 |
| Transcendent | 100 | 180 | 240 | 403 |

The "Avg" column shows what a typical struggling-but-winning player earns; "Perfect" is the maximum (before daily cap).

**Daily earning cap**: 500 ALN / UTC day. Once hit, further solves that day earn 0 ALN. This is what stops a perfect player from farming indefinitely.

### Spending ALN — Caveats

Open the **Caveats** modal from the top-of-screen balance bar (or from the "Grid overloaded" lost-screen) to spend ALN on recoveries:

| Caveat | Rookie | Cadet | Operative | Commander | Architect | Transcendent |
|---|---|---|---|---|---|---|
| **Purge Errors** | 10 | 15 | 25 | 40 | 70 | 100 |
| **Refill Hints** | 10 | 10 | 10 | 10 | 10 | 10 |

Purge Errors scales aggressively with tier — on Transcendent, purging costs as much as the entry fee, so the strategic decision (purge + continue vs. restart and forfeit the entry fee) is genuinely interesting.

### House edge math

For an **average player** on Transcendent (assume 30% win rate, 1 caveat per loss):

```
EV(house) per game
  = P(lose) × (entryFee + avgCaveats)  −  P(win) × (avgReward − entryFee)
  = 0.7 × (100 + 100)  −  0.3 × (240 − 100)
  = 140  −  42
  = +98 ALN/game   ← house wins
```

For a **perfect player** (100% win rate, no caveats):

```
Per-game:  +403 − 100 = +303 ALN (player wins per game)
Per-day:   capped at 500 ALN (≈ 2 perfect Transcendent wins)
```

The perfect player is bounded by the daily cap. The average player bleeds ALN through entry fees + caveats. **In aggregate, the house always wins.**

Players who exhaust their ALN balance must top up via the in-app ALN Store, which charges real **ALIEN tokens** that go to your provider address.

### Buying ALN with real ALIEN tokens

Open the **ALN Store** modal (the "Buy" button in the action row):

| Pack | Price (real ALIEN) | ALN credit | ALN per ALIEN |
|---|---|---|---|
| Signal Boost | 5 ALIEN | 50 ALN | 10 |
| Operative Cache | 25 ALIEN | 250 ALN | 10 |
| Commander's Vault | 100 ALIEN | 1,000 ALN | 10 |
| Transcendent Reserve | 500 ALIEN | 5,000 ALN | 10 |

**Exchange rate is fixed at 10 ALN = 1 ALIEN** (configurable via `ALN_PER_ALIEN` env var). Same rate applies to withdrawals: 50 ALN credit → 5 ALIEN tokens sent to your wallet.

Payments go through the official Alien `usePayment` hook from `@alien-id/miniapps-react`. The flow:

1. Player picks a pack → POST `/api/wallet/deposit` registers a pending transaction with a server-issued invoice.
2. The hook calls `payment.pay({ recipient, amount, token: "ALIEN", network: "alien", invoice, item })`.
3. The Alien app shows the native payment sheet.
4. On settlement, Alien fires an Ed25519-signed webhook at `/api/webhooks/payment` → server verifies the signature + invoice match → credits the wallet atomically.

All purchases are **real** — there are no test products. Configure `NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS` + `WEBHOOK_PUBLIC_KEY` + `ALIEN_AUDIENCE` + `DATABASE_URL` to enable.

### Why local storage?

A full backend ledger (Postgres + webhook stack) is overkill for a Sudoku game. The ALN balance is tracked client-side in `localStorage`, namespaced under `alien-sudoku:aln`. The daily cap counter is stored under `alien-sudoku:aln-daily`. The actual on-chain ALIEN payment is still 100% real and goes to your provider address — we just track the spendable credit locally.

If you want server-side verification later, wire up the official `/api/webhooks/payment` endpoint from the Alien boilerplate to confirm on-chain settlement before crediting.

### Tuning the economy

All constants live in [`lib/alien/aln-store.ts`](lib/alien/aln-store.ts):

- `ENTRY_FEES` — increase to make the house edge stronger
- `SOLVE_REWARD_BASE` — increase to attract more players (but weakens edge)
- `HINTS_BONUS_MAX` / `ERRORS_BONUS_MAX` — increase to reward skill more
- `DAILY_EARN_CAP` — decrease to tighten the perfect-player cap
- `CAVEAT_COSTS_PURGE` — increase to make recovery more painful

Every constant is commented with its effect on the house edge.

---

## Secure Wallet (Deposits & Withdrawals)

The wallet has two modes. **Fallback mode** (default, no env vars) tracks ALN in `localStorage` — fine for dev but trivially gameable. **Secure mode** (set `ALIEN_AUDIENCE` + wallet keys) makes the server the source of truth.

### Architecture

```
                       ┌─────────────────────────────────┐
                       │       Alien Network (chain)      │
                       └────────┬───────────────┬─────────┘
                                │               │
                   deposits     │               │  withdrawals
                   (player pays)│               │ (server signs)
                                ▼               ▼
┌──────────────┐    payment.pay()    ┌──────────────────────┐
│  Alien App   │───────────────────▶│  /api/webhooks/      │
│  (WebView)   │                    │  payment             │
└──────┬───────┘                    │  (Ed25519-verified)  │
       │                            └──────────┬───────────┘
       │ JWT (auth.sub)                        │ credit
       │                                       ▼
       │         ┌──────────────────────────────────────┐
       └────────▶│  /api/wallet/* (Next.js API routes)  │
                 │  • balance    • claim                 │
                 │  • deposit    • withdraw              │
                 │  • transactions                       │
                 └──────────────┬───────────────────────┘
                                │ atomic UPDATE … RETURNING
                                ▼
                       ┌──────────────────┐
                       │  NeonDB Postgres  │
                       │  (users + txs +   │
                       │   audit_log)      │
                       │  UUID PKs         │
                       └──────────────────┘
```

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/wallet/balance` | JWT | Returns balance + daily cap + recent transactions |
| POST | `/api/wallet/deposit` | JWT + idempotency | Registers a pending deposit, returns invoice for `payment.pay()` |
| POST | `/api/wallet/withdraw` | JWT + idempotency | **Server signs + broadcasts ALIEN transfer** to player's wallet |
| POST | `/api/wallet/claim` | JWT + gameSeed | Credits earned ALN (server recomputes reward, enforces daily cap) |
| GET | `/api/wallet/transactions` | JWT | Full transaction history |
| POST | `/api/webhooks/payment` | Ed25519 sig | Alien calls this on settlement → credits the wallet |

### Security model

**Threats mitigated**:

| Threat | Mitigation |
|---|---|
| localStorage tampering | Balance is server-side; client `balance` is read-only display |
| Replay attacks | Every mutation requires a UUID `idempotencyKey`; duplicates return 409 |
| Double-spend | `BEGIN IMMEDIATE` transaction locks the balance row; concurrent requests serialize |
| Fake deposits | Wallet only credits after Ed25519-signed webhook confirms on-chain settlement |
| Bot farming | Daily cap server-enforced; rate limits on claim (1 per 5s); gameSeed can only be claimed once |
| Dust attacks | `WALLET_MIN_WITHDRAWAL` (default 50 ALN) enforced server-side |
| Withdrawal broadcast failure | Atomic refund — if on-chain tx fails, ALN is credited back automatically |
| JWT forgery | Verified via Alien's JWKS using `@alien-id/miniapps-auth-client` |
| Webhook forgery | Ed25519 signature verified against `WEBHOOK_PUBLIC_KEY` |
| Private key leak | `ALIEN_WITHDRAW_PRIVATE_KEY` is server-only, never sent to client, never logged |

**Threats NOT fully mitigated** (acknowledged):

- **Hot wallet drain**: if `ALIEN_WITHDRAW_PRIVATE_KEY` is compromised, an attacker can drain the hot wallet. Mitigation: keep only operational funds in the hot wallet; top up from cold storage manually; monitor balance and alert on threshold.
- **Fake game claims**: the server can't fully verify a Sudoku solve without storing the puzzle + move history. The mitigations are: daily cap (limits damage), rate limiting (slows farming), server-authoritative reward math (can't inflate amounts), and `gameSeed` idempotency (can't claim the same game twice). For full anti-cheat, see "Going to full anti-cheat" below.
- **NeonDB connection limits**: Neon's free tier has connection limits. The `@neondatabase/serverless` driver uses HTTP-based queries (no persistent connections), so this is not an issue — each query is an independent HTTP request through Neon's pool.

### Withdrawal flow (player → ALIEN tokens)

1. Player taps "Cash" button → WithdrawModal opens
2. Enters amount (≥ 50 ALN) + recipient Alien wallet address
3. Reviews the conversion (5000 ALN = 1 ALIEN by default)
4. Confirms → `POST /api/wallet/withdraw` with JWT + idempotency key
5. Server atomically debits the wallet (`BEGIN IMMEDIATE`)
6. Server signs + broadcasts the ALIEN transfer using `ALIEN_WITHDRAW_PRIVATE_KEY`
7. On success: returns `txHash` + explorer URL → modal shows "Withdrawal complete"
8. On failure: **automatically refunds** the ALN credit → modal shows error + refund confirmation

The signing key **never leaves the server**. The client only sees the resulting `txHash`.

### Going to production

1. **Set env vars** in Vercel Project Settings:
   - `DATABASE_URL` — your NeonDB pooled connection string (from console.neon.tech)
   - `ALIEN_AUDIENCE` — your provider address
   - `WEBHOOK_PUBLIC_KEY` — from Dev Portal → Webhooks
   - `ALIEN_WITHDRAW_PRIVATE_KEY` — 64-char hex Ed25519 private key for your hot wallet
   - `ALIEN_RPC_URL` — Alien network RPC endpoint (Solana-compatible JSON-RPC)
   - `ALIEN_TOKEN_MINT` — SPL token mint address for ALIEN
   - `ALIEN_TOKEN_DECIMALS` — defaults to 9
   - `NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS` — same as `ALIEN_AUDIENCE`
   - `WALLET_DAILY_EARN_CAP` (optional, default 500)
   - `WALLET_MIN_WITHDRAWAL` (optional, default 50)
   - `ALN_PER_ALIEN` (optional, default 10)

2. **Database auto-migrates on every build** — the `prebuild` script (`scripts/migrate.mjs`) runs `CREATE TABLE IF NOT EXISTS` for `users`, `transactions`, `audit_log`, and `leaderboard_entries` tables, plus all indexes. It's idempotent so it's safe to run on every deploy. Verify by checking the build logs for `✅ Migrations complete`.

3. **Register the webhook** in the Dev Portal pointing to `https://your-vercel-url.vercel.app/api/webhooks/payment`

4. **Fund the hot wallet** — send ALIEN tokens to the address corresponding to `ALIEN_WITHDRAW_PRIVATE_KEY`. This is the wallet that signs + broadcasts withdrawals. Keep it topped up; monitor the balance via the `getHotWalletBalance()` helper in `lib/alien/chain.ts`.

5. **Real chain SDK is wired up** — `lib/alien/chain.ts` uses `@solana/web3.js` + `@solana/spl-token` to sign and broadcast SPL token transfers (the Alien network is Solana-compatible). The hot wallet keypair is loaded from `ALIEN_WITHDRAW_PRIVATE_KEY` and never leaves the server process. Transactions are confirmed before returning, so the caller knows the transfer landed on-chain. If a native `@alien-id/chain` SDK ships in the future, swap the internals of `chain.ts` — the exported interface stays the same.

---

## Leaderboard

Global per-tier leaderboard stored in NeonDB. Players compete for the highest score (= reward earned, which naturally rewards harder tiers + fewer hints + fewer errors). Tie-breaker: fastest time.

### Schema

- `leaderboard_entries` table — one row per `(user_id, difficulty)`, storing `best_score`, `best_time_seconds`, `best_mistakes`, `best_hints_used`, `games_played`, `games_won`.
- UNIQUE constraint on `(user_id, difficulty)` — atomic upserts via `INSERT ... ON CONFLICT DO UPDATE`.
- Index on `(difficulty, best_score DESC)` for fast top-N queries.

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/leaderboard/top?difficulty=X&limit=10` | Public | Top N players for a tier |
| POST | `/api/leaderboard/submit` | JWT + gameSeed | Submit a solve score (server recomputes the score — client's claim is ignored) |
| GET | `/api/leaderboard/rank?difficulty=X` | JWT | Player's rank + 2 neighbors above + 2 below |
| GET | `/api/leaderboard/rank?all=true` | JWT | Player's best stats across all 6 tiers |

### Anti-cheat

- The server **re-computes the score** from `difficulty + mistakes + hintsUsed` using the same constants as `/api/wallet/claim`. The client's claimed score is ignored.
- Skill metrics are validated against the tier's max (`mistakes <= maxMistakes`, `hintsUsed <= maxHints`).
- `gameSeed` (UUID) ties the leaderboard submission to the claim — each game can only be submitted once.
- Rate limited: 10 burst, 1 per 5s per user.

### Auto-submission

When a player solves a puzzle, the `awardSolve()` hook calls both `/api/wallet/claim` and `/api/leaderboard/submit` in sequence. The leaderboard submission is best-effort (fire-and-forget) — if it fails, the reward still credits. The win modal shows the player's new rank if it's a new personal best.

### Going to full anti-cheat

The current `claim` endpoint trusts the client's reported `mistakes` and `hintsUsed`. For full anti-cheat:

1. Generate puzzles server-side (`POST /api/puzzle/new` returns puzzle + seed)
2. Store the solution + difficulty keyed by `gameSeed`
3. On `claim`, verify the player's submitted board matches the stored solution
4. Track hints/mistakes via server-side events (`POST /api/puzzle/hint`, `/api/puzzle/mistake`)

This is left as a follow-up because it materially changes the game architecture (server becomes the puzzle authority).

---

## Visual Theme

- **Deep-space void background** with a subtle starfield (radial-gradient dots).
- **Neon accent glow** on the active cell, given digits, selected tier, and primary buttons.
- **Holographic scanlines** overlay on the board (CRT-style).
- **Glassy stat panels** with backdrop blur.
- **Per-tier accent palette** that re-themes the whole UI when you switch ranks.
- **Monospace typography** (Geist Mono) for all numbers, labels, and tier names.
- **Light mode** gracefully degrades to a bright "daylight observation deck" palette while preserving the neon accents.

---

## Quick start (local)

```bash
# 1. Use Bun (recommended) or npm / pnpm
bun install        # or: npm install

# 2. Run the dev server
bun run dev        # or: npm run dev

# 3. Open http://localhost:3000
```

In a regular browser the Alien bridge logs warnings but the game still works end-to-end — perfect for development.

---

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, click **New Project → Import** the repository.
3. Framework preset: **Next.js**. No env vars required for the Sudoku-only build.
4. Click **Deploy**.
5. Copy your Vercel URL (e.g. `https://alien-sudoku.vercel.app`).

---

## Register as an Alien Mini App

Follow the [Create Mini App guide](https://docs.alien.org/quickstart/create-miniapp):

1. Go to <https://dev.alien.org/> and sign in.
2. Dashboard → **Mini Apps** → **Create Mini App**.
3. Fill in:
   - **Name:** Alien Sudoku
   - **Description:** A clean Sudoku puzzle for the Alien app.
   - **Logo:** 512×512px icon.
   - **URL:** `https://your-vercel-url.vercel.app`
   - **Allowed Origins:** `https://your-vercel-url.vercel.app`
4. Save. A deeplink like `https://alien.app/miniapp/<your-slug>` is generated.
5. Open the deeplink on a device with the Alien app installed — your Sudoku launches in the Alien WebView.

---

## How to play

- **Tap a cell** to select it. Selected peers (row, column, 3×3 box) and matching digits are highlighted.
- **Tap a digit (1–9)** to place it. Wrong digits count as a mistake — you have 5.
- **Notes mode** lets you pencil-mark candidate digits in an empty cell.
- **Erase** clears a cell or its notes.
- **Undo** reverts the last move.
- **Hint** reveals one correct digit (3 hints per game).
- **New Game** starts a fresh puzzle at the selected difficulty (Easy / Medium / Hard).
- **Keyboard:** arrows to move, 1–9 to place, Backspace to erase, N for notes, Ctrl/Cmd+Z to undo.

---

## Project structure

```
sudoku-alien-miniapp/
├── app/
│   ├── globals.css        # Tailwind + safe-area CSS variables
│   ├── layout.tsx         # Root layout with <AlienProvider/>
│   ├── page.tsx           # Home page
│   └── providers.tsx      # AlienProvider wrapper
├── components/
│   └── sudoku/
│       ├── board.tsx      # 9x9 grid
│       ├── cell.tsx       # Individual cell
│       ├── controls.tsx   # Difficulty / timer / mistakes / hint / new game
│       ├── number-pad.tsx # 1-9 + erase + notes + undo
│       └── sudoku-game.tsx# Top-level game state machine
├── lib/
│   └── sudoku/
│       ├── generator.ts   # Puzzle generation + uniqueness check
│       ├── solver.ts      # Backtracking solver
│       ├── types.ts       # Shared types
│       └── index.ts       # Barrel
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
└── README.md
```

---

## Next steps

You can extend this miniapp with the rest of the Alien SDK — haptic feedback on mistakes, clipboard for sharing scores, payments for "buy more hints", SSO for leaderboards — all documented at <https://docs.alien.org>.
