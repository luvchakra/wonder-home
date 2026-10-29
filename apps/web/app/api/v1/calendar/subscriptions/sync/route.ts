import { createAdminClient } from "@wonderhome/core/db/admin";
import { syncDueSubscriptions } from "@wonderhome/core/calendar/subscriptions/sync";
import { log } from "@wonderhome/core/observability/logger";

/**
 * The calendar-subscription delivery clock (story 26-022): every 15 minutes the
 * database calls this (pg_cron, migration `20261029090000`), and the feeds that
 * are due are re-fetched and reconciled — read-only — into the calendar. Each
 * feed carries its own ~6h cadence in next_sync_at, so this sweep is cheap when
 * nothing is due. Authorised like every platform job, by `Authorization: Bearer
 * $CRON_SECRET`, refusing everything when no secret is set. Bounded per run.
 */
const MAX_FEEDS_PER_RUN = 25;
export const maxDuration = 120;

async function sync(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json(
      { error: { code: "unauthenticated", message: "Authentication required.", requestId: "calendar-subscription-sync" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const admin = createAdminClient();
  try {
    const result = await syncDueSubscriptions(admin, {
      limit: MAX_FEEDS_PER_RUN,
      onError: (id, error) => log.warn("calendar subscription sync failed", { reason: error instanceof Error ? error.name : "unknown" }),
    });
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (thrown) {
    log.warn("calendar subscription sweep failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    return Response.json({ ok: false }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

export const POST = sync;
export const GET = sync;
