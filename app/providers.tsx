"use client";

import { AlienProvider } from "@alien-id/miniapps-react";

/**
 * App-level providers. For a simple Sudoku game we only need the Alien
 * Mini App provider — it injects the bridge to the Alien app, populates
 * the safe-area CSS variables, and exposes hooks like `useHaptics`,
 * `useLaunchParams`, etc. for future feature additions.
 *
 * In a browser (outside the Alien WebView) the bridge logs warnings but
 * keeps working, so local development is unaffected.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <AlienProvider>{children}</AlienProvider>;
}
