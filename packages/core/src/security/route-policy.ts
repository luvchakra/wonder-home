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
  "/settings",
  "/welcome",
  // Accepting an invitation needs an account, so an invitee is sent to sign in
  // and returned to the link afterwards.
  "/invite",
] as const;

/** Surfaces only for a signed-out visitor; a signed-in member is sent home. */
const ANONYMOUS_ONLY = new Set(["/sign-in", "/sign-up", "/forgot-password"]);


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
