/**
 * Server-side environment access for the wallet.
 * Validates required vars at startup with a clear error message.
 */

import { z } from "zod";

const serverSchema = z.object({
  // NeonDB Postgres connection (required — the wallet is server-authoritative)
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required (NeonDB connection string)"),

  // JWT verification
  ALIEN_AUDIENCE: z.string().min(1, "ALIEN_AUDIENCE is required (your provider address)"),
  ALIEN_JWKS_URL: z
    .string()
    .url()
    .default("https://sso.alien-api.com/oauth/jwks"),

  // Webhook signature verification (Ed25519)
  WEBHOOK_PUBLIC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "WEBHOOK_PUBLIC_KEY must be 64 hex chars")
    .optional(),

  // Withdrawal signing — the server uses this key to sign outgoing ALIEN
  // transfers. NEVER expose this to the client.
  ALIEN_WITHDRAW_PRIVATE_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ALIEN_WITHDRAW_PRIVATE_KEY must be 64 hex chars")
    .optional(),

  // Alien chain RPC endpoint (Solana-compatible JSON-RPC)
  ALIEN_RPC_URL: z.string().url().optional(),

  // ALIEN SPL token mint address
  ALIEN_TOKEN_MINT: z.string().min(32).optional(),

  // ALIEN token decimals (default 9)
  ALIEN_TOKEN_DECIMALS: z.coerce.number().int().positive().default(9),

  // Explorer base URL for tx links
  ALIEN_EXPLORER_URL: z.string().url().optional(),

  // Where deposits land (your provider address). Public, exposed to client.
  NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS: z.string().optional(),

  // Daily earn cap (server-enforced, not client-trusted)
  WALLET_DAILY_EARN_CAP: z.coerce.number().int().positive().default(500),

  // Minimum withdrawal in ALN (dust protection)
  WALLET_MIN_WITHDRAWAL: z.coerce.number().int().positive().default(50),

  // Exchange rate: how many game ALN credits equal 1 real ALIEN token.
  // 10:1 means 10 ALN = 1 ALIEN. Both deposits and withdrawals use this.
  ALN_PER_ALIEN: z.coerce.number().int().positive().default(10),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let _env: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (!_env) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) {
      const errs = Object.entries(parsed.error.flatten().fieldErrors)
        .map(([k, v]) => `  ${k}: ${v?.join(", ")}`)
        .join("\n");
      throw new Error(`Invalid server env:\n${errs}`);
    }
    _env = parsed.data;
  }
  return _env;
}

/**
 * In dev mode without ALIEN_AUDIENCE set, return a sentinel so the wallet
 * endpoints return a friendly "not configured" error instead of crashing.
 */
export function isWalletConfigured(): boolean {
  try {
    getServerEnv();
    return true;
  } catch {
    return false;
  }
}
