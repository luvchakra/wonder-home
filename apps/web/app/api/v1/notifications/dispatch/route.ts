import { createAdminClient } from "@wonderhome/core/db/admin";
import { deliverDueNotifications } from "@wonderhome/core/notifications/reconcile";
import { log } from "@wonderhome/core/observability/logger";

/**
 * The delivery clock (story 23-015): every five minutes the database calls
 * this (pg_cron, migration `20261018280000`), and whatever has come due since
 * goes out — in the app, and as a push to the devices of the one person it is
 * for, while it is still fresh. A reminder set for 7:30 lands at 7:30, not at
 * whatever moment somebody next opens the app.
 *
 * Authorised like every platform job, by `Authorization: Bearer $CRON_SECRET`,
 * refusing everything when no secret is set. Only households with something
 * actually due are touched, at most 200 a run; the rest wait five minutes.
 * Vercel Cron sends GET, the database sends POST; both are accepted.
 */
const MAX_HOUSEHOLDS = 200;

async function dispatch(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json(
      { error: { code: "unauthenticated", message: "Authentication required.", requestId: "dispatch" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  const now = new Date();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("household_id")
    .eq("status", "generated")
    .lte("scheduled_for", now.toISOString())
    .limit(2000);
  if (error) {
    log.warn("dispatch read failed", { code: error.code ?? "unknown" });
    return Response.json({ ok: false }, { status: 500, headers: { "cache-control": "no-store" } });
  }
  const households = [...new Set(((data ?? []) as { household_id: string }[]).map((row) => row.household_id))].slice(0, MAX_HOUSEHOLDS);
  let delivered = 0;
  for (const householdId of households) {
    try {
      delivered += await deliverDueNotifications(admin, householdId, now);
    } catch (thrown) {
      log.warn("dispatch failed for a household", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    }
  }
  return Response.json({ ok: true, households: households.length, delivered }, { headers: { "cache-control": "no-store" } });
}

export const POST = dispatch;
export const GET = dispatch;
