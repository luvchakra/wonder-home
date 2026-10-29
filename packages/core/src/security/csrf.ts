/**
 * Cross-site request forgery, defence in depth (SEC-09, ASVS V4).
 *
 * The session cookie is `sameSite: lax` and Server Actions check Origin themselves; this adds the
 * same check to every other state-changing request that carries a cookie, so the custom
 * `/api/v1/**` handlers don't rely on SameSite alone. It runs in the middleware.
 *
 * A request is refused only when a browser could have been tricked into sending it: a mutating
 * method, a cookie to ride, no `Authorization` header (a script on another site can't add one
 * without a CORS preflight), and an `Origin` (else `Referer`, else `Sec-Fetch-Site`) that is not
 * ours. A request that names none of the three isn't from a browser, so it can't be forged one.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Callers that authenticate themselves, not with the member's cookie: a signature, a signed link,
 * a shared secret, a client credential or an API key. Prefixes of the path, listed so each
 * exemption is a decision. Anything not here is checked.
 */
export const CSRF_EXEMPT_PREFIXES = [
  "/api/v1/whatsapp/webhook", // Meta's signature
  "/api/v1/billing/webhook", // the payment provider's signature
  "/api/v1/homesend/email/webhook", // the mail provider's signature
  "/api/v1/platform/", // cron and webhook delivery: Bearer CRON_SECRET / signature
  "/api/v1/notifications/dispatch", // cron: Bearer CRON_SECRET
  "/api/v1/calendar/subscriptions/sync", // cron: Bearer CRON_SECRET
  "/api/v1/notifications/email-off", // the mail app's one-click unsubscribe: signed token in the link
  "/api/v1/oauth/", // voice-assistant client credentials
  "/api/v1/voice/alexa", // the skill's linked-account token and Amazon's request
  "/api/v1/partner/", // developer API: key in Authorization
  "/api/v1/security/csp-report", // browsers post reports without our Origin
] as const;

/**
 * The OS share sheet posts the shared files from the installed app. Browsers differ in what
 * they send, so only an explicit foreign origin is refused here, never an absent one.
 */
export const CSRF_LENIENT_PREFIXES = ["/api/v1/intake/share"] as const;

export type CsrfRequest = {
  method: string;
  pathname: string;
  /** Header lookup, case-insensitive (a `Headers`). */
  headers: { get(name: string): string | null };
  /** Hosts this app answers on, besides the request's own Host. */
  extraHosts?: readonly string[];
};

export type CsrfDecision = { allowed: true } | { allowed: false; reason: string };

function hostOf(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Hosts from the configured site URL and the deployment's own URLs. */
export function configuredHosts(env: Record<string, string | undefined> = process.env): string[] {
  const hosts = [env.NEXT_PUBLIC_SITE_URL, env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((v): v is string => Boolean(v))
    .map((v) => hostOf(/^https?:\/\//.test(v) ? v : `https://${v}`))
    .filter((v): v is string => Boolean(v));
  return [...new Set(hosts)];
}

export function checkCsrf(request: CsrfRequest): CsrfDecision {
  if (!MUTATING.has(request.method.toUpperCase())) return { allowed: true };
  if (isCsrfExempt(request.pathname)) return { allowed: true };
  const { headers } = request;
  if (headers.get("authorization")) return { allowed: true };
  if (!headers.get("cookie")) return { allowed: true };

  const lenient = CSRF_LENIENT_PREFIXES.some((prefix) => request.pathname.startsWith(prefix));
  const ours = new Set([headers.get("x-forwarded-host") ?? undefined, headers.get("host") ?? undefined, ...(request.extraHosts ?? [])].filter((v): v is string => Boolean(v)));

  const origin = headers.get("origin");
  if (origin) {
    const host = origin === "null" ? null : hostOf(origin);
    return host && ours.has(host) ? { allowed: true } : { allowed: false, reason: "origin_mismatch" };
  }
  const referer = headers.get("referer");
  if (referer) {
    const host = hostOf(referer);
    return host && ours.has(host) ? { allowed: true } : { allowed: false, reason: "referer_mismatch" };
  }
  if (lenient) return { allowed: true };
  const site = headers.get("sec-fetch-site");
  if (site === null || site === "same-origin" || site === "none") return { allowed: true };
  return { allowed: false, reason: "cross_site" };
}
