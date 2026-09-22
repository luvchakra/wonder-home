import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { signWebhookPayload, webhookSignatureHeader } from "../security/webhook-signing";
import { validateWebhookUrl } from "./url-policy";

/**
 * Draining the outbound delivery queue (story 18-007).
 *
 * Runs on a schedule — a new route, not folded into `/platform/retention`:
 * that sweep runs on a day-scale cadence appropriate for expiring old rows,
 * and a webhook delivery needs to run every minute or so to be worth
 * calling "real time." Same `CRON_SECRET` shape, different route, different
 * clock.
 *
 * Backoff is fixed and short-lived on purpose: six attempts over about a
 * day (`RETRY_DELAYS_MINUTES`), then `exhausted`. A subscriber's endpoint
 * that has been down for a day needs a person to notice and fix it, not a
 * queue that keeps trying forever and hides the problem.
 */

const RETRY_DELAYS_MINUTES = [1, 5, 30, 120, 360, 1440] as const;
const BATCH_SIZE = 50;

export type DeliveryOutcome = { deliveryId: string; outcome: "delivered" | "retrying" | "exhausted" | "skipped" };

type Row = Record<string, unknown>;

export async function deliverPendingWebhooks(
  adminClient: SupabaseClient,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryOutcome[]> {
  const { data, error } = await adminClient
    .from("webhook_deliveries")
    .select("id, webhook_id, event_type, event_id, payload, attempt_count, household_webhooks(url, secret, status)")
    .eq("status", "pending")
    .lte("next_attempt_at", now.toISOString())
    .limit(BATCH_SIZE);

  if (error) throw new Error(`deliverPendingWebhooks lookup failed: ${error.code ?? "unknown"}`);

  const outcomes: DeliveryOutcome[] = [];

  for (const row of (data ?? []) as Row[]) {
    outcomes.push(await deliverOne(adminClient, row, now, fetchImpl));
  }

  return outcomes;
}

async function deliverOne(adminClient: SupabaseClient, row: Row, now: Date, fetchImpl: typeof fetch): Promise<DeliveryOutcome> {
  const deliveryId = row.id as string;
  const webhook = row.household_webhooks as { url: string; secret: string; status: string } | null;

  if (!webhook || webhook.status !== "active") {
    await adminClient
      .from("webhook_deliveries")
      .update({ status: "failed", last_error: "subscription no longer active" })
      .eq("id", deliveryId);
    return { deliveryId, outcome: "skipped" };
  }

  // Re-checked at delivery time, not just at subscription creation — the
  // same reason `security/outbound.ts`'s `checkRedirect` re-checks every
  // hop: a hostname that resolved to a public address when the subscription
  // was created is not guaranteed to still be one now.
  const checked = validateWebhookUrl(webhook.url);
  if (!checked.ok) {
    await adminClient
      .from("webhook_deliveries")
      .update({ status: "failed", last_error: checked.reason })
      .eq("id", deliveryId);
    return { deliveryId, outcome: "skipped" };
  }

  const rawBody = JSON.stringify(row.payload);
  const attemptCount = (row.attempt_count as number) + 1;

  try {
    const sig = signWebhookPayload(webhook.secret, rawBody, Math.floor(now.getTime() / 1000));
    const response = await fetchImpl(checked.url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-signature": webhookSignatureHeader(sig),
        "webhook-id": row.event_id as string,
        "webhook-event-type": row.event_type as string,
      },
      body: rawBody,
    });

    if (response.ok) {
      await adminClient
        .from("webhook_deliveries")
        .update({ status: "delivered", delivered_at: now.toISOString(), attempt_count: attemptCount, last_error: null })
        .eq("id", deliveryId);
      return { deliveryId, outcome: "delivered" };
    }

    return await recordFailure(adminClient, deliveryId, attemptCount, `HTTP ${response.status}`, now);
  } catch (thrown) {
    const reason = thrown instanceof Error ? thrown.message : "unknown";
    return await recordFailure(adminClient, deliveryId, attemptCount, reason, now);
  }
}

async function recordFailure(
  adminClient: SupabaseClient,
  deliveryId: string,
  attemptCount: number,
  reason: string,
  now: Date,
): Promise<DeliveryOutcome> {
  const delayMinutes = RETRY_DELAYS_MINUTES[attemptCount - 1];

  if (delayMinutes === undefined) {
    await adminClient
      .from("webhook_deliveries")
      .update({ status: "exhausted", attempt_count: attemptCount, last_error: reason })
      .eq("id", deliveryId);
    log.info("webhook delivery exhausted", { deliveryId, reason, allow: ["deliveryId", "reason"] });
    return { deliveryId, outcome: "exhausted" };
  }

  await adminClient
    .from("webhook_deliveries")
    .update({
      attempt_count: attemptCount,
      last_error: reason,
      next_attempt_at: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
    })
    .eq("id", deliveryId);

  return { deliveryId, outcome: "retrying" };
}
