/**
 * Who may keep a copy of a response, and for how long
 * (docs/progress/2026-10-29-caching-strategy.md).
 *
 * Three rules, strictest first:
 *
 * 1. **Nothing the middleware sees is stored by a shared cache.** Every page
 *    and API response carries `private, no-store` and `Vary: Cookie`, signed
 *    in or not: a page's HTML carries this request's CSP nonce (SEC-05), so
 *    even the signed-out landing page must never be served to a second
 *    visitor, and a signed-in one carries a household. Next already marks its
 *    dynamic pages this way; saying it here as well means a route that one
 *    day turns static, or a handler that forgets, still cannot be shared.
 * 2. **A handler may keep its own header only if listed below**, with the
 *    reason it is safe. None of them answers with household data to a
 *    shared cache.
 * 3. **Files in `public/` are cached by name** (`publicFileCacheHeaders`):
 *    images for a day and revalidated in the background, the manifest for an
 *    hour, and the service worker never without asking. Built assets under
 *    `/_next/static` are hashed and Next makes them immutable itself.
 */

import type { HeaderTuple } from "./headers";

/** The header every member-facing response carries. */
export const NO_STORE = "private, no-store, max-age=0";

/**
 * Routes whose handler sets its own Cache-Control, and why that is safe.
 * Matched against the request path; anything else gets `NO_STORE`.
 */
export const HANDLER_CACHE_EXCEPTIONS: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /^\/api\/v1\/openapi\/?$/,
    why: "The public API description: the same document for every caller, no household data (public, max-age=300).",
  },
  {
    pattern: /^\/e\/[^/]+\/(?:card|opengraph-image)\/?$/,
    why: "An invitation's share card, which chat apps fetch without cookies. The token in the address is the only credential; the card shows what the invite page itself shows to anyone holding the link (public, max-age=300).",
  },
  {
    pattern: /^\/meals\/recipe-card\/[^/]+\/?$/,
    why: "A recipe card image for the signed-in member's own browser only (private, max-age=300): never a shared cache.",
  },
];

export function handlerKeepsOwnCacheHeader(pathname: string): boolean {
  return HANDLER_CACHE_EXCEPTIONS.some(({ pattern }) => pattern.test(pathname));
}

/** True when a Cache-Control value forbids every shared cache (CDN, proxy) from storing the response. */
export function isNonShared(value: string | null | undefined): boolean {
  if (!value) return false;
  const directives = value.toLowerCase().split(",").map((part) => part.trim());
  if (directives.some((d) => d.startsWith("s-maxage") || d === "public")) return false;
  return directives.includes("private") || directives.includes("no-store");
}

/**
 * The cache headers the middleware puts on one response. `existingVary` is the
 * response's current Vary, kept and extended with Cookie.
 */
export function responseCacheHeaders(pathname: string, existingVary: string | null = null): HeaderTuple[] {
  if (handlerKeepsOwnCacheHeader(pathname)) return [];
  const vary = existingVary ? (/\bcookie\b/i.test(existingVary) ? existingVary : `${existingVary}, Cookie`) : "Cookie";
  return [
    { key: "Cache-Control", value: NO_STORE },
    { key: "Vary", value: vary },
  ];
}

/** next.config `headers()` entries for the files in `public/`, which the middleware never sees. */
export function publicFileCacheHeaders(): { source: string; headers: HeaderTuple[] }[] {
  // Not hashed, so never `immutable`: a new icon must reach people within a day.
  const image = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];
  return [
    { source: "/:file(icon[^/]*\\.(?:png|svg)|apple-touch-icon\\.png|og\\.png|favicon\\.ico)", headers: image },
    { source: "/brand/:path*", headers: image },
    { source: "/email/:path*", headers: image },
    { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
    // The browser must always ask whether the worker changed, so a fix to it reaches everyone on their next visit.
    { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
  ];
}
