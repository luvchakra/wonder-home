/**
 * Route-level authorization hooks (story 00-008).
 *
 * This is the outermost gate only: it decides whether a request may reach a
 * surface at all. It is never the authorization decision — household scope,
 * role and privacy scope are enforced server-side by the domain services and
 * again by RLS. A middleware check is easy to bypass by calling an API
 * directly, which is exactly why it is not trusted to be the last word.
 */

/**
 * What stays public, and why — kept to the minimum somebody needs before they
 * have an account or when they cannot get into one. Everything else needs a
 * signed-in member, so a new screen is behind sign-in by default rather than
 * by remembering to list it (docs/progress/2026-10-21-reverse-engineering-hardening.md;
 * before then `/health`, `/home-send` and `/onboarding` reached their pages
 * signed out and were turned away only by the page itself).
 *
 * - `/` — the landing page, including its contact section (`/#contact`):
 *   what WonderHome is, and how to reach a person.
 * - `/sign-in`, `/sign-in/phone`, `/sign-up`, `/forgot-password` — getting in
 *   (anonymous-only, below). Their own screens carry the only help that
 *   matters signed out.
 * - `/reset-password`, `/auth/*` — recovering an account and finishing an
 *   email link; by definition used without a session.
 * - `/legal` — terms and privacy, which anybody must be able to read before
 *   agreeing to them.
 * - `/oauth/*` — a voice assistant's account-linking request; its page asks
 *   the member to sign in itself, keeping the request's own parameters.
 * - `/api/*` — every handler authenticates its own caller (`requireUser`, a
 *   provider signature, a partner key or the cron secret); a redirect to a
 *   sign-in page is never an answer to an API call.
 * - `/e/<token>` — a family event's invite link, for people outside the
 *   household. The token is the only credential: it shows that one event's
 *   title, time, place and the household's name, and takes a reply.
 * - `/email-off` — the page behind the unsubscribe link in a notification
 *   email. A signed token for one member is the only credential, and the
 *   only thing it can do is switch that person's email channel off.
 * - the files a browser or crawler fetches on its own: `robots.txt`, the
 *   web manifest, the service worker and the share card.
 *
 * The user guide (`/help`) is not on this list: it is for members.
 */
const PUBLIC_PATHS = new Set([
  "/",
  "/legal",
  "/reset-password",
  "/email-off",
  "/robots.txt",
  "/manifest.webmanifest",
  "/sw.js",
  "/og.png",
]);
const PUBLIC_PREFIXES = ["/auth", "/oauth", "/api", "/e"] as const;

/** Surfaces only for a signed-out visitor; a signed-in member is sent home. */
const ANONYMOUS_ONLY = new Set(["/sign-in", "/sign-in/phone", "/sign-up", "/forgot-password"]);


/** The platform admin boundary, authorized separately from household roles. */
const PLATFORM_ADMIN_PREFIX = "/platform-admin";

export type RouteRequirement = "public" | "authenticated" | "anonymous-only" | "platform-admin";

export function routeRequirement(pathname: string): RouteRequirement {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === PLATFORM_ADMIN_PREFIX || path.startsWith(`${PLATFORM_ADMIN_PREFIX}/`)) {
    return "platform-admin";
  }
  if (ANONYMOUS_ONLY.has(path)) return "anonymous-only";
  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return "public";
  }
  return "authenticated";
}

export type RedirectDecision = { redirectTo: string } | null;

/**
 * Where a request should be sent, if anywhere. `signedIn` describes the session
 * only; being signed in says nothing about what the member may then see.
 */
export function redirectFor(pathname: string, signedIn: boolean): RedirectDecision {
  const requirement = routeRequirement(pathname);

  if (requirement === "authenticated" && !signedIn) {
    return { redirectTo: `/sign-in?next=${encodeURIComponent(pathname)}` };
  }
  if (requirement === "anonymous-only" && signedIn) {
    return { redirectTo: "/" };
  }
  if (requirement === "platform-admin" && !signedIn) {
    // Never reveal that the boundary exists to an anonymous caller.
    return { redirectTo: "/" };
  }
  return null;
}
