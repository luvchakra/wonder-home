import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { isWebhookEventType, WEBHOOK_EVENT_TYPES, type WebhookEventType } from "./event";
import { validateWebhookUrl } from "./url-policy";

/**
 * A household's own webhook subscriptions (story 18-007).
 *
 * `household_webhooks` has no SELECT policy at all — the same exception
 * `household_ai_credentials` already makes and pays for the same way: no
 * session, however privileged, can read a signing secret back out through
 * PostgREST. That means a plain `insert(...).select()` through the
 * household's own client would return nothing for the row it just wrote —
 * RLS's SELECT policies gate `RETURNING` too. So every write here runs on
 * the admin client instead, with the admin check done in application code
 * first (`requireAdmin`, mirroring the pattern every `platform/*.ts` module
 * already uses for the same reason: a service-role write that must still
 * hand the caller back the value nobody else may ever read again).
 *
 * Listing is the opposite shape: it goes through the household's own client
 * and the `list_webhook_subscriptions()` function the migration defines,
 * which is member-readable and never returns the secret at all.
 */

type Row = Record<string, unknown>;

export type WebhookSubscription = {
  id: string;
  householdId: string;
  url: string;
  eventTypes: WebhookEventType[];
  status: "active" | "disabled";
  createdAt: string;
  rotatedAt: string | null;
  disabledAt: string | null;
};

/** Only returned once — at creation or rotation. Never persisted anywhere the caller can read it back from. */
export type WebhookSubscriptionWithSecret = WebhookSubscription & { secret: string };

function toSubscription(row: Row, householdId: string): WebhookSubscription {
  return {
    id: row.id as string,
    householdId,
    url: row.url as string,
    eventTypes: ((row.event_types as string[] | null) ?? []).filter(isWebhookEventType),
    status: row.status as WebhookSubscription["status"],
    createdAt: row.created_at as string,
    rotatedAt: (row.rotated_at as string | null) ?? null,
    disabledAt: (row.disabled_at as string | null) ?? null,
  };
}

/** A cryptographically random signing secret. Unguessable is its entire defense — nothing else authenticates a delivery. */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function requireAdmin(isAdmin: boolean): void {
  if (!isAdmin) throw ApiError.forbidden("Only an Admin can manage webhooks.");
}

function validateEventTypes(eventTypes: readonly string[]): WebhookEventType[] {
  if (eventTypes.length === 0) throw ApiError.badRequest("Choose at least one event to send.");
  const invalid = eventTypes.filter((type) => !isWebhookEventType(type));
  if (invalid.length > 0) throw ApiError.badRequest(`Not a real event type: ${invalid.join(", ")}.`);
  return eventTypes.filter(isWebhookEventType);
}

/** Every webhook configured for a household, minus the secret. Any member may read this. */
export async function listWebhookSubscriptions(supabase: SupabaseClient, householdId: string): Promise<WebhookSubscription[]> {
  const { data, error } = await supabase.rpc("list_webhook_subscriptions", { p_household_id: householdId });
  if (error) throw new Error(`listWebhookSubscriptions failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => toSubscription(row, householdId));
}

export async function createWebhookSubscription(
  adminClient: SupabaseClient,
  actor: { householdId: string; memberId: string; isAdmin: boolean },
  input: { url: string; eventTypes: readonly string[] },
): Promise<WebhookSubscriptionWithSecret> {
  requireAdmin(actor.isAdmin);

  const checked = validateWebhookUrl(input.url);
  if (!checked.ok) throw ApiError.badRequest(checked.reason);
  const eventTypes = validateEventTypes(input.eventTypes);

  const secret = generateWebhookSecret();

  const { data, error } = await adminClient
    .from("household_webhooks")
    .insert({
      household_id: actor.householdId,
      url: checked.url.toString(),
      secret,
      event_types: eventTypes,
      created_by_member_id: actor.memberId,
    })
    .select("id, url, event_types, status, created_at, rotated_at, disabled_at")
    .single();

  if (error) throw new Error(`createWebhookSubscription failed: ${error.code ?? "unknown"}`);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "webhook.subscription_created",
    targetTable: "household_webhooks",
    targetId: (data as Row).id as string,
    metadata: { url: checked.url.toString(), eventTypes },
  });

  return { ...toSubscription(data as Row, actor.householdId), secret };
}

export async function rotateWebhookSecret(
  adminClient: SupabaseClient,
  actor: { householdId: string; memberId: string; isAdmin: boolean },
  webhookId: string,
): Promise<WebhookSubscriptionWithSecret> {
  requireAdmin(actor.isAdmin);

  const secret = generateWebhookSecret();
  const { data, error } = await adminClient
    .from("household_webhooks")
    .update({ secret, rotated_at: new Date().toISOString() })
    .eq("id", webhookId)
    .eq("household_id", actor.householdId)
    .select("id, url, event_types, status, created_at, rotated_at, disabled_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") throw ApiError.notFound("There is no webhook with that id.");
    throw new Error(`rotateWebhookSecret failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "webhook.secret_rotated",
    targetTable: "household_webhooks",
    targetId: webhookId,
  });

  return { ...toSubscription(data as Row, actor.householdId), secret };
}

async function setStatus(
  adminClient: SupabaseClient,
  actor: { householdId: string; memberId: string; isAdmin: boolean },
  webhookId: string,
  status: "active" | "disabled",
): Promise<WebhookSubscription> {
  requireAdmin(actor.isAdmin);

  const patch: Record<string, unknown> = { status };
  patch.disabled_at = status === "disabled" ? new Date().toISOString() : null;

  const { data, error } = await adminClient
    .from("household_webhooks")
    .update(patch)
    .eq("id", webhookId)
    .eq("household_id", actor.householdId)
    .select("id, url, event_types, status, created_at, rotated_at, disabled_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") throw ApiError.notFound("There is no webhook with that id.");
    throw new Error(`setStatus failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: status === "disabled" ? "webhook.subscription_disabled" : "webhook.subscription_enabled",
    targetTable: "household_webhooks",
    targetId: webhookId,
  });

  return toSubscription(data as Row, actor.householdId);
}

/** Turning a webhook off is this entity's "remove" (CLAUDE.md rule 12) — never a hard delete, since queued deliveries still reference it. */
export function disableWebhookSubscription(
  adminClient: SupabaseClient,
  actor: { householdId: string; memberId: string; isAdmin: boolean },
  webhookId: string,
): Promise<WebhookSubscription> {
  return setStatus(adminClient, actor, webhookId, "disabled");
}

export function enableWebhookSubscription(
  adminClient: SupabaseClient,
  actor: { householdId: string; memberId: string; isAdmin: boolean },
  webhookId: string,
): Promise<WebhookSubscription> {
  return setStatus(adminClient, actor, webhookId, "active");
}

export { WEBHOOK_EVENT_TYPES };
