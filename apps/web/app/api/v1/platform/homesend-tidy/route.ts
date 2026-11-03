import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { runHomeSendTidy, type TidyRunResult } from "@wonderhome/core/homesend/tidy-run";
import { log } from "@wonderhome/core/observability/logger";

/**
 * HomeSend's daily tidy, on demand (the owner, 2026-11-03: "in the end run the
 * job once to clear HomeSend"). The delivery clock already runs it a few
 * households a tick (`/api/v1/notifications/dispatch`); this runs it now for
 * every household that has something waiting and has not been tidied today on
 * its own calendar, at any hour. The once-a-day claim still holds, so calling
 * it twice tidies nothing twice.
 *
 * Authorised like every platform job: `Authorization: Bearer $CRON_SECRET`,
 * refusing everything when no secret is set — it crosses every household. It
 * reports counts only: households, items archived per reason and kept. Never
 * an id, a title or a household.
 */
export const maxDuration = 300;

/** Households per call; a second call picks up any left over. */
const LIMIT = 500;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json(
      { error: { code: "unauthenticated", message: "Authentication required.", requestId: "homesend-tidy" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  let result: TidyRunResult;
  try {
    result = await runHomeSendTidy(adminClientFor(adminGrant.worker("homesend-tidy", "archive HomeSend items that no longer apply, every household")), { limit: LIMIT, anyHour: true });
  } catch (thrown) {
    log.warn("homesend tidy run failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    return Response.json({ ok: false }, { status: 500, headers: { "cache-control": "no-store" } });
  }
  return Response.json({ ok: true, ...countsOf(result) }, { headers: { "cache-control": "no-store" } });
}

/** Counts only: what was archived for each reason, by rule or by a checked AI verdict, and what stayed. */
function countsOf(result: TidyRunResult) {
  const archived: Record<string, number> = {};
  const by = { rule: 0, ai: 0 };
  const states: Record<string, number> = {};
  let kept = 0;
  let aiAsked = 0;
  for (const household of result.households) {
    states[household.state] = (states[household.state] ?? 0) + 1;
    kept += household.kept;
    aiAsked += household.aiAsked;
    for (const entry of household.archived) {
      archived[entry.reason] = (archived[entry.reason] ?? 0) + 1;
      by[entry.by] += 1;
    }
  }
  return { ready: result.ready, households: result.households.length, states, archived, by, kept, aiAsked };
}
