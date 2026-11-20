import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditEvent } from "../api/audit";
import { ApiError } from "../api/errors";
import type { PlatformAdmin } from "../platform/admin";
import type { BillingInterval, BillingProvider, PaymentProviderName, ProviderPlan } from "./provider";

/**
 * Linking our prices to a provider's plans (story 20-009, owner request
 * 2026-11-20), from Platform admin → Plans & billing.
 *
 * Prices are ours (`plan_prices`). A provider bills a subscription against its
 * own plan, so each of our prices needs one there, mapped in
 * `payment_provider_plans` (service role only). Rather than have a person copy
 * an amount into the provider's dashboard and a plan id back, the platform
 * owner presses one button: the plan is created at the provider from our
 * price, or a plan id they already made is read back and linked only when it
 * bills exactly our amount, currency and interval. A price that changes is a
 * new price row (`plan-edit.ts`), so it shows as unlinked until linked again;
 * the old mapping stays true to what households already pay.
 */

export type PriceLink = {
  priceId: string;
  planKey: string;
  planName: string;
  requiresPayment: boolean;
  interval: BillingInterval;
  currency: string;
  amount: number;
  /** The provider's plan id for this price, when linked. Shown only to platform staff. */
  links: Partial<Record<PaymentProviderName, string>>;
};

type Row = Record<string, unknown>;

/** Every active price with what backs it at each provider. Service role. */
export async function listPriceLinks(admin: SupabaseClient): Promise<PriceLink[]> {
  const [prices, plans, maps] = await Promise.all([
    admin.from("plan_prices").select("id, plan_key, billing_interval, currency, amount").eq("active", true).order("amount").limit(100),
    admin.from("plans").select("key, name, requires_payment, sort_order").order("sort_order").limit(20),
    admin.from("payment_provider_plans").select("plan_price_id, provider, provider_plan_ref").eq("active", true).limit(400),
  ]);
  for (const result of [prices, plans, maps]) if (result.error) throw new Error(`listPriceLinks failed: ${result.error.code ?? "unknown"}`);
  const planRows = (plans.data ?? []) as Row[];
  const order = new Map(planRows.map((plan, index) => [plan.key as string, index]));
  return ((prices.data ?? []) as Row[])
    .map((price) => {
      const plan = planRows.find((candidate) => candidate.key === price.plan_key);
      const links: PriceLink["links"] = {};
      for (const map of (maps.data ?? []) as Row[]) if (map.plan_price_id === price.id) links[map.provider as PaymentProviderName] = map.provider_plan_ref as string;
      return {
        priceId: price.id as string,
        planKey: price.plan_key as string,
        planName: (plan?.name as string | undefined) ?? (price.plan_key as string),
        requiresPayment: Boolean(plan?.requires_payment),
        interval: price.billing_interval as BillingInterval,
        currency: price.currency as string,
        amount: Number(price.amount),
        links,
      };
    })
    .sort((a, b) => (order.get(a.planKey) ?? 99) - (order.get(b.planKey) ?? 99) || (a.interval === b.interval ? 0 : a.interval === "month" ? -1 : 1));
}

/** Whether a provider's plan bills exactly this price. Money is compared in major units, to the paisa. */
export function planMatchesPrice(plan: ProviderPlan, price: { interval: BillingInterval; currency: string; amount: number }): boolean {
  return plan.interval === price.interval && plan.currency === price.currency && Math.round(plan.amount * 100) === Math.round(price.amount * 100);
}

/**
 * Creates (no `ref`) or links (`ref`) the provider's plan for one of our
 * prices. Platform owner only. Returns the provider's plan id.
 */
export async function linkProviderPlan(
  admin: SupabaseClient,
  actor: PlatformAdmin,
  provider: BillingProvider | null,
  input: { priceId: string; ref?: string | null; requestId?: string },
): Promise<{ ref: string; created: boolean }> {
  if (actor.role !== "owner") throw ApiError.forbidden("Only the platform owner can link a price to a payment provider.");
  if (!provider?.live || !provider.createPlan || !provider.fetchPlan) {
    throw ApiError.conflict("This payment provider isn't set up here yet. Add its keys under Configuration first. Nothing has changed.");
  }
  const name = provider.name as PaymentProviderName;
  const price = (await listPriceLinks(admin)).find((candidate) => candidate.priceId === input.priceId);
  if (!price) throw ApiError.notFound("No such active price.");
  if (provider.currencies && !provider.currencies.includes(price.currency)) {
    throw ApiError.conflict(`${provider.name} can't bill ${price.currency} here. Nothing has changed.`);
  }

  let plan: ProviderPlan;
  const ref = input.ref?.trim() || null;
  if (ref) {
    const found = await provider.fetchPlan(ref);
    if (!found) throw ApiError.badRequest("That plan id wasn't found at the provider. Nothing has changed.");
    if (!planMatchesPrice(found, price)) {
      throw ApiError.conflict("That plan doesn't bill this price: its amount, currency or interval is different. Nothing has changed.");
    }
    plan = found;
  } else {
    const label = `WonderHome ${price.planName} (${price.interval === "year" ? "yearly" : "monthly"})`;
    plan = await provider.createPlan({ priceId: price.priceId, name: label, interval: price.interval, amount: price.amount, currency: price.currency });
    // Never trust a create blindly either: what came back must bill our price.
    if (!planMatchesPrice(plan, price)) throw new Error("The provider created a plan that doesn't match our price.");
  }

  if (price.links[name] === plan.ref) return { ref: plan.ref, created: false };

  const retire = await admin.from("payment_provider_plans").update({ active: false }).eq("plan_price_id", price.priceId).eq("provider", name).eq("active", true);
  if (retire.error) throw new Error(`linkProviderPlan failed: ${retire.error.code ?? "unknown"}`);
  const { error } = await admin.from("payment_provider_plans").upsert(
    { plan_price_id: price.priceId, provider: name, provider_plan_ref: plan.ref, active: true },
    { onConflict: "provider,provider_plan_ref" },
  );
  if (error) throw new Error(`linkProviderPlan failed: ${error.code ?? "unknown"}`);

  await recordAuditEvent(admin, {
    householdId: null,
    eventType: "platform.price_linked",
    actorProfileId: actor.profileId,
    targetTable: "payment_provider_plans",
    // Keys and closed words; the amount is ours and already in plan_prices.
    metadata: { priceId: price.priceId, planKey: price.planKey, interval: price.interval, provider: name, created: !ref },
    requestId: input.requestId,
  });
  return { ref: plan.ref, created: !ref };
}
