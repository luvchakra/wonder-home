import { createHash } from "node:crypto";

/**
 * Rate limiting for the one genuinely anonymous write in the HomeSend
 * pipeline: `POST /api/v1/intake/share`'s signed-out branch stages a real
 * row (`homesend_share_handoffs`) for whoever's share sheet lands there,
 * with no membership check to gate it — the share target has to be
 * reachable by someone who has never signed in on that device at all.
 *
 * The caller's IP is never stored raw — only its sha256, the same "count,
 * don't keep the fact itself" shape the rest of this schema already
 * prefers. `mayCreateShareHandoff` is pure and takes just a count, mirroring
 * `security/step-up.ts`'s `mayAttempt`: the database query that produces
 * that count lives in `share-handoff.ts`, next to the other admin-client
 * calls, not here.
 */

export const SHARE_HANDOFF_RATE_LIMIT = { maxPerWindow: 10, windowMinutes: 15 } as const;

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterMinutes: number };

export function mayCreateShareHandoff(recentCount: number): RateLimitDecision {
  if (recentCount < SHARE_HANDOFF_RATE_LIMIT.maxPerWindow) return { allowed: true };
  return { allowed: false, retryAfterMinutes: SHARE_HANDOFF_RATE_LIMIT.windowMinutes };
}

/** sha256 of a caller's IP address — never the address itself. */
export function hashClientIp(ip: string): string {
  return createHash("sha256").update(ip.trim()).digest("hex");
}

/**
 * The caller's IP from a request's standard forwarding headers, or `null`
 * when neither is present (a local/dev request with no proxy in front of
 * it). A `null` result means the rate limit does not apply to this request
 * rather than blocking it — failing open here is deliberate: this is a
 * throttle against abuse, not an authorization gate, and an unidentifiable
 * caller is not a reason to refuse a genuine share.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp ? realIp : null;
}
