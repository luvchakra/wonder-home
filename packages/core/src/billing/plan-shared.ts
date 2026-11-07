import { z } from "zod";

import { describe as featureLabel } from "./entitlements";
import { formatMoney } from "./money";

/**
 * The pure half of plan editing: validation, the badge, the sentences about
 * prices and limits, and a plan's features as members read them. Nothing here
 * touches a database, so the platform-admin editor (a client component) runs
 * the very same code the server does.
 */

/** "₹299", "₹349.50" — whole amounts without the paise, like the member plan page. */
export function formatPlanPrice(amount: number, currency = "INR"): string {
  return Number.isInteger(amount)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
    : formatMoney(amount, currency);
}

export const PLAN_CURRENCY = "INR";
export type Interval = "month" | "year";

export type PlanFeatureRow = { featureKey: string; enabled: boolean; limit: number | null; period: "day" | "month" | "year" | "forever" };
export type PlanSnapshot = {
  key: string;
  name: string;
  description: string | null;
  requiresPayment: boolean;
  active: boolean;
  monthly: number | null;
  yearly: number | null;
  features: PlanFeatureRow[];
};

/** "349", "349.5" and "349.50" are amounts; "-1", "3.499", "1,000" and "₹5" are not. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(trimmed)) return null;
  return Number(trimmed);
}

const amountText = z
  .string()
  .nullable()
  .refine((value) => value === null || value.trim() === "" || parseAmount(value) !== null, "Use a plain amount such as 349 or 349.50.")
  .transform((value) => (value === null || value.trim() === "" ? null : parseAmount(value)));

export const planEditSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullable().transform((value) => (value ? value : null)),
  monthly: amountText,
  yearly: amountText,
  features: z
    .array(z.object({ featureKey: z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/), enabled: z.boolean(), limit: z.number().int().min(1).max(1_000_000_000).nullable() }))
    .max(60),
});
export type PlanEdit = z.infer<typeof planEditSchema>;

export type PlanBadge = "free" | "earlyAccess" | "paid";

/** Free only when nothing is charged; a priced plan is "Paid", or early access until payments open. */
export function planBadge(plan: Pick<PlanSnapshot, "requiresPayment" | "monthly" | "yearly">): PlanBadge {
  const priced = (plan.monthly ?? 0) > 0 || (plan.yearly ?? 0) > 0;
  if (!priced) return "free";
  return plan.requiresPayment ? "paid" : "earlyAccess";
}

/** The yearly price against twelve monthly payments, in words. */
export function yearlySavingWords(monthly: number | null, yearly: number | null, currency = PLAN_CURRENCY): string | null {
  if (monthly === null || yearly === null || monthly <= 0) return null;
  const twelve = Math.round(monthly * 12 * 100) / 100;
  if (yearly >= twelve) return `A year costs ${formatPlanPrice(yearly, currency)} — no saving over twelve months at ${formatPlanPrice(twelve, currency)}.`;
  const percent = Math.round((1 - yearly / twelve) * 100);
  return `A year costs ${formatPlanPrice(yearly, currency)} against ${formatPlanPrice(twelve, currency)} for twelve months — members save ${percent}%.`;
}

export type FeatureLine = { featureKey: string; label: string; enabled: boolean; limit: number | null; value: string };

const PERIOD_WORDS: Record<PlanFeatureRow["period"], string> = { day: "a day", month: "a month", year: "a year", forever: "" };

/**
 * A plan's features as members read them: the member-facing label (never the
 * raw key) and "Included" or "200 a month". The member plan page and the
 * platform preview both call this, so they cannot disagree.
 */
export function featureLines(rows: readonly PlanFeatureRow[]): FeatureLine[] {
  return rows.map((row) => ({
    featureKey: row.featureKey,
    label: featureLabel(row.featureKey),
    enabled: row.enabled,
    limit: row.limit,
    value: row.limit === null ? "Included" : `${row.limit.toLocaleString("en-IN")} ${PERIOD_WORDS[row.period] || "in all"}`.trim(),
  }));
}
export const limitWords = (row: { enabled: boolean; limit: number | null }) => (!row.enabled ? "off" : row.limit === null ? "unlimited" : `${row.limit.toLocaleString("en-IN")} a month`);

