# Alien Sudoku — Mini App

A clean, mobile-first Sudoku puzzle built as an [Alien](https://alien.org) Mini App, themed as a holographic alien control console. Deploy on Vercel and launch it inside the Alien app via your mini-app deeplink.

Built on top of the [Alien Mini App boilerplate](https://docs.alien.org/quickstart/install-boilerplate) conventions:

- **Next.js 16** (App Router) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS 4** with Alien safe-area insets
- **`@alien-id/miniapps-react`** (`AlienProvider`) for the host bridge

No database, no auth, no payments — just a self-contained Sudoku game that runs in the Alien WebView.

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
