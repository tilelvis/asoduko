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

Open the **ALN Store** modal (top-right "+ Buy ALN" button):

| Pack | Price | ALN credit | ALN per ALIEN |
|---|---|---|---|
| Signal Boost | 0.01 ALIEN | 50 ALN | 5,000 |
| Operative Cache | 0.04 ALIEN | 250 ALN | 6,250 |
| Commander's Vault | 0.10 ALIEN | 1,000 ALN | 10,000 |

Payments go through the official Alien `usePayment` hook from `@alien-id/miniapps-react`. The flow:

1. Player picks a pack.
2. The hook calls `payment.pay({ recipient, amount, token: "ALIEN", network: "alien", invoice, item })`.
3. The Alien app shows the native payment sheet.
4. On `onPaid`, the player's local ALN balance is credited.

Real payments require `NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS` to be set to your provider address from the [Alien Developer Portal](https://dev.alien.org). Without it, the store falls back to **test products** that simulate successful payments.

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
