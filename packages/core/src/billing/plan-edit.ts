import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "../api/audit";
import { ApiError } from "../api/errors";
import { forgetPlatformData } from "../lib/platform-cache";
import type { PlatformAdmin } from "../platform/admin";
import { describe as featureLabel } from "./entitlements";
import { formatPlanPrice, limitWords, PLAN_CURRENCY, type Interval, type PlanEdit, type PlanFeatureRow, type PlanSnapshot } from "./plan-shared";

/**
 * Editing a plan as members see it (owner request, 2026-11-07).
 *
 * The platform owner changes a plan's name, description, prices and what it
 * includes; everything else about a plan stays where it was. Money is decimal
 * (rule 22): an amount is typed as text, checked here, and stored as
 * `numeric(12, 2)`. Prices are ours; what a payment provider charges is set
 * at the provider, and saving here never claims otherwise.
 */

export type PlanChange = { field: string; from: unknown; to: unknown; line: string };

/**
 * What saving would change, as sentences a person can check, and only what is
 * true: an unpaid plan charges no one, a paid plan's renewals are the payment
 * provider's, and a feature taken away is gone for the plan's households.
 */
export function diffPlan(before: PlanSnapshot, edit: PlanEdit): PlanChange[] {
  const changes: PlanChange[] = [];
  const plan = before.name;
  if (edit.name !== before.name) changes.push({ field: "name", from: before.name, to: edit.name, line: `The plan is renamed from ${before.name} to ${edit.name}.` });
  if ((edit.description ?? null) !== (before.description ?? null)) changes.push({ field: "description", from: before.description, to: edit.description, line: `${plan}'s description changes.` });

  const priceLine = (interval: Interval, from: number | null, to: number | null) => {
    const unit = interval === "month" ? "a month" : "a year";
    const nowText = to === null ? "no price" : `${formatPlanPrice(to, PLAN_CURRENCY)} ${unit}`;
    const old = from === null ? "no price" : `${formatPlanPrice(from, PLAN_CURRENCY)} ${unit}`;
    const tail = before.requiresPayment
      ? " Households already paying keep what they were charged for their current term; what a renewal charges is set at the payment provider, which this does not change."
      : " Payments are not open, so no household is charged and switching stays free during early access.";
    return `${plan} price goes from ${old} to ${nowText}.${tail}`;
  };
  if (edit.monthly !== before.monthly) changes.push({ field: "price.month", from: before.monthly, to: edit.monthly, line: priceLine("month", before.monthly, edit.monthly) });
  if (edit.yearly !== before.yearly) changes.push({ field: "price.year", from: before.yearly, to: edit.yearly, line: priceLine("year", before.yearly, edit.yearly) });

  for (const wanted of edit.features) {
    const current = before.features.find((row) => row.featureKey === wanted.featureKey);
    if (!current) continue;
    const next = { enabled: wanted.enabled, limit: wanted.limit };
    if (current.enabled === next.enabled && (!next.enabled || current.limit === next.limit)) continue;
    const label = featureLabel(wanted.featureKey);
    const line = !next.enabled
      ? `${label} is turned off on ${plan}: households on ${plan} lose it within a minute.`
      : !current.enabled
        ? `${label} is turned on for ${plan} (${limitWords(next)}): households on ${plan} get it within a minute.`
        : `${label} on ${plan} goes from ${limitWords(current)} to ${limitWords(next)}, for households already on ${plan} too, within a minute.`;
    changes.push({ field: `feature.${wanted.featureKey}`, from: limitWords(current), to: limitWords(next), line });
  }
  return changes;
}

export { featureLines, parseAmount, planBadge, planEditSchema, yearlySavingWords } from "./plan-shared";
export type { PlanEdit, PlanSnapshot } from "./plan-shared";

export async function loadPlanSnapshots(admin: SupabaseClient): Promise<PlanSnapshot[]> {
  const [plans, prices, features] = await Promise.all([
    admin.from("plans").select("key, name, description, requires_payment, active").order("sort_order").limit(20),
    admin.from("plan_prices").select("plan_key, billing_interval, amount").eq("active", true).eq("currency", PLAN_CURRENCY).limit(100),
    admin.from("plan_features").select("plan_key, feature_key, enabled, limit_per_period, period").order("feature_key").limit(500),
  ]);
  for (const result of [plans, prices, features]) if (result.error) throw new Error(`loadPlanSnapshots failed: ${result.error.code ?? "unknown"}`);
  type Row = Record<string, unknown>;
  return ((plans.data ?? []) as Row[]).map((plan) => {
    const priceOf = (interval: Interval) => {
      const row = ((prices.data ?? []) as Row[]).find((candidate) => candidate.plan_key === plan.key && candidate.billing_interval === interval);
      return row ? Number(row.amount) : null;
    };
    return {
      key: plan.key as string,
      name: plan.name as string,
      description: (plan.description as string | null) ?? null,
      requiresPayment: Boolean(plan.requires_payment),
      active: Boolean(plan.active),
      monthly: priceOf("month"),
      yearly: priceOf("year"),
      features: ((features.data ?? []) as Row[])
        .filter((row) => row.plan_key === plan.key)
        .map((row) => ({
          featureKey: row.feature_key as string,
          enabled: Boolean(row.enabled),
          limit: row.limit_per_period === null ? null : Number(row.limit_per_period),
          period: row.period as PlanFeatureRow["period"],
        })),
    };
  });
}

/**
 * Saves an edit. Platform owner only, checked here as well as at the route.
 * A price change retires the active price and adds a new one, so the old
 * price's provider mapping and every past term stay true to what they were.
 */
export async function savePlan(
  admin: SupabaseClient,
  actor: PlatformAdmin,
  planKey: string,
  edit: PlanEdit,
  options: { dryRun?: boolean; requestId?: string } = {},
): Promise<{ changed: boolean; changes: PlanChange[] }> {
  if (actor.role !== "owner") throw ApiError.forbidden("Only the platform owner can edit a plan.");
  const before = (await loadPlanSnapshots(admin)).find((plan) => plan.key === planKey);
  if (!before) throw ApiError.notFound("No such plan.");
  for (const wanted of edit.features) if (!before.features.some((row) => row.featureKey === wanted.featureKey)) throw ApiError.badRequest(`${wanted.featureKey} is not a feature of this plan.`);

  const changes = diffPlan(before, edit);
  if (changes.length === 0 || options.dryRun) return { changed: false, changes };

  if (changes.some((change) => change.field === "name" || change.field === "description")) {
    const { error } = await admin.from("plans").update({ name: edit.name, description: edit.description }).eq("key", planKey);
    if (error) throw new Error(`savePlan failed: ${error.code ?? "unknown"}`);
  }

  for (const [interval, field] of [["month", "price.month"], ["year", "price.year"]] as const) {
    const change = changes.find((candidate) => candidate.field === field);
    if (!change) continue;
    const retire = await admin.from("plan_prices").update({ active: false }).eq("plan_key", planKey).eq("billing_interval", interval).eq("currency", PLAN_CURRENCY).eq("active", true);
    if (retire.error) throw new Error(`savePlan failed: ${retire.error.code ?? "unknown"}`);
    if (change.to !== null) {
      const add = await admin.from("plan_prices").insert({ plan_key: planKey, billing_interval: interval, currency: PLAN_CURRENCY, amount: change.to });
      if (add.error) {
        // Put the old price back rather than leave the plan unpriced.
        if (change.from !== null) await admin.from("plan_prices").insert({ plan_key: planKey, billing_interval: interval, currency: PLAN_CURRENCY, amount: change.from });
        throw new Error(`savePlan failed: ${add.error.code ?? "unknown"}`);
      }
    }
  }

  for (const change of changes.filter((candidate) => candidate.field.startsWith("feature."))) {
    const featureKey = change.field.slice("feature.".length);
    const wanted = edit.features.find((row) => row.featureKey === featureKey)!;
    const current = before.features.find((row) => row.featureKey === featureKey)!;
    // A limit counts per month; "unlimited" is one bucket for all time.
    const period = wanted.limit === null ? "forever" : current.period === "forever" ? "month" : current.period;
    const { error } = await admin
      .from("plan_features")
      .update({ enabled: wanted.enabled, limit_per_period: wanted.enabled ? wanted.limit : current.limit, period: wanted.enabled ? period : current.period })
      .eq("plan_key", planKey)
      .eq("feature_key", featureKey);
    if (error) throw new Error(`savePlan failed: ${error.code ?? "unknown"}`);
  }

  forgetPlatformData("plan_catalog");
  await recordAuditEvent(admin, {
    householdId: null,
    eventType: "platform.plan_updated",
    actorProfileId: actor.profileId,
    targetTable: "plans",
    metadata: { planKey, changes: changes.map(({ field, from, to }) => ({ field, from, to })) },
    requestId: options.requestId,
  });
  return { changed: true, changes };
}

