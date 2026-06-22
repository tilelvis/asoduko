import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alien Sudoku",
  description: "A clean, mobile-first Sudoku puzzle built as an Alien Mini App.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Respect the host app's safe-area insets.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2ff" },
    { media: "(prefers-color-scheme: dark)", color: "#050813" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {/*
            Single-viewport layout: 100dvh tall, no scrolling.
            The main element is a flex column that fills the screen between
            the safe-area insets. Children use flex-1 / shrink-0 to claim
            space. The board sizes itself with aspect-square inside the
            flexible middle region.
          */}
          <main className="mx-auto flex h-[100dvh] w-full max-w-md flex-col gap-2 overflow-hidden px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-[calc(env(safe-area-inset-top)+8px)] sm:px-4">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
