import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { applyBillingEvent, type BillingEvent, type BillingProvider, type SubscriptionState } from "./provider";
import { stripeFromEnv } from "./stripe";

/**
 * Buying a plan, and hearing back about it (story 20-006).
 *
 * The split of who writes what is the security model:
 *   - A household Admin opens an intent (RLS: only their own household, only
 *     as themselves, only `open` with nothing from the provider on it).
 *   - The server — never a session — attaches the provider's session to it,
 *     and applies what the provider later reports.
 *   - A plan marked `requires_payment` reaches a subscription only through a
 *     verified provider event; RLS refuses it from any household session.
 */

type Row = Record<string, unknown>;

/** The deployment's billing provider, or none — and with none, plan changes apply directly, as they always have. */
export function billingProviderFromEnv(env: Record<string, string | undefined> = process.env): BillingProvider | null {
  return stripeFromEnv(env);
}

export type CheckoutStart = { intentId: string; url: string; reused: boolean };

/**
 * Opens (or reopens) the checkout for moving to a paid plan.
 *
 * A retry is the same intent: the open intent for this household and plan is
 * found rather than duplicated (a unique index makes a race lose cleanly),
 * and its id is the idempotency key the provider sees. A checkout that is
 * still open is handed back without asking the provider again.
 */
export async function startCheckout(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  input: { householdId: string; memberId: string; toPlanKey: string; provider: BillingProvider; returnUrl: string; now?: Date },
): Promise<CheckoutStart> {
  const now = input.now ?? new Date();
  if (!input.provider.live || !input.provider.sells(input.toPlanKey)) {
    throw ApiError.conflict("This plan is not sold through a checkout here.");
  }

  let intent = await openIntent(supabase, input.householdId, input.toPlanKey);
  if (intent && intent.url && intent.expiresAt && intent.expiresAt.getTime() > now.getTime() + 60_000) {
    return { intentId: intent.id, url: intent.url, reused: true };
  }
  if (intent && intent.expiresAt && intent.expiresAt.getTime() <= now.getTime()) {
    // An expired checkout is closed, and the next attempt is a new intent.
    await admin.from("billing_intents").update({ status: "expired" }).eq("id", intent.id).eq("status", "open");
    intent = null;
  }

  if (!intent) {
    const { data, error } = await supabase
      .from("billing_intents")
      .insert({ household_id: input.householdId, plan_key: input.toPlanKey, provider: input.provider.name, created_by_member_id: input.memberId })
      .select("id")
      .single();
    if (error) {
      if (error.code === "42501") throw ApiError.forbidden("Only an Admin can change the plan.");
      // Somebody else's click opened it first: use theirs.
      if (error.code === "23505") intent = await openIntent(supabase, input.householdId, input.toPlanKey);
      else throw new Error(`startCheckout failed: ${error.code ?? "unknown"}`);
    } else {
      intent = { id: (data as Row).id as string, url: null, expiresAt: null };
    }
  }
  if (!intent) throw new Error("startCheckout failed: no intent");

  const separator = input.returnUrl.includes("?") ? "&" : "?";
  const checkout = await input.provider.createCheckout({
    intentId: intent.id,
    householdId: input.householdId,
    planKey: input.toPlanKey,
    successUrl: `${input.returnUrl}${separator}checkout=complete`,
    cancelUrl: `${input.returnUrl}${separator}checkout=cancelled`,
  });

  const { error: updateError } = await admin
    .from("billing_intents")
    .update({ provider_session_id: checkout.providerSessionId, checkout_url: checkout.url, expires_at: checkout.expiresAt?.toISOString() ?? null })
    .eq("id", intent.id);
  if (updateError) throw new Error(`startCheckout failed: ${updateError.code ?? "unknown"}`);

  return { intentId: intent.id, url: checkout.url, reused: false };
}

async function openIntent(supabase: SupabaseClient, householdId: string, planKey: string) {
  const { data, error } = await supabase
    .from("billing_intents")
    .select("id, checkout_url, expires_at")
    .eq("household_id", householdId)
    .eq("plan_key", planKey)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error(`openIntent failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as Row;
  return {
    id: row.id as string,
    url: (row.checkout_url as string | null) ?? null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
  };
}

export type BillingEventResult =
  | { recorded: false; duplicate: true }
  | { recorded: true; applied: boolean; outcome: string };

/**
 * Applies one verified provider event, once.
 *
 * Needs the service-role client: it is called from the provider's webhook,
 * where nobody is signed in, and the event's authority is its verified
 * signature. It never touches a household's records — only the subscription
 * row, which is what every entitlement decision reads.
 */
export async function recordBillingEvent(
  admin: SupabaseClient,
  provider: string,
  event: BillingEvent,
): Promise<BillingEventResult> {
  const { data: inserted, error: insertError } = await admin
    .from("billing_events")
    .upsert(
      {
        provider,
        provider_event_id: event.providerEventId,
        household_id: event.householdId,
        event_type: event.type,
        occurred_at: event.occurredAt.toISOString(),
        intent_id: event.intentId,
      },
      { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (insertError) throw new Error(`recordBillingEvent failed: ${insertError.code ?? "unknown"}`);
  const eventRowId = ((inserted ?? [])[0] as Row | undefined)?.id as string | undefined;
  if (!eventRowId) return { recorded: false, duplicate: true };

  const { data: current, error: readError } = await admin
    .from("household_subscriptions")
    .select("plan_key, status, current_period_start, current_period_end, external_ref, last_billing_event_at")
    .eq("household_id", event.householdId)
    .maybeSingle();
  if (readError) throw new Error(`recordBillingEvent failed: ${readError.code ?? "unknown"}`);

  const state: SubscriptionState | null = current
    ? {
        planKey: (current as Row).plan_key as string,
        status: (current as Row).status as SubscriptionState["status"],
        currentPeriodStart: new Date((current as Row).current_period_start as string),
        currentPeriodEnd: (current as Row).current_period_end ? new Date((current as Row).current_period_end as string) : null,
        externalRef: ((current as Row).external_ref as string | null) ?? null,
        lastEventAt: (current as Row).last_billing_event_at ? new Date((current as Row).last_billing_event_at as string) : null,
      }
    : null;

  const decision = applyBillingEvent(state, event);
  let outcome: string;
  if (!decision.apply) {
    outcome = decision.reason.startsWith("An older") ? "ignored_older" : decision.reason.startsWith("About a different") ? "ignored_other_subscription" : "ignored_no_plan";
  } else {
    const next = decision.next;
    const { error: writeError } = await admin.from("household_subscriptions").upsert(
      {
        household_id: event.householdId,
        plan_key: next.planKey,
        status: next.status,
        current_period_start: next.currentPeriodStart.toISOString(),
        current_period_end: next.currentPeriodEnd && next.currentPeriodEnd > next.currentPeriodStart ? next.currentPeriodEnd.toISOString() : null,
        external_ref: next.externalRef,
        last_billing_event_at: next.lastEventAt?.toISOString() ?? null,
      },
      { onConflict: "household_id" },
    );
    if (writeError) {
      // A plan the catalogue does not know is kept as evidence, not applied.
      if (writeError.code === "23503") outcome = "unknown_plan";
      else throw new Error(`recordBillingEvent failed: ${writeError.code ?? "unknown"}`);
    } else {
      outcome = "applied";
      if (event.intentId && event.type === "subscription.activated") {
        await admin.from("billing_intents").update({ status: "completed", completed_at: event.occurredAt.toISOString() }).eq("id", event.intentId).eq("status", "open");
      }
      if (!state || state.planKey !== next.planKey || state.status !== next.status) {
        await auditChange({
          householdId: event.householdId,
          eventType: "subscription.changed",
          targetTable: "household_subscriptions",
          targetId: event.householdId,
          // Keys and closed words only: what a plan costs is not recorded here.
          metadata: { from: state?.planKey ?? null, to: next.planKey, status: next.status, source: "billing", billingEvent: event.type, provider },
        });
      }
    }
  }

  await admin.from("billing_events").update({ applied: outcome === "applied", outcome }).eq("id", eventRowId);
  return { recorded: true, applied: outcome === "applied", outcome };
}
