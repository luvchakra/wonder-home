import { toErrorBody } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { log } from "@wonderhome/core/observability/logger";
import { deliverPendingWebhooks, type DeliveryOutcome } from "@wonderhome/core/webhooks/deliver";

/**
 * Drains the outbound webhook delivery queue (story 18-007).
 *
 * Same `CRON_SECRET` shape as `/platform/retention`, its own route rather
 * than folded into that one: retention runs on a day-scale cadence
 * appropriate for expiring old rows, and a webhook delivery would ideally
 * run far more often to be worth calling "real time." `vercel.json` still
 * schedules it once a day (this deployment's plan tier caps Cron Job
 * frequency at once daily) — genuinely a delay, not a claim otherwise; the
 * retry/backoff in `deliver.ts` and this route's own logic are correct at
 * any invocation frequency, and moving to a tighter schedule later is a
 * one-line change here once a plan that allows it is in place.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const refuse = () =>
    Response.json(
      { error: { code: "unauthenticated", message: "Authentication required.", requestId: "webhook-delivery" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );

  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return refuse();

  try {
    const outcomes = await deliverPendingWebhooks(createAdminClient());
    const count = (outcome: DeliveryOutcome["outcome"]) => outcomes.filter((o) => o.outcome === outcome).length;
    const summary = {
      delivered: count("delivered"),
      retrying: count("retrying"),
      exhausted: count("exhausted"),
      skipped: count("skipped"),
    };

    log.info("webhook delivery sweep", { ...summary, allow: ["delivered", "retrying", "exhausted", "skipped"] });

    return Response.json(summary, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (thrown) {
    const { status, body } = toErrorBody(thrown, "webhook-delivery");
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
  }
}

/**
 * Vercel Cron calls a path with GET, never POST. With only a POST handler
 * the scheduled run answered 405 every day and nothing ran. The same
 * handler, behind the same secret, answers both. POST stays for manual and
 * scripted runs.
 */
export const GET = POST;

export const dynamic = "force-dynamic";
