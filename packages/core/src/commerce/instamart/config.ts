/**
 * Whether this deployment orders on Swiggy Instamart (story 25-032), and
 * where Swiggy is.
 *
 * Off unless a deployment sets `WONDERHOME_INSTAMART`:
 *   * `on` — the real Swiggy MCP server. Each adult signs in to their own
 *     Swiggy account; a production redirect URI works only once Swiggy has
 *     allowlisted it (the owner's errand, builders@swiggy.in).
 *   * `fixture` — a deterministic stand-in with a made-up catalogue, for
 *     tests and local QA. Never places a real order.
 *
 * `SWIGGY_MCP_BASE` may point at Swiggy's staging server; nothing but
 * Swiggy's own two hosts is ever accepted, so a misconfiguration cannot send
 * a person's token somewhere else.
 */

export type InstamartMode = "off" | "live" | "fixture";

const SWIGGY_HOSTS = new Set(["https://mcp.swiggy.com", "https://mcp-staging.swiggy.com"]);

export function instamartMode(env: Record<string, string | undefined> = process.env): InstamartMode {
  const value = env.WONDERHOME_INSTAMART?.trim().toLowerCase();
  if (value === "on") return "live";
  if (value === "fixture") return "fixture";
  return "off";
}

/** Swiggy's MCP origin: production unless a deployment names staging. */
export function swiggyBase(env: Record<string, string | undefined> = process.env): string {
  const raw = env.SWIGGY_MCP_BASE?.trim().replace(/\/+$/, "");
  return raw && SWIGGY_HOSTS.has(raw) ? raw : "https://mcp.swiggy.com";
}

/** The Instamart server under that origin. */
export function instamartEndpoint(env: Record<string, string | undefined> = process.env): string {
  return `${swiggyBase(env)}/im`;
}

/** Where Swiggy sends a person back after signing in, on this deployment's own origin. */
export function instamartRedirectUri(origin: string): string {
  return new URL("/groceries/order/callback", origin).toString();
}
