import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";

/**
 * Request rate limits (Wave 5 §15), one table of buckets for every surface.
 *
 * Each bucket says how many hits one subject may make per window. A subject
 * is a member for a person's own actions, a household for shared costs, and
 * an IP hash for what arrives before anyone has signed in.
 *
 * Model calls are counted per household, once per HomeTalk turn that would
 * reach a provider. That turn makes at most one understanding call and one
 * composing call. HomeSend's classifier calls are bounded by the intake
 * bucket: one intake, one classification.
 *
 * A limit is a throttle against abuse and runaway cost, not an
 * authorization gate. So when the counter cannot be reached it lets the
 * request through and logs it, the same choice the signed-out share
 * throttle makes. Authorization stays where it always was, and a database
 * hiccup never locks a household out of its own home.
 */
export const RATE_LIMITS = {
  /** HomeTalk turns, per member: faster than anyone talks, slower than a script. */
  "hometalk.turn": { max: 30, windowSeconds: 60 },
  /** Model calls, per household per hour. Past it, turns use the rules, with a disclosure. */
  "ai.model": { max: 150, windowSeconds: 3600 },
  /** HomeSend uploads, pastes and shares, per member. */
  "homesend.intake": { max: 30, windowSeconds: 600 },
  /** HomeSend links, per member: each is an outbound fetch. */
  "homesend.link": { max: 15, windowSeconds: 600 },
  /** Forwarded emails processed, per household per hour. */
  "homesend.email": { max: 60, windowSeconds: 3600 },
  /** Messages a linked member sends to WonderHome on WhatsApp, per member per hour. */
  "homesend.whatsapp": { max: 60, windowSeconds: 3600 },
  /**
   * Household-wide companions of the per-member buckets above (SEC-06): the same action, counted
   * for the whole household, so one noisy home (or one compromised account fanning out across
   * members) can't take more than its share of the model, storage and outbound-fetch capacity
   * everyone shares. About three members' worth, so a busy family never meets it.
   */
  "hometalk.turn.household": { max: 120, windowSeconds: 60 },
  "homesend.intake.household": { max: 100, windowSeconds: 600 },
  "homesend.link.household": { max: 40, windowSeconds: 600 },
  "homesend.whatsapp.household": { max: 200, windowSeconds: 3600 },
  "voice.session.household": { max: 60, windowSeconds: 600 },
  /** WhatsApp connect codes issued, per member: a few tries, not a guessing machine. */
  "whatsapp.link": { max: 6, windowSeconds: 3600 },
  /** Replies to a number that isn't connected (or sent a wrong code), per number: told, not flooded. */
  "whatsapp.unlinked": { max: 3, windowSeconds: 3600 },
  /** OAuth token requests, per voice client (voice phase 2). */
  "voice.token": { max: 120, windowSeconds: 600 },
  /** Requests from a linked voice assistant, per link: a speaker in a kitchen, not a script. */
  "voice.request": { max: 60, windowSeconds: 600 },
  /** Gemini voice sessions opened, per member (voice phase 3): each mints a provider token. */
  "voice.session": { max: 20, windowSeconds: 600 },
  /** Tool calls within one Gemini Live session: a long, lively conversation, not a loop (voice phase 6 cost control). */
  "voice.tool": { max: 120, windowSeconds: 900 },
  /** Gemini Live turns written down for the chat, per member: one per turn of a lively conversation. */
  "voice.transcribe": { max: 120, windowSeconds: 900 },
  /** "Send a test" notification, per member: enough to check each channel, never a way to spam one (story 27-003). */
  "notification.test": { max: 8, windowSeconds: 600 },
  /** Area searches for weather, per member (story 17-007): each is an outbound geocoding call. */
  "weather.search": { max: 30, windowSeconds: 600 },
  /** Address and school searches, per member: typing, debounced, each a provider call. */
  "places.search": { max: 120, windowSeconds: 600 },
  /** Replies through an event's invite link, per hashed client address: a guest list, not a flood. */
  "event.reply": { max: 20, windowSeconds: 600 },
  /** HomePlaces questions in HomeTalk, per household: each is a paid nearby search. */
  "places.find": { max: 30, windowSeconds: 3600 },
  /**
   * Sign-in, sign-up, password reset and phone codes, per hashed client
   * address: generous, since a family behind one home router shares an
   * address, but a script trying passwords or addresses is slowed to a crawl.
   * Supabase Auth keeps its own limits behind this one.
   */
  "auth.attempt": { max: 30, windowSeconds: 600 },
  /** Job applications sent from the careers pages, per hashed client address: a person applying, not a script. */
  "careers.apply": { max: 10, windowSeconds: 3600 },
  /** Status looks and withdrawals on the careers pages, per hashed client address. */
  "careers.status": { max: 30, windowSeconds: 3600 },
  /** Partner API requests, per key (story 18-008): an integration syncing, not a scraper. */
  "partner.request": { max: 120, windowSeconds: 60 },
  /** Matching the list on Instamart, per member (story 25-032): each pass is a Swiggy search per line, so a few a quarter hour. */
  "instamart.match": { max: 6, windowSeconds: 900 },
  /** Cart reviews and order placements on Instamart, per member: a person shopping, never a loop against Swiggy. */
  "instamart.cart": { max: 30, windowSeconds: 900 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/** Who a bucket counts, for the logs and docs/security/rate-limits.md. */
type Scope = "member" | "household" | "ip" | "key" | "link" | "session" | "phone" | "client";

export const RATE_LIMIT_SCOPES: Record<RateLimitBucket, Scope> = {
  "hometalk.turn": "member",
  "ai.model": "household",
  "homesend.intake": "member",
  "homesend.link": "member",
  "homesend.email": "household",
  "homesend.whatsapp": "member",
  "hometalk.turn.household": "household",
  "homesend.intake.household": "household",
  "homesend.link.household": "household",
  "homesend.whatsapp.household": "household",
  "voice.session.household": "household",
  "whatsapp.link": "member",
  "whatsapp.unlinked": "phone",
  "voice.token": "client",
  "voice.request": "link",
  "voice.session": "member",
  "voice.tool": "session",
  "voice.transcribe": "member",
  "notification.test": "member",
  "weather.search": "member",
  "places.search": "member",
  "event.reply": "ip",
  "places.find": "household",
  "auth.attempt": "ip",
  "careers.apply": "ip",
  "careers.status": "ip",
  "partner.request": "key",
  "instamart.match": "member",
  "instamart.cart": "member",
};

const HOUSEHOLD_COMPANION = {
  "hometalk.turn": "hometalk.turn.household",
  "homesend.intake": "homesend.intake.household",
  "homesend.link": "homesend.link.household",
  "homesend.whatsapp": "homesend.whatsapp.household",
  "voice.session": "voice.session.household",
} as const satisfies Partial<Record<RateLimitBucket, RateLimitBucket>>;

export type FairBucket = keyof typeof HOUSEHOLD_COMPANION;

/** How long a refused caller should wait, for a `Retry-After` header. */
export function retryAfterSeconds(bucket: RateLimitBucket): number {
  return RATE_LIMITS[bucket].windowSeconds;
}

/** What a person is told when they hit a limit: that it is temporary, and when to try again. */
export function rateLimitMessage(bucket: RateLimitBucket): string {
  const { windowSeconds } = RATE_LIMITS[bucket];
  const wait = windowSeconds <= 60 ? "a minute" : windowSeconds <= 600 ? "a few minutes" : "a little while";
  return `That is a lot in a short time, so WonderHome is pausing for ${wait}. Nothing was lost — try again then.`;
}

/** Names a subject in logs without being it: a short one-way digest, enough to tell two apart. */
function subjectDigest(subject: string): string {
  return createHash("sha256").update(subject).digest("hex").slice(0, 8);
}

/**
 * A rejection is worth seeing, but a flood of them must not become a flood of log lines (or rows):
 * per bucket and server instance, the first is logged at once and the rest are counted into one
 * summary line a minute. Subjects are digests, never ids, addresses or numbers.
 */
const SUMMARY_WINDOW_MS = 60_000;
const rejections = new Map<string, { since: number; count: number; subjects: Set<string> }>();
let unavailable = { since: 0, count: 0 };

export function noteRejection(bucket: RateLimitBucket, subject: string, now = Date.now()): void {
  const digest = subjectDigest(subject);
  const seen = rejections.get(bucket);
  if (!seen || now - seen.since >= SUMMARY_WINDOW_MS) {
    if (seen && seen.count > 1) {
      log.warn("rate limit summary", { event: "rate_limit_rejected", limiter: bucket, scope: RATE_LIMIT_SCOPES[bucket], rejected: seen.count, distinctSubjects: seen.subjects.size, windowSeconds: SUMMARY_WINDOW_MS / 1000, allow: ["event", "limiter", "scope", "rejected", "distinctSubjects", "windowSeconds"] });
    }
    rejections.set(bucket, { since: now, count: 1, subjects: new Set([digest]) });
    log.warn("rate limit reached", { event: "rate_limit_rejected", limiter: bucket, scope: RATE_LIMIT_SCOPES[bucket], subject: digest, allow: ["event", "limiter", "scope", "subject"] });
    return;
  }
  seen.count += 1;
  if (seen.subjects.size < 1000) seen.subjects.add(digest);
}

function noteUnavailable(bucket: RateLimitBucket, reason: string, now = Date.now()): void {
  // Fail-open brown-out: logged at error level, once a minute per instance, with how many were let through.
  if (now - unavailable.since >= SUMMARY_WINDOW_MS) {
    unavailable = { since: now, count: 1 };
    log.error("rate limit unavailable; allowing", { event: "rate_limit_unavailable", limiter: bucket, reason, allow: ["event", "limiter", "reason"] });
  } else {
    unavailable.count += 1;
  }
}

/**
 * Counts one hit and says whether it is still within the bucket's limit.
 * Needs a service-role client (`public.rate_limit_hit` is granted to it alone).
 */
export async function hitRateLimit(admin: SupabaseClient, bucket: RateLimitBucket, subject: string): Promise<boolean> {
  const { max, windowSeconds } = RATE_LIMITS[bucket];
  try {
    const { data, error } = await admin.rpc("rate_limit_hit", { p_bucket: bucket, p_subject: subject, p_window_seconds: windowSeconds, p_max: max });
    if (error) throw error;
    const allowed = data !== false;
    if (!allowed) noteRejection(bucket, subject);
    return allowed;
  } catch (thrown) {
    noteUnavailable(bucket, (thrown as { code?: string } | null)?.code ?? (thrown instanceof Error ? thrown.name : "unknown"));
    return true;
  }
}

/**
 * Counts one hit for a person and for their household (SEC-06): over either allowance is over.
 * The person's own bucket is checked first, so one member hammering a route is refused there
 * without using up the household's share.
 */
export async function hitRateLimitFair(admin: SupabaseClient, bucket: FairBucket, who: { memberId: string; householdId: string }): Promise<boolean> {
  if (!(await hitRateLimit(admin, bucket, who.memberId))) return false;
  return hitRateLimit(admin, HOUSEHOLD_COMPANION[bucket], who.householdId);
}
