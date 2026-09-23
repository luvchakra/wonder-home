import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { DEFAULT_VOICE_SCOPES, normaliseScopes, type VoiceScope } from "./scopes";

/**
 * WonderHome as the OAuth 2.0 authorization server a voice provider links
 * through (voice phase 2; Alexa account linking uses the authorization-code
 * grant, with PKCE where the provider sends it).
 *
 * Everything here is pure: parsing an authorization request, matching a
 * client and its redirect exactly, PKCE, and the secrets themselves. A code
 * or token is random, handed out once, and only its SHA-256 is ever stored.
 *
 * A provider is configured only by a deployment's own environment — the
 * client id, secret and the exact redirect URLs the provider's console
 * shows. Until those are set, linking is honestly unavailable: nothing here
 * invents a client.
 */

export const CODE_TTL_SECONDS = 5 * 60;
export const ACCESS_TTL_SECONDS = 60 * 60;
export const REFRESH_TTL_SECONDS = 180 * 24 * 60 * 60;

export type VoiceProvider = "amazon_alexa" | "gemini";

export type VoiceOAuthClient = {
  provider: VoiceProvider;
  clientId: string;
  clientSecret: string;
  /** Exact redirect URLs, as the provider's console lists them. Nothing else is accepted. */
  redirectUris: readonly string[];
};

/** The clients this deployment has configured. Empty until someone sets them. */
export function voiceOAuthClients(env: Record<string, string | undefined> = process.env): VoiceOAuthClient[] {
  const clients: VoiceOAuthClient[] = [];
  const id = env.ALEXA_OAUTH_CLIENT_ID?.trim();
  const secret = env.ALEXA_OAUTH_CLIENT_SECRET?.trim();
  const redirects = (env.ALEXA_OAUTH_REDIRECT_URIS ?? "")
    .split(",")
    .map((uri) => uri.trim())
    .filter((uri) => /^https:\/\/[^\s]+$/.test(uri));
  if (id && secret && secret.length >= 16 && redirects.length > 0) {
    clients.push({ provider: "amazon_alexa", clientId: id, clientSecret: secret, redirectUris: redirects });
  }
  return clients;
}

export function findClient(clientId: string | null | undefined, env?: Record<string, string | undefined>): VoiceOAuthClient | null {
  if (!clientId) return null;
  return voiceOAuthClients(env).find((client) => client.clientId === clientId) ?? null;
}

/** Constant-time: a wrong secret takes as long to refuse as a nearly right one. */
export function clientSecretMatches(client: VoiceOAuthClient, secret: string | null | undefined): boolean {
  if (!secret) return false;
  const a = createHash("sha256").update(client.clientSecret).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/** Exact match only — no prefixes, no wildcards (an open redirect is how codes get stolen). */
export function redirectAllowed(client: VoiceOAuthClient, uri: string | null | undefined): boolean {
  return typeof uri === "string" && client.redirectUris.includes(uri);
}

export type SecretKind = "code" | "access" | "refresh";
const PREFIX: Record<SecretKind, string> = { code: "whc_", access: "wha_", refresh: "whr_" };

/** A fresh secret: 32 random bytes, base64url, with a prefix that says what it is (for secret scanners, never for trust). */
export function newSecret(kind: SecretKind): string {
  return `${PREFIX[kind]}${randomBytes(32).toString("base64url")}`;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) === challenge. */
export function pkceMatches(verifier: string | null | undefined, challenge: string): boolean {
  if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type AuthorizeRequest = {
  client: VoiceOAuthClient;
  redirectUri: string;
  state: string | null;
  scopes: VoiceScope[];
  codeChallenge: string | null;
};

export type AuthorizeReading =
  | { ok: true; request: AuthorizeRequest }
  /** Shown on the page — never redirected, because the redirect itself is what is in doubt. */
  | { ok: false; error: "unconfigured" | "invalid_client" | "invalid_redirect"; message: string }
  /** Sent back to the (verified) redirect, per RFC 6749 §4.1.2.1. */
  | { ok: false; error: "invalid_request" | "unsupported_response_type"; message: string; redirectUri: string; state: string | null };

type Params = { get(name: string): string | null };

/** Reads and checks an authorization request, in the order RFC 6749 asks. */
export function readAuthorizeRequest(params: Params, env?: Record<string, string | undefined>): AuthorizeReading {
  if (voiceOAuthClients(env).length === 0) {
    return { ok: false, error: "unconfigured", message: "Linking a voice assistant isn't set up on this WonderHome yet." };
  }
  const client = findClient(params.get("client_id"), env);
  if (!client) return { ok: false, error: "invalid_client", message: "That app isn't one WonderHome knows, so nothing was linked." };
  const redirectUri = params.get("redirect_uri");
  if (!redirectAllowed(client, redirectUri)) {
    return { ok: false, error: "invalid_redirect", message: "That link came from somewhere WonderHome doesn't send people back to, so nothing was linked." };
  }
  const state = params.get("state");
  const fail = (error: "invalid_request" | "unsupported_response_type", message: string): AuthorizeReading => ({ ok: false, error, message, redirectUri: redirectUri!, state });
  if (params.get("response_type") !== "code") return fail("unsupported_response_type", "Only the authorization-code flow is supported.");
  if (state !== null && state.length > 2000) return fail("invalid_request", "state is too long.");

  const challenge = params.get("code_challenge");
  const method = params.get("code_challenge_method");
  if (challenge !== null) {
    if (method !== "S256") return fail("invalid_request", "Only the S256 code challenge method is supported.");
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return fail("invalid_request", "code_challenge is malformed.");
  }

  // What the provider asks for is a ceiling, never a grant: the member picks
  // on the consent screen, starting from the everyday defaults.
  const asked = (params.get("scope") ?? "").split(/[\s,]+/).filter(Boolean);
  const scopes = asked.length > 0 ? normaliseScopes(asked) : [...DEFAULT_VOICE_SCOPES];
  return { ok: true, request: { client, redirectUri: redirectUri!, state, scopes, codeChallenge: challenge } };
}

/** The provider's redirect with the result appended, keeping whatever query it already had. */
export function redirectWith(uri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}
