/**
 * Baseline security headers (story 00-008, architecture/SECURITY-BASELINE.md).
 *
 * Applied to every response from next.config.ts rather than per-route, so a new
 * route is protected by default instead of by remembering. The Content-Security-Policy
 * is the one exception: it carries a per-request nonce, so the middleware sets it
 * (`contentSecurityPolicyHeaders`, SEC-05).
 */

export type SecurityHeaderOptions = {
  /** Supabase project origin, which the browser must be allowed to reach. */
  supabaseOrigin?: string;
  /** Relaxes the CSP for the dev server's inline runtime and websocket. */
  development?: boolean;
  /** Overrides CSP_MODE (tests). */
  cspMode?: CspMode;
};

export type HeaderTuple = { key: string; value: string };

/** The Gemini Live API's websocket origin — the one third party the page itself connects to. */
export const GEMINI_LIVE_ORIGIN = "wss://generativelanguage.googleapis.com";

/** Where browsers post what the policy blocked (a redacted, sampled log line; see api/v1/security/csp-report). */
export const CSP_REPORT_PATH = "/api/v1/security/csp-report";

// (CspMode is declared below; SecurityHeaderOptions only names it.)
/**
 * `report-only` (default): the old policy is enforced and the strict, nonce-based one is only
 * reported against, so a violation costs a log line, not a broken screen. `enforce`: the strict
 * policy is enforced. Flip with CSP_MODE=enforce once the reports are quiet (docs/security/csp.md).
 */
export type CspMode = "report-only" | "enforce";

export function cspModeFromEnv(value: string | undefined = process.env.CSP_MODE): CspMode {
  return value === "enforce" ? "enforce" : "report-only";
}

/**
 * Builds the policy. With a `nonce` it is the strict one: scripts run only if they carry the
 * request's nonce (Next puts it on its own bootstrap scripts) or were loaded by such a script
 * ('strict-dynamic', which makes browsers ignore 'self' and 'unsafe-inline' for scripts). Without
 * one it is the pre-SEC-05 policy, whose 'unsafe-inline' scripts are the weakness being retired.
 */
export function buildContentSecurityPolicy({ supabaseOrigin, development, nonce }: SecurityHeaderOptions & { nonce?: string }): string {
  // Gemini Voice (voice phase 3): the page talks to Google's Live API over
  // one websocket, with a short-lived single-use token our server minted —
  // never a key. Only that endpoint's origin, never Google at large.
  const connect = ["'self'", supabaseOrigin, GEMINI_LIVE_ORIGIN, development ? "ws: http://localhost:*" : null]
    .filter(Boolean)
    .join(" ");
  // A member's photo is served from Supabase Storage as a signed URL on the
  // project's own origin, never a public/unbounded third party.
  // Posters on Home's date card come from TMDB's image host, when a catalogue is configured.
  const img = ["'self'", "blob:", "data:", supabaseOrigin, "https://image.tmdb.org"].filter(Boolean).join(" ");
  const dev = development ? " 'unsafe-eval'" : ""; // React Refresh, dev only

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": nonce ? `'self' 'nonce-${nonce}' 'strict-dynamic'${dev}` : `'self' 'unsafe-inline'${dev}`,
    // Style attributes (React `style={}`, Radix positioning, Tailwind's runtime values) can't carry a
    // nonce, so styles keep 'unsafe-inline'; an injected style can restyle but not run code.
    "style-src": "'self' 'unsafe-inline'",
    "img-src": img,
    "font-src": "'self' data:",
    "connect-src": connect,
    "media-src": "'self'",
    "worker-src": "'self' blob:",
    "manifest-src": "'self'",
    // Household content is never embeddable, and never embeds anyone else.
    "frame-src": "'none'",
    "frame-ancestors": "'none'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "report-uri": CSP_REPORT_PATH,
  };

  const policy = Object.entries(directives)
    .map(([directive, value]) => `${directive} ${value}`)
    .join("; ");

  return development ? policy : `${policy}; upgrade-insecure-requests`;
}

/** A fresh, unguessable per-request nonce. */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * The CSP header(s) the middleware adds to one response, and the request header that carries the
 * strict policy (and its nonce) to the render.
 *
 * Next copies every header a middleware sets onto the request it renders and reads the nonce from
 * `content-security-policy`, else `-report-only`. So in report-only mode the middleware must set
 * only the report-only header (the enforced old policy comes from `securityHeaders()`, static);
 * a nonce-free enforced header set here would hide the nonce and no script would get one.
 */
export function contentSecurityPolicyHeaders(
  nonce: string,
  mode: CspMode = cspModeFromEnv(),
  options: SecurityHeaderOptions = {},
): { response: HeaderTuple[]; request: HeaderTuple } {
  const development = options.development ?? process.env.NODE_ENV !== "production";
  const supabaseOrigin = options.supabaseOrigin ?? originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const strict = buildContentSecurityPolicy({ supabaseOrigin, development, nonce });
  // The dev server's inline runtime can't carry a nonce reliably: dev stays on the static, relaxed policy.
  if (development) return { response: [], request: { key: "Content-Security-Policy", value: strict } };
  if (mode === "enforce") return { response: [{ key: "Content-Security-Policy", value: strict }], request: { key: "Content-Security-Policy", value: strict } };
  return {
    // Browsers ignore upgrade-insecure-requests in a report-only policy and say so in the console.
    response: [{ key: "Content-Security-Policy-Report-Only", value: strict.replace("; upgrade-insecure-requests", "") }],
    request: { key: "Content-Security-Policy-Report-Only", value: strict },
  };
}

export function securityHeaders(options: SecurityHeaderOptions = {}): HeaderTuple[] {
  const development = options.development ?? process.env.NODE_ENV !== "production";
  const supabaseOrigin = options.supabaseOrigin ?? originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const headers: HeaderTuple[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      // Voice is a product requirement (module 04), so microphone stays self-permitted.
      // Location sharing (story 01-014) is consent-based and reports from WonderHome's own
      // pages only, so geolocation is self-permitted too — never to an embedded frame.
      value: "camera=(), geolocation=(self), payment=(), usb=(), microphone=(self)",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];

  // The enforced policy while the strict one is only being reported (or in dev). In enforce mode the
  // middleware sends the strict policy instead, so this is left out and the two never stack.
  if (development || (options.cspMode ?? cspModeFromEnv()) === "report-only") {
    headers.unshift({ key: "Content-Security-Policy", value: buildContentSecurityPolicy({ supabaseOrigin, development }) });
  }

  if (!development) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
