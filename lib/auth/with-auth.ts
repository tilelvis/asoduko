/**
 * JWT authentication middleware for wallet API routes.
 *
 * Uses the official `@alien-id/miniapps-auth-client` package's
 * `createAuthClient` to verify Alien SSO access tokens against the
 * Alien JWKS endpoint.
 *
 * The verified `auth.sub` is the player's Alien ID, which we use as the
 * primary key for their wallet. This is the ONLY identity source we trust.
 */

import { NextResponse } from "next/server";
import {
  JwtErrors,
  createAuthClient,
  type AuthClient,
} from "@alien-id/miniapps-auth-client";

export interface TokenInfo {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  [key: string]: unknown;
}

export type AuthContext = {
  auth: TokenInfo;
};

type AuthenticatedHandler = (
  request: Request,
  context: AuthContext,
) => Promise<NextResponse> | NextResponse;

// Singleton client — created lazily on first use.
let _client: AuthClient | null = null;

function getAuthClient(): AuthClient | null {
  if (_client) return _client;
  const audience = process.env.ALIEN_AUDIENCE;
  if (!audience) return null;
  const jwksUrl =
    process.env.ALIEN_JWKS_URL || "https://sso.alien-api.com/oauth/jwks";
  _client = createAuthClient({ audience, jwksUrl });
  return _client;
}

/** Extract the bearer token from an Authorization header. */
function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Wraps a route handler with Bearer-token authentication.
 * Returns 401 for missing/expired/invalid tokens, 500 for unexpected errors,
 * 503 if the server isn't configured for auth (no ALIEN_AUDIENCE).
 */
export function withAuth(
  handler: AuthenticatedHandler,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const client = getAuthClient();
    if (!client) {
      return NextResponse.json(
        { error: "Auth not configured. Set ALIEN_AUDIENCE on the server." },
        { status: 503 },
      );
    }

    const token = extractBearerToken(request.headers.get("Authorization"));
    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 },
      );
    }

    try {
      const auth = (await client.verifyToken(token)) as TokenInfo;
      if (!auth.sub) {
        return NextResponse.json(
          { error: "Invalid token: missing sub claim" },
          { status: 401 },
        );
      }
      return await handler(request, { auth });
    } catch (error) {
      if (error instanceof JwtErrors.JWTExpired) {
        return NextResponse.json(
          { error: "Token expired" },
          { status: 401 },
        );
      }
      if (error instanceof JwtErrors.JOSEError) {
        return NextResponse.json(
          { error: "Invalid token" },
          { status: 401 },
        );
      }
      console.error(
        `Auth error in ${new URL(request.url).pathname}:`,
        error,
      );
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
