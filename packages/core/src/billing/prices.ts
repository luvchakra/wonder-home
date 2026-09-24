import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingInterval, PaymentProviderName } from "./provider";

/**
 * The price catalogue (story 20-009): what a plan costs, in our own words.
 *
 * Prices are ours, in major units, per plan, interval and currency. Which
 * provider plan or price backs one is `payment_provider_plans`, read only with
 * the service role, so the browser never names a provider id and never sees
 * one. An empty catalogue means nothing is priced yet — a person's decision —
 * and every screen then behaves as it did before.
 */

export type PlanPrice = { id: string; planKey: string; interval: BillingInterval; currency: string; amount: number };

type Row = Record<string, unknown>;

function fromRow(row: Row): PlanPrice {
  return {
    id: row.id as string,
    planKey: row.plan_key as string,
    interval: row.billing_interval as BillingInterval,
    currency: row.currency as string,
    amount: Number(row.amount),
  };
}

/** Every active price, for anyone deciding whether to pay one. */
export async function listPlanPrices(supabase: SupabaseClient): Promise<PlanPrice[]> {
  const { data, error } = await supabase
    .from("plan_prices")
    .select("id, plan_key, billing_interval, currency, amount")
    .eq("active", true)
    .order("amount", { ascending: true });
  if (error) throw new Error(`listPlanPrices failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map(fromRow);
}

/** One active price, checked against the plan it claims to price. */
export async function findPlanPrice(supabase: SupabaseClient, priceId: string, planKey: string): Promise<PlanPrice | null> {
  const { data, error } = await supabase
    .from("plan_prices")
    .select("id, plan_key, billing_interval, currency, amount")
    .eq("id", priceId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`findPlanPrice failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const price = fromRow(data as Row);
  return price.planKey === planKey ? price : null;
}

/** Which providers have this price mapped, and what each calls it. Service role only. */
export async function providerPlansFor(admin: SupabaseClient, priceId: string): Promise<Partial<Record<PaymentProviderName, string>>> {
  const { data, error } = await admin
    .from("payment_provider_plans")
    .select("provider, provider_plan_ref")
    .eq("plan_price_id", priceId)
    .eq("active", true);
  if (error) throw new Error(`providerPlansFor failed: ${error.code ?? "unknown"}`);
  const refs: Partial<Record<PaymentProviderName, string>> = {};
  for (const row of (data as Row[] | null) ?? []) refs[row.provider as PaymentProviderName] = row.provider_plan_ref as string;
  return refs;
}

/** The yearly saving against twelve monthly payments, as a whole percentage — arithmetic, never a claim. */
export function yearlySavingPercent(monthly: PlanPrice | undefined, yearly: PlanPrice | undefined): number | null {
  if (!monthly || !yearly || monthly.currency !== yearly.currency || monthly.amount <= 0) return null;
  const saving = 1 - yearly.amount / (monthly.amount * 12);
  return saving > 0 ? Math.round(saving * 100) : null;
}

/**
 * Which of a plan's prices can actually be bought here: the ones some live
 * provider has mapped. Service role, because the mapping is.
 */
export async function purchasablePriceIds(admin: SupabaseClient, planKey: string, liveProviders: readonly string[]): Promise<Set<string>> {
  if (liveProviders.length === 0) return new Set();
  const { data, error } = await admin
    .from("payment_provider_plans")
    .select("plan_price_id, provider, plan_prices!inner(plan_key, active)")
    .eq("active", true)
    .in("provider", [...liveProviders])
    .eq("plan_prices.plan_key", planKey)
    .eq("plan_prices.active", true);
  if (error) throw new Error(`purchasablePriceIds failed: ${error.code ?? "unknown"}`);
  return new Set(((data as Row[] | null) ?? []).map((row) => row.plan_price_id as string));
}
