/**
 * Baseline security headers (story 00-008, architecture/SECURITY-BASELINE.md).
 *
 * Applied to every response from next.config.ts rather than per-route, so a new
 * route is protected by default instead of by remembering.
 */

export type SecurityHeaderOptions = {
  /** Supabase project origin, which the browser must be allowed to reach. */
  supabaseOrigin?: string;
  /** Relaxes the CSP for the dev server's inline runtime and websocket. */
  development?: boolean;
};

export type HeaderTuple = { key: string; value: string };

function contentSecurityPolicy({ supabaseOrigin, development }: SecurityHeaderOptions): string {
  const connect = ["'self'", supabaseOrigin, development ? "ws: http://localhost:*" : null]
    .filter(Boolean)
    .join(" ");
  // A member's photo is served from Supabase Storage as a signed URL on the
  // project's own origin, never a public/unbounded third party.
  const img = ["'self'", "blob:", "data:", supabaseOrigin].filter(Boolean).join(" ");

  const directives: Record<string, string> = {
    "default-src": "'self'",
    // Next.js injects inline bootstrap scripts; 'unsafe-eval' is dev-only (React Refresh).
    "script-src": development ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'",
    // Tailwind and Radix set inline styles at runtime.
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
  };

  const policy = Object.entries(directives)
    .map(([directive, value]) => `${directive} ${value}`)
    .join("; ");

  return development ? policy : `${policy}; upgrade-insecure-requests`;
}

export function securityHeaders(options: SecurityHeaderOptions = {}): HeaderTuple[] {
  const development = options.development ?? process.env.NODE_ENV !== "production";
  const supabaseOrigin = options.supabaseOrigin ?? originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);

  const headers: HeaderTuple[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ supabaseOrigin, development }) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      // Voice is a product requirement (module 04), so microphone stays self-permitted.
      value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];

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
