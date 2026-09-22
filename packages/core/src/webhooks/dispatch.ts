import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "../db/admin";
import { log } from "../observability/logger";
import { WEBHOOK_EVENT_VERSION, type WebhookEventType } from "./event";

/**
 * Enqueues a delivery for every active subscription that wants this event
 * (story 18-007).
 *
 * `enqueueWebhookEvent` is the actual logic, taking an explicit client so it
 * is directly testable with a fake one — the same split `recordAuditEvent`/
 * `auditChange` already uses. `dispatchWebhookEvent` is the self-contained
 * wrapper called from domain call sites right alongside `auditChange(...)`:
 * it creates its own admin client and never throws into the action it
 * describes, for the same reason `auditChange`'s own doc comment gives —
 * a webhook enqueue failing must not turn a completed household action into
 * an error the caller retries.
 *
 * This writes to `webhook_deliveries`, never to `audit_events` — the audit
 * trail is a compliance record with no INSERT policy from any client and a
 * two-year retention window; a delivery queue is a different table with a
 * different job and a different lifecycle (drained and pruned, not kept).
 */
export type DispatchWebhookInput = {
  householdId: string;
  eventType: WebhookEventType;
  data: Record<string, unknown>;
};

export async function enqueueWebhookEvent(adminClient: SupabaseClient, input: DispatchWebhookInput): Promise<number> {
  const { data: subscriptions, error: lookupError } = await adminClient
    .from("household_webhooks")
    .select("id")
    .eq("household_id", input.householdId)
    .eq("status", "active")
    .contains("event_types", [input.eventType]);

  if (lookupError) throw new Error(lookupError.code ?? "unknown");
  if (!subscriptions || subscriptions.length === 0) return 0;

  const now = new Date().toISOString();
  const rows = subscriptions.map((subscription) => {
    const eventId = crypto.randomUUID();
    return {
      webhook_id: (subscription as { id: string }).id,
      household_id: input.householdId,
      event_type: input.eventType,
      event_id: eventId,
      payload: {
        eventVersion: WEBHOOK_EVENT_VERSION,
        eventId,
        eventType: input.eventType,
        householdId: input.householdId,
        occurredAt: now,
        data: input.data,
      },
    };
  });

  const { error: insertError } = await adminClient.from("webhook_deliveries").insert(rows);
  if (insertError) throw new Error(insertError.code ?? "unknown");

  return rows.length;
}

export async function dispatchWebhookEvent(input: DispatchWebhookInput): Promise<void> {
  try {
    await enqueueWebhookEvent(createAdminClient(), input);
  } catch (thrown) {
    log.error("webhook dispatch failed", {
      eventType: input.eventType,
      reason: thrown instanceof Error ? thrown.message : "unknown",
      allow: ["eventType", "reason"],
    });
  }
}
