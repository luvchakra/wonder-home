import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { paymentNoticeFor, sendPaymentNotices, type PaymentNotice } from "./notices";
import { findPlanPrice, providerPlansFor, type PlanPrice } from "./prices";
import { applyBillingEvent, type BillingEvent, type BillingProvider, type PaymentProviderName, type PaymentStatus, type SubscriptionState } from "./provider";
import { billingProvidersFromEnv, routingConfigFromEnv, selectPaymentProvider } from "./router";
import { nextPaymentStatus, statusAfterRefunds } from "./states";

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

/**
 * The deployment's configuration-priced provider (story 20-006's
 * `STRIPE_PRICE_<PLAN>`), or none. Priced checkouts from the catalogue go
 * through `startPricedCheckout` and the router instead.
 */
export function billingProviderFromEnv(env: Record<string, string | undefined> = process.env): BillingProvider | null {
  return billingProvidersFromEnv(env).find((provider) => provider.name === "stripe") ?? null;
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
  input: {
    householdId: string;
    memberId: string;
    toPlanKey: string;
    provider: BillingProvider;
    returnUrl: string;
    now?: Date;
    /** A catalogue price, and what this provider calls it — both resolved on the server. */
    price?: PlanPrice | null;
    providerPlanRef?: string | null;
    customerEmail?: string | null;
  },
): Promise<CheckoutStart> {
  const now = input.now ?? new Date();
  if (!input.provider.live || !(input.providerPlanRef || input.provider.sells(input.toPlanKey))) {
    throw ApiError.conflict("This plan is not sold through a checkout here.");
  }

  let intent = await openIntent(supabase, input.householdId, input.toPlanKey);
  // An open checkout for a different price or provider is not this one: it is
  // closed, so its link can never buy something other than what was chosen.
  if (intent && (intent.provider !== input.provider.name || (intent.priceId ?? null) !== (input.price?.id ?? null))) {
    await admin.from("billing_intents").update({ status: "expired" }).eq("id", intent.id).eq("status", "open");
    intent = null;
  }
  // A link with no expiry (Razorpay's) is reused while the intent stays open.
  if (intent && intent.url && (!intent.expiresAt || intent.expiresAt.getTime() > now.getTime() + 60_000)) {
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
      .insert({
        household_id: input.householdId,
        plan_key: input.toPlanKey,
        provider: input.provider.name,
        created_by_member_id: input.memberId,
        plan_price_id: input.price?.id ?? null,
        billing_interval: input.price?.interval ?? null,
        currency: input.price?.currency ?? null,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "42501") throw ApiError.forbidden("Only an Admin can change the plan.");
      // Somebody else's click opened it first: use theirs.
      if (error.code === "23505") intent = await openIntent(supabase, input.householdId, input.toPlanKey);
      else throw new Error(`startCheckout failed: ${error.code ?? "unknown"}`);
    } else {
      intent = { id: (data as Row).id as string, url: null, expiresAt: null, provider: input.provider.name, priceId: input.price?.id ?? null };
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
    providerPlanRef: input.providerPlanRef ?? null,
    interval: input.price?.interval ?? null,
    currency: input.price?.currency ?? null,
    customerEmail: input.customerEmail ?? null,
  });

  const { error: updateError } = await admin
    .from("billing_intents")
    .update({ provider_session_id: checkout.providerSessionId, checkout_url: checkout.url, expires_at: checkout.expiresAt?.toISOString() ?? null })
    .eq("id", intent.id);
  if (updateError) throw new Error(`startCheckout failed: ${updateError.code ?? "unknown"}`);

  return { intentId: intent.id, url: checkout.url, reused: false };
}

export type PricedCheckoutStart = CheckoutStart & { provider: PaymentProviderName };

/**
 * Opens a checkout for one of our catalogue prices (story 20-009).
 *
 * Everything the browser sends is a choice, never a fact: the price is read
 * from our catalogue and must price the plan it claims to, the providers that
 * can take it are the live ones with it mapped, and the router picks among
 * them — honouring a preference only where it is eligible. The amount the
 * customer pays is the provider plan's own, set from our price by a person;
 * nothing the browser says can change it.
 */
export async function startPricedCheckout(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  input: {
    householdId: string;
    memberId: string;
    toPlanKey: string;
    priceId: string;
    preferredProvider?: string | null;
    country?: string | null;
    returnUrl: string;
    customerEmail?: string | null;
    env?: Record<string, string | undefined>;
    now?: Date;
  },
): Promise<PricedCheckoutStart> {
  const price = await findPlanPrice(supabase, input.priceId, input.toPlanKey);
  if (!price) throw ApiError.conflict("That price isn't available. Nothing has changed.");
  const refs = await providerPlansFor(admin, price.id);
  const live = billingProvidersFromEnv(input.env);
  const eligible = live.filter((provider) => refs[provider.name as PaymentProviderName]).map((provider) => provider.name as PaymentProviderName);
  const choice = selectPaymentProvider({
    currency: price.currency,
    country: input.country ?? null,
    preferred: input.preferredProvider ?? null,
    eligible,
    config: routingConfigFromEnv(input.env),
  });
  if (!choice.provider) throw ApiError.conflict("This plan can't be bought here yet. Nothing has changed.");
  const provider = live.find((candidate) => candidate.name === choice.provider)!;
  const started = await startCheckout(supabase, admin, {
    householdId: input.householdId,
    memberId: input.memberId,
    toPlanKey: input.toPlanKey,
    provider,
    returnUrl: input.returnUrl,
    price,
    providerPlanRef: refs[choice.provider] ?? null,
    customerEmail: input.customerEmail,
    now: input.now,
  });
  return { ...started, provider: choice.provider };
}

async function openIntent(supabase: SupabaseClient, householdId: string, planKey: string) {
  const { data, error } = await supabase
    .from("billing_intents")
    .select("id, checkout_url, expires_at, provider, plan_price_id")
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
    provider: (row.provider as string | undefined) ?? null,
    priceId: (row.plan_price_id as string | null | undefined) ?? null,
  };
}

export type BillingEventResult =
  | { recorded: false; duplicate: true }
  /** A refund for a payment our ledger has never seen: nothing to tie it to, so nothing is written. */
  | { recorded: false; duplicate: false; unmatched: true }
  | { recorded: true; applied: boolean; outcome: string };

/**
 * Applies one verified provider event, once.
 *
 * Needs the service-role client: it is called from the provider's webhook,
 * where nobody is signed in, and the event's authority is its verified
 * signature. It never touches a household's records — only the subscription
 * row, which is what every entitlement decision reads, and the payments
 * ledger, which is what the household's billing history reads.
 */
export async function recordBillingEvent(
  admin: SupabaseClient,
  provider: string,
  event: BillingEvent,
): Promise<BillingEventResult> {
  // A refund made at the provider names only the payment; the household is
  // whichever one our ledger says that payment belongs to.
  if (!event.householdId && event.refund) {
    const { data: paid } = await admin
      .from("payments")
      .select("household_id")
      .eq("provider", provider)
      .eq("provider_payment_id", event.refund.providerPaymentId)
      .maybeSingle();
    const householdId = ((paid as Row | null)?.household_id as string | undefined) ?? null;
    if (!householdId) return { recorded: false, duplicate: false, unmatched: true };
    event = { ...event, householdId };
  }
  if (!event.householdId) return { recorded: false, duplicate: false, unmatched: true };

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
    .select("plan_key, status, current_period_start, current_period_end, external_ref, last_billing_event_at, cancel_at_period_end, scheduled_plan_key, provider, billing_interval, currency, amount")
    .eq("household_id", event.householdId)
    .maybeSingle();
  if (readError) throw new Error(`recordBillingEvent failed: ${readError.code ?? "unknown"}`);

  const row = current as Row | null;
  const state: SubscriptionState | null = row
    ? {
        planKey: row.plan_key as string,
        status: row.status as SubscriptionState["status"],
        currentPeriodStart: new Date(row.current_period_start as string),
        currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end as string) : null,
        externalRef: (row.external_ref as string | null) ?? null,
        lastEventAt: row.last_billing_event_at ? new Date(row.last_billing_event_at as string) : null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        scheduledPlanKey: (row.scheduled_plan_key as string | null | undefined) ?? null,
        provider: (row.provider as string | null | undefined) ?? null,
        terms: row.billing_interval || row.currency || row.amount !== undefined
          ? {
              interval: (row.billing_interval as "month" | "year" | null | undefined) ?? null,
              currency: (row.currency as string | null | undefined) ?? null,
              amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
            }
          : null,
      }
    : null;

  // What the provider reported goes to the ledger whatever it does to the
  // subscription: a failed renewal is still a line in the billing history.
  const notices = await recordLedger(admin, provider, event, state?.planKey ?? null);

  const decision = applyBillingEvent(state, event);
  let outcome: string;
  if (!decision.apply) {
    outcome = decision.reason.startsWith("Recorded")
      ? "recorded"
      : decision.reason.startsWith("An older")
        ? "ignored_older"
        : decision.reason.startsWith("About a different")
          ? "ignored_other_subscription"
          : "ignored_no_plan";
  } else {
    const next = decision.next;
    const terms = next.terms ?? null;
    const { error: writeError } = await admin.from("household_subscriptions").upsert(
      {
        household_id: event.householdId,
        plan_key: next.planKey,
        status: next.status,
        current_period_start: next.currentPeriodStart.toISOString(),
        current_period_end: next.currentPeriodEnd && next.currentPeriodEnd > next.currentPeriodStart ? next.currentPeriodEnd.toISOString() : null,
        external_ref: next.externalRef,
        last_billing_event_at: next.lastEventAt?.toISOString() ?? null,
        cancel_at_period_end: next.cancelAtPeriodEnd ?? false,
        scheduled_plan_key: next.scheduledPlanKey ?? null,
        // Who bills it: the provider that activated it, until it ends.
        provider: event.type === "subscription.cancelled" ? null : event.type === "subscription.activated" ? provider : (state?.provider ?? provider),
        billing_interval: terms?.interval ?? null,
        currency: terms?.currency ?? null,
        amount: terms?.amount ?? null,
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
      if (!state || state.planKey !== next.planKey || state.status !== next.status || Boolean(state.cancelAtPeriodEnd) !== Boolean(next.cancelAtPeriodEnd)) {
        await auditChange({
          householdId: event.householdId,
          eventType: "subscription.changed",
          targetTable: "household_subscriptions",
          targetId: event.householdId,
          // Keys and closed words only: what a plan costs is not recorded here.
          metadata: { from: state?.planKey ?? null, to: next.planKey, status: next.status, endsAtPeriodEnd: Boolean(next.cancelAtPeriodEnd), source: "billing", billingEvent: event.type, provider },
        });
      }
    }
  }

  await admin.from("billing_events").update({ applied: outcome === "applied", outcome }).eq("id", eventRowId);
  // The household hears what the ledger now says (story 20-011). A failed
  // notice never fails the event: the provider would only redeliver it.
  try {
    await sendPaymentNotices(admin, { householdId: event.householdId, intentId: event.intentId, notices, now: event.occurredAt });
  } catch {
    /* the ledger is the record; the notice is a courtesy */
  }
  return { recorded: true, applied: outcome === "applied", outcome };
}

/**
 * The ledger side of an event: a payment, its invoice, a refund — each once
 * per provider id, a payment's status only ever moving forward.
 */
async function recordLedger(admin: SupabaseClient, provider: string, event: BillingEvent, currentPlanKey: string | null): Promise<PaymentNotice[]> {
  let paymentRowId: string | null = null;
  const notices: PaymentNotice[] = [];

  if (event.payment) {
    const payment = event.payment;
    const { data: existing } = await admin
      .from("payments")
      .select("id, status")
      .eq("provider", provider)
      .eq("provider_payment_id", payment.providerPaymentId)
      .maybeSingle();
    const was = (existing as Row | null)?.status as PaymentStatus | undefined;
    const status = nextPaymentStatus(was ?? null, payment.status);
    const values = {
      household_id: event.householdId,
      provider,
      provider_payment_id: payment.providerPaymentId,
      provider_order_ref: payment.orderRef,
      subscription_ref: event.externalRef,
      intent_id: event.intentId,
      plan_key: event.planKey ?? currentPlanKey,
      amount: payment.amount,
      currency: payment.currency,
      status,
      failure_code: status === "failed" ? payment.failureCode : null,
      method: payment.method,
      method_last4: payment.methodLast4,
      paid_at: status === "succeeded" ? (payment.paidAt ?? event.occurredAt).toISOString() : null,
    };
    const { data: written, error } = await admin
      .from("payments")
      .upsert(values, { onConflict: "provider,provider_payment_id" })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`recordLedger payment failed: ${error.code ?? "unknown"}`);
    paymentRowId = ((written as Row | null)?.id as string | undefined) ?? null;
    const notice = paymentRowId
      ? paymentNoticeFor(was ?? null, status, { id: paymentRowId, amount: payment.amount, currency: payment.currency, planKey: values.plan_key })
      : null;
    if (notice) notices.push(notice);
  }

  if (event.invoice) {
    const invoice = event.invoice;
    const { error } = await admin.from("billing_invoices").upsert(
      {
        household_id: event.householdId,
        provider,
        provider_invoice_id: invoice.providerInvoiceId,
        payment_id: paymentRowId,
        plan_key: event.planKey ?? currentPlanKey,
        number: invoice.number,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        invoice_url: invoice.invoiceUrl,
        receipt_url: invoice.receiptUrl,
        period_start: invoice.periodStart?.toISOString() ?? null,
        period_end: invoice.periodEnd?.toISOString() ?? null,
        issued_at: invoice.issuedAt.toISOString(),
      },
      { onConflict: "provider,provider_invoice_id" },
    );
    if (error) throw new Error(`recordLedger invoice failed: ${error.code ?? "unknown"}`);
  }

  if (event.refund) {
    const refund = event.refund;
    const { data: paid } = await admin
      .from("payments")
      .select("id, amount, status")
      .eq("provider", provider)
      .eq("provider_payment_id", refund.providerPaymentId)
      .maybeSingle();
    const paymentRow = paid as Row | null;
    if (!paymentRow) return notices;
    const completedAt = refund.status === "succeeded" ? event.occurredAt.toISOString() : null;
    const { data: known } = await admin
      .from("payment_refunds")
      .select("id, status")
      .eq("provider", provider)
      .eq("provider_refund_id", refund.providerRefundId)
      .maybeSingle();
    let refundRowId: string | null = null;
    const refundWas = ((known as Row | null)?.status as string | undefined) ?? null;
    if (known) {
      refundRowId = (known as Row).id as string;
      await admin.from("payment_refunds").update({ status: refund.status, completed_at: completedAt }).eq("id", refundRowId);
    } else {
      // A refund made at the provider's own dashboard: recorded all the same.
      await admin.from("payment_refunds").insert({
        household_id: event.householdId,
        payment_id: paymentRow.id,
        provider,
        provider_refund_id: refund.providerRefundId,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        reason: "other",
        completed_at: completedAt,
      });
      const { data: insertedRefund } = await admin
        .from("payment_refunds")
        .select("id")
        .eq("provider", provider)
        .eq("provider_refund_id", refund.providerRefundId)
        .maybeSingle();
      refundRowId = ((insertedRefund as Row | null)?.id as string | undefined) ?? null;
    }
    if (refund.status === "succeeded" && refundWas !== "succeeded" && refundRowId) {
      notices.push({ kind: "refund_succeeded", refundId: refundRowId, paymentId: paymentRow.id as string, amount: refund.amount, currency: refund.currency });
    }
    if (refund.status === "succeeded") {
      const { data: refunds } = await admin.from("payment_refunds").select("amount").eq("payment_id", paymentRow.id).eq("status", "succeeded");
      const total = ((refunds as Row[] | null) ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
      const target = statusAfterRefunds(paymentRow.amount === null ? null : Number(paymentRow.amount), total);
      const status = nextPaymentStatus(paymentRow.status as PaymentStatus, target);
      await admin.from("payments").update({ status }).eq("id", paymentRow.id as string);
    }
  }
  return notices;
}
