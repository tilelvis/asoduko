import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getServerEnv, isWalletConfigured } from "@/lib/env";
import {
  isChainConfigured,
  getHotWalletBalance,
  getHotWalletAddress,
} from "@/lib/alien/chain";

/**
 * GET /api/health
 *
 * Returns the operational status of all subsystems:
 *   - Database (NeonDB Postgres) connectivity + table existence
 *   - Hot wallet (ALIEN + SOL balance, for monitoring/alerting)
 *   - Environment configuration (which vars are set)
 *   - Auth/JWT, webhook, withdrawal subsystem status
 *
 * This endpoint is PUBLIC (no auth) so it can be polled by:
 *   - Vercel's built-in uptime monitoring
 *   - UptimeRobot / BetterStack / Pingdom
 *   - Your own alerting (curl in a cron, Grafana, etc.)
 *
 * The response shape is intentionally flat + machine-readable. A 200 means
 * "operational", a 503 means "degraded" — some subsystem is failing.
 *
 * NOTE: The hot wallet balance check is best-effort. If the RPC is
 * unreachable, the endpoint still returns 200 with the wallet check marked
 * "error" — this is so a transient RPC outage doesn't trigger false alarms
 * for the DB + auth subsystems.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SubsystemStatus {
  status: "ok" | "degraded" | "error" | "not_configured";
  latency_ms?: number;
  detail?: string;
}

export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, SubsystemStatus> = {};
  let overallOk = true;

  // ---------- 1. Database (NeonDB) ----------
  const dbStart = Date.now();
  try {
    const url = process.env.DATABASE_URL;
    if (!url || !url.startsWith("postgres")) {
      checks.database = {
        status: "not_configured",
        detail: "DATABASE_URL not set or not a postgres:// URL",
      };
      overallOk = false;
    } else {
      const sql = neon(url);
      // Lightweight ping — just select 1. If the connection works, this
      // returns [{?column?: 1}] in <50ms.
      await sql`SELECT 1`;
      // Also verify the critical tables exist.
      const tables = (await sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'transactions', 'audit_log', 'leaderboard_entries')
      `) as Array<{ table_name: string }>;
      const tableNames = tables.map((t) => t.table_name).sort();
      const expected = ["audit_log", "leaderboard_entries", "transactions", "users"];
      const tablesOk =
        tableNames.length === expected.length &&
        tableNames.every((t, i) => t === expected[i]);
      checks.database = {
        status: tablesOk ? "ok" : "degraded",
        latency_ms: Date.now() - dbStart,
        detail: tablesOk
          ? `${tableNames.length}/4 tables present`
          : `Missing tables. Found: ${tableNames.join(", ") || "none"}`,
      };
      if (!tablesOk) overallOk = false;
    }
  } catch (err) {
    checks.database = {
      status: "error",
      latency_ms: Date.now() - dbStart,
      detail: err instanceof Error ? err.message : String(err),
    };
    overallOk = false;
  }

  // ---------- 2. Auth / JWT ----------
  try {
    const audience = process.env.ALIEN_AUDIENCE;
    checks.auth = audience
      ? { status: "ok", detail: `ALIEN_AUDIENCE set (${audience.slice(0, 8)}…)` }
      : { status: "not_configured", detail: "ALIEN_AUDIENCE not set" };
    if (!audience) overallOk = false;
  } catch (err) {
    checks.auth = {
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
    overallOk = false;
  }

  // ---------- 3. Webhook signature verification ----------
  checks.webhook = process.env.WEBHOOK_PUBLIC_KEY
    ? { status: "ok", detail: "WEBHOOK_PUBLIC_KEY set (64 chars)" }
    : { status: "not_configured", detail: "WEBHOOK_PUBLIC_KEY not set — deposits won't credit" };

  // ---------- 4. Withdrawal chain SDK ----------
  if (isChainConfigured()) {
    // Best-effort hot wallet balance check. Don't fail the whole health
    // check if the RPC is flaky — just mark it degraded.
    try {
      const balance = await getHotWalletBalance();
      const lowThreshold = parseFloat(
        process.env.HOT_WALLET_LOW_THRESHOLD || "10",
      );
      const status =
        balance.alienBalance < lowThreshold ? "degraded" : "ok";
      checks.withdrawal = {
        status,
        latency_ms: Date.now() - startedAt,
        detail: `Hot wallet ${getHotWalletAddress().slice(0, 8)}… · ${balance.alienBalance.toFixed(2)} ALIEN · ${balance.solBalance.toFixed(4)} SOL`,
      };
      if (status === "degraded") {
        checks.withdrawal.detail += ` · ⚠ below low-water mark (${lowThreshold} ALIEN)`;
      }
    } catch (err) {
      checks.withdrawal = {
        status: "degraded",
        detail: `Chain SDK configured but RPC unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else {
    checks.withdrawal = {
      status: "not_configured",
      detail: "Missing ALIEN_WITHDRAW_PRIVATE_KEY / ALIEN_RPC_URL / ALIEN_TOKEN_MINT",
    };
  }

  // ---------- 5. Deposit recipient ----------
  checks.deposit_recipient = process.env.NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS
    ? { status: "ok", detail: "NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS set" }
    : { status: "not_configured", detail: "NEXT_PUBLIC_ALIEN_RECIPIENT_ADDRESS not set" };

  // ---------- 6. Server env validation ----------
  try {
    getServerEnv();
    checks.env = { status: "ok", detail: "All required server env vars valid" };
  } catch (err) {
    checks.env = {
      status: "error",
      detail: err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
    overallOk = false;
  }

  // ---------- 7. Wallet subsystem configured ----------
  checks.wallet = isWalletConfigured()
    ? { status: "ok", detail: "Wallet operational (DB + auth configured)" }
    : { status: "not_configured", detail: "Wallet not configured" };

  const response = {
    status: overallOk ? "operational" : "degraded",
    timestamp: new Date().toISOString(),
    total_latency_ms: Date.now() - startedAt,
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    checks,
  };

  return NextResponse.json(response, {
    status: overallOk ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Health-Status": overallOk ? "ok" : "degraded",
    },
  });
}
