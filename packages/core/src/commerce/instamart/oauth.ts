import { createHash, randomBytes } from "node:crypto";

import { swiggyBase } from "./config";

/**
 * Signing a member in to their own Swiggy account (OAuth 2.1 + PKCE S256),
 * against the endpoints Swiggy publishes in its RFC 8414 metadata:
 * `/auth/register` (dynamic client registration), `/auth/authorize` (where
 * the person types their phone number and OTP — on Swiggy's page, never
 * ours) and `/auth/token` (code and refresh exchanges, JSON bodies).
 *
 * Tokens never leave the server: the caller keeps them in the service-role
 * `instamart_tokens` table. Nothing here logs a token or a code.
 */

export type SwiggyTokens = { accessToken: string; refreshToken: string | null; expiresAt: Date };

export class SwiggyAuthError extends Error {
  constructor(
    /** Closed words: "register_failed", "exchange_failed", "refresh_failed", "invalid_grant". */
    readonly code: "register_failed" | "exchange_failed" | "refresh_failed" | "invalid_grant",
  ) {
    super(`swiggy auth: ${code}`);
  }
}

type Fetch = typeof fetch;

const TIMEOUT_MS = 10_000;

/** A fresh PKCE pair and state, each from 32 random bytes. */
export function newAuthorization(): { state: string; stateHash: string; codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  return {
    state,
    stateHash: hashState(state),
    codeVerifier,
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
  };
}

/** The state is kept only as its hash, so a leaked row cannot complete a sign-in. */
export function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

/** Registers WonderHome as a public client (no secret) for one redirect URI. */
export async function registerClient(redirectUri: string, options: { fetch?: Fetch; base?: string } = {}): Promise<string> {
  const response = await (options.fetch ?? fetch)(`${options.base ?? swiggyBase()}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "WonderHome",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp:tools",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  const body = response?.ok ? ((await response.json().catch(() => null)) as { client_id?: unknown } | null) : null;
  if (typeof body?.client_id !== "string" || !body.client_id) throw new SwiggyAuthError("register_failed");
  return body.client_id;
}

/** Swiggy's sign-in page for this attempt. */
export function authorizeUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string; base?: string }): string {
  const url = new URL(`${input.base ?? swiggyBase()}/auth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", "mcp:tools");
  return url.toString();
}

export async function exchangeCode(
  input: { clientId: string; code: string; codeVerifier: string; redirectUri: string },
  options: { fetch?: Fetch; base?: string; now?: Date } = {},
): Promise<SwiggyTokens> {
  return tokenRequest(
    { grant_type: "authorization_code", client_id: input.clientId, code: input.code, code_verifier: input.codeVerifier, redirect_uri: input.redirectUri },
    "exchange_failed",
    options,
  );
}

/** A new access token (and a rotated refresh token) before the old one runs out. */
export async function refreshTokens(refreshToken: string, options: { fetch?: Fetch; base?: string; now?: Date; clientId?: string } = {}): Promise<SwiggyTokens> {
  return tokenRequest(
    { grant_type: "refresh_token", refresh_token: refreshToken, ...(options.clientId ? { client_id: options.clientId } : {}) },
    "refresh_failed",
    options,
  );
}

async function tokenRequest(
  body: Record<string, string>,
  failure: "exchange_failed" | "refresh_failed",
  options: { fetch?: Fetch; base?: string; now?: Date },
): Promise<SwiggyTokens> {
  const response = await (options.fetch ?? fetch)(`${options.base ?? swiggyBase()}/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!response) throw new SwiggyAuthError(failure);
  const json = (await response.json().catch(() => null)) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: unknown } | null;
  // An invalid grant is final: the person signs in again rather than retrying.
  if (json?.error === "invalid_grant") throw new SwiggyAuthError("invalid_grant");
  if (!response.ok || typeof json?.access_token !== "string" || !json.access_token) throw new SwiggyAuthError(failure);
  const seconds = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 5 * 86_400;
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" && json.refresh_token ? json.refresh_token : null,
    expiresAt: new Date((options.now ?? new Date()).getTime() + seconds * 1000),
  };
}

/** Refresh when a minute or less is left, as Swiggy asks. */
export function needsRefresh(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() <= 60_000;
}
