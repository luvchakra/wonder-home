/**
 * Route-level authorization hooks (story 00-008).
 *
 * This is the outermost gate only: it decides whether a request may reach a
 * surface at all. It is never the authorization decision — household scope,
 * role and privacy scope are enforced server-side by the domain services and
 * again by RLS. A middleware check is easy to bypass by calling an API
 * directly, which is exactly why it is not trusted to be the last word.
 */

/** Surfaces that require an authenticated member. */
const AUTHENTICATED_PREFIXES = [
  "/today",
  "/calendar",
  "/ai",
  "/family",
  "/more",
  "/household",
  "/school",
  "/groceries",
  "/meals",
  "/bills",
  "/househelper",
  "/notifications",
  "/certification",
  "/places",
  "/settings",
  "/welcome",
  // Accepting an invitation needs an account, so an invitee is sent to sign in
  // and returned to the link afterwards.
  "/invite",
  // The user guide and its search are for members (see below for what a
  // signed-out visitor can still read).
  "/help",
] as const;

/**
 * What stays public, and why — kept to the minimum somebody needs before they
 * have an account or when they cannot get into one:
 *
 * - `/` — the landing page, including its contact section (`/#contact`):
 *   what WonderHome is, and how to reach a person.
 * - `/sign-in`, `/sign-in/phone`, `/sign-up` — getting in. Their own screens
 *   carry the only help that matters signed out: the Google and phone options,
 *   the forgot-password link.
 * - `/forgot-password`, `/reset-password`, `/auth/*` — recovering an account
 *   and finishing an email link; by definition used without a session.
 * - `/legal` — terms and privacy, which anybody must be able to read before
 *   agreeing to them.
 * - `/oauth/*` and the provider webhooks under `/api` — protocol endpoints
 *   that authenticate their own callers.
 * - `/e/<token>` — a family event's invite link, for people outside the
 *   household. The token is the only credential: it shows that one event's
 *   title, time, place and the household's name, and takes a reply.
 *
 * The user guide (`/help`) is not on this list: it is for members.
 */

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
  if (AUTHENTICATED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return "authenticated";
  }
  return "public";
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
