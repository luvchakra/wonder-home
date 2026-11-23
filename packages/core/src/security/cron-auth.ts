import { createHash, timingSafeEqual } from "node:crypto";

import { reloadedSettingsEnv, settledSettingsEnv, type Env } from "../platform/settings/runtime-env";

/**
 * The scheduler's key (`CRON_SECRET`) for every route a scheduler calls: pg_cron's delivery tick and calendar
 * sync, Vercel's own crons, the manual platform jobs (owner, 2026-11-23: "i don't see entry for cron secret in
 * platform admin").
 *
 * Two values are accepted: the one saved in Platform admin → Background jobs → "Scheduler key" (kept in the
 * Vault secret `cron_secret`, the one pg_cron sends, so the two can't drift) and the deployment's `CRON_SECRET`
 * (Vercel's `vercel.json` crons send that one). With neither set everything is refused. Compared in constant
 * time. Never says which part was wrong.
 */
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time equality of a presented key with an expected one; an empty expected key never matches. */
export function keyMatches(presented: string, expected: string | undefined | null): boolean {
  const want = expected?.trim() ?? "";
  if (!want || !presented) return false;
  return timingSafeEqual(digest(presented), digest(want));
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

export type CronKeySources = {
  /** The deployment's variable (Vercel). */
  deployment: string | undefined;
  /** The saved settings laid over it, waiting for a cold server's first read. */
  saved: () => Promise<Env>;
  /** The saved settings read again now (at most every ten seconds per server), after a key was just changed. */
  reloaded: () => Promise<Env>;
};

const SOURCES: CronKeySources = {
  deployment: undefined,
  saved: () => settledSettingsEnv(),
  reloaded: () => reloadedSettingsEnv(),
};

/** True when the request carries the scheduler's key, saved or deployed. */
export async function cronAuthorized(request: Request, sources: Partial<CronKeySources> = {}): Promise<boolean> {
  const presented = bearer(request);
  if (!presented) return false;
  const { deployment = process.env.CRON_SECRET, saved, reloaded } = { ...SOURCES, ...sources };
  if (keyMatches(presented, deployment)) return true;
  if (keyMatches(presented, (await saved()).CRON_SECRET)) return true;
  // A key generated on Platform admin a moment ago may be newer than this server's copy of the store.
  return keyMatches(presented, (await reloaded()).CRON_SECRET);
}

/** The refusal every scheduler route gives: 401, the same words whatever was wrong. */
export function cronRefusal(requestId: string): Response {
  return Response.json(
    { error: { code: "unauthenticated", message: "Authentication required.", requestId } },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

/** "Scheduler key: …" on Platform admin's Configuration health: never a value, only whether the two agree. */
export function schedulerKeyWords(saved: string | undefined | null, deployment: string | undefined | null): string {
  if (!saved?.trim()) return "Scheduler key: not set here — the scheduler's copy and Vercel's CRON_SECRET must be kept equal by hand. Use Generate new key.";
  if (keyMatches(saved.trim(), deployment)) return "Scheduler key: saved here, and matches Vercel's.";
  return deployment?.trim()
    ? "Scheduler key: saved here; Vercel's CRON_SECRET differs (fine: both are accepted)."
    : "Scheduler key: saved here; Vercel has none (fine).";
}
