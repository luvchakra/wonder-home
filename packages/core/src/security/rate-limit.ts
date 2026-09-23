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
  /** OAuth token requests, per voice client (voice phase 2). */
  "voice.token": { max: 120, windowSeconds: 600 },
  /** Requests from a linked voice assistant, per link: a speaker in a kitchen, not a script. */
  "voice.request": { max: 60, windowSeconds: 600 },
  /** Gemini voice sessions opened, per member (voice phase 3): each mints a provider token. */
  "voice.session": { max: 20, windowSeconds: 600 },
  /** Tool calls within one Gemini Live session: a long, lively conversation, not a loop (voice phase 6 cost control). */
  "voice.tool": { max: 120, windowSeconds: 900 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/** What a person is told when they hit a limit: that it is temporary, and when to try again. */
export function rateLimitMessage(bucket: RateLimitBucket): string {
  const { windowSeconds } = RATE_LIMITS[bucket];
  const wait = windowSeconds <= 60 ? "a minute" : windowSeconds <= 600 ? "a few minutes" : "a little while";
  return `That is a lot in a short time, so WonderHome is pausing for ${wait}. Nothing was lost — try again then.`;
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
    return data !== false;
  } catch (thrown) {
    log.warn("rate limit unavailable; allowing", { bucket, reason: (thrown as { code?: string } | null)?.code ?? (thrown instanceof Error ? thrown.name : "unknown") });
    return true;
  }
}
