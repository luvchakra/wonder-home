import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { auditChange } from "../api/audit";
import { formatMoney } from "./money";
import { findPlanPrice, providerPlansFor, yearlySavingPercent, type PlanPrice } from "./prices";
import type { BillingInterval, PaymentProviderName, PaymentStatus } from "./provider";
import { billingProviderNamed, billingProvidersFromEnv, routingConfigFromEnv, selectPaymentProvider } from "./router";

/**
 * The household's side of billing (story 20-010): what a plan costs here, what
 * the household is paying, what it has paid, and the one change it may ask a
 * provider for directly — ending at the end of the period.
 *
 * Every number on these screens is read from our catalogue or our ledger.
 * Nothing here decides that a payment happened: that is only ever a verified
 * webhook (story 20-009). A plan that is priced but does not yet require
 * payment is "early access" — the price is shown and switching stays free
 * until a person marks the plan paid, once a provider is live.
 */

type Row = Record<string, unknown>;
type Env = Record<string, string | undefined>;

/** The catalogue's currency until a household's own currency is priced. */
export const DEFAULT_PRICE_CURRENCY = "INR";

/** An amount as a household reads it: whole rupees without ".00", paise when there are any. */
export function formatPrice(amount: number, currency: string, locale = "en-IN"): string {
  if (Number.isInteger(amount)) {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  }
  return formatMoney(amount, currency, locale);
}

export type PlanTier = { key: string; name: string; requiresPayment: boolean };

export type PriceLine = {
  priceId: string;
  amount: number;
  currency: string;
  interval: BillingInterval;
  /** For a yearly price, what it comes to per month — arithmetic, shown as such. */
  perMonth: number | null;
  /** Against twelve monthly payments; null when there is no saving to state. */
  savingPercent: number | null;
  /** Priced, but switching is still free: the plan does not require payment yet. */
  earlyAccess: boolean;
};

/**
 * Each plan's price for one interval, in one currency, from the catalogue.
 * A plan with no price there (Free, or a plan not yet priced) has none — the
 * screen says so rather than inventing ₹0.
 */
export function priceLines(
  plans: readonly PlanTier[],
  prices: readonly PlanPrice[],
  interval: BillingInterval,
  currency: string = DEFAULT_PRICE_CURRENCY,
): Record<string, PriceLine | null> {
  const lines: Record<string, PriceLine | null> = {};
  for (const plan of plans) {
    const find = (wanted: BillingInterval) => prices.find((price) => price.planKey === plan.key && price.interval === wanted && price.currency === currency);
    const price = find(interval);
    if (!price) {
      lines[plan.key] = null;
      continue;
    }
    const monthly = find("month");
    lines[plan.key] = {
      priceId: price.id,
      amount: price.amount,
      currency: price.currency,
      interval: price.interval,
      perMonth: interval === "year" ? Math.floor((price.amount / 12) * 100) / 100 : null,
      savingPercent: interval === "year" ? yearlySavingPercent(monthly, price) : null,
      earlyAccess: !plan.requiresPayment,
    };
  }
  return lines;
}

/** The best saving any plan offers yearly, for the toggle's label. Null when none. */
export function bestYearlySaving(plans: readonly PlanTier[], prices: readonly PlanPrice[], currency: string = DEFAULT_PRICE_CURRENCY): number | null {
  const savings = Object.values(priceLines(plans, prices, "year", currency))
    .map((line) => line?.savingPercent ?? null)
    .filter((saving): saving is number => saving !== null);
  return savings.length > 0 ? Math.max(...savings) : null;
}

export type BillingTerms = {
  planKey: string;
  status: "active" | "past_due" | "cancelled" | "paused";
  provider: PaymentProviderName | null;
  interval: BillingInterval | null;
  currency: string | null;
  amount: number | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  scheduledPlanKey: string | null;
};

/** What the household is paying, as the subscription row says — never as a provider does. */
export async function loadBillingTerms(supabase: SupabaseClient, householdId: string): Promise<BillingTerms> {
  const { data, error } = await supabase
    .from("household_subscriptions")
    .select("plan_key, status, provider, billing_interval, currency, amount, current_period_end, cancel_at_period_end, scheduled_plan_key")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw new Error(`loadBillingTerms failed: ${error.code ?? "unknown"}`);
  const row = (data as Row | null) ?? {};
  return {
    planKey: (row.plan_key as string | undefined) ?? "free",
    status: (row.status as BillingTerms["status"] | undefined) ?? "active",
    provider: (row.provider as PaymentProviderName | null | undefined) ?? null,
    interval: (row.billing_interval as BillingInterval | null | undefined) ?? null,
    currency: (row.currency as string | null | undefined) ?? null,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    periodEnd: row.current_period_end ? new Date(row.current_period_end as string) : null,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    scheduledPlanKey: (row.scheduled_plan_key as string | null | undefined) ?? null,
  };
}

export type HistoryEntry = {
  id: string;
  planKey: string | null;
  amount: number | null;
  currency: string | null;
  status: PaymentStatus;
  method: string | null;
  last4: string | null;
  paidAt: Date | null;
  createdAt: Date;
  provider: PaymentProviderName;
  invoiceId: string | null;
};

/** What the household has paid, newest first. Admins only — the ledger's own policy decides. */
export async function listBillingHistory(supabase: SupabaseClient, householdId: string, limit = 50): Promise<HistoryEntry[]> {
  const [{ data: payments, error }, { data: invoices, error: invoiceError }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, plan_key, amount, currency, status, method, method_last4, paid_at, created_at, provider")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("billing_invoices").select("id, payment_id").eq("household_id", householdId).limit(limit * 2),
  ]);
  if (error) throw new Error(`listBillingHistory failed: ${error.code ?? "unknown"}`);
  if (invoiceError) throw new Error(`listBillingHistory failed: ${invoiceError.code ?? "unknown"}`);
  const invoiceFor = new Map(((invoices as Row[] | null) ?? []).map((row) => [row.payment_id as string, row.id as string]));
  return ((payments as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    planKey: (row.plan_key as string | null) ?? null,
    amount: row.amount === null ? null : Number(row.amount),
    currency: (row.currency as string | null) ?? null,
    status: row.status as PaymentStatus,
    method: (row.method as string | null) ?? null,
    last4: (row.method_last4 as string | null) ?? null,
    paidAt: row.paid_at ? new Date(row.paid_at as string) : null,
    createdAt: new Date(row.created_at as string),
    provider: row.provider as PaymentProviderName,
    invoiceId: invoiceFor.get(row.id as string) ?? null,
  }));
}

export type InvoiceDetail = {
  id: string;
  number: string | null;
  planKey: string | null;
  amount: number | null;
  currency: string | null;
  status: "paid" | "open" | "void" | "uncollectible";
  issuedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  invoiceUrl: string | null;
  receiptUrl: string | null;
  provider: PaymentProviderName;
  payment: { method: string | null; last4: string | null; status: PaymentStatus; paidAt: Date | null } | null;
};

export async function loadInvoice(supabase: SupabaseClient, householdId: string, invoiceId: string): Promise<InvoiceDetail | null> {
  const { data, error } = await supabase
    .from("billing_invoices")
    .select("id, number, plan_key, amount, currency, status, issued_at, period_start, period_end, invoice_url, receipt_url, provider, payment_id")
    .eq("household_id", householdId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(`loadInvoice failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as Row;
  let payment: InvoiceDetail["payment"] = null;
  if (row.payment_id) {
    const { data: paid } = await supabase.from("payments").select("method, method_last4, status, paid_at").eq("id", row.payment_id as string).maybeSingle();
    const paidRow = paid as Row | null;
    if (paidRow) {
      payment = {
        method: (paidRow.method as string | null) ?? null,
        last4: (paidRow.method_last4 as string | null) ?? null,
        status: paidRow.status as PaymentStatus,
        paidAt: paidRow.paid_at ? new Date(paidRow.paid_at as string) : null,
      };
    }
  }
  return {
    id: row.id as string,
    number: (row.number as string | null) ?? null,
    planKey: (row.plan_key as string | null) ?? null,
    amount: row.amount === null ? null : Number(row.amount),
    currency: (row.currency as string | null) ?? null,
    status: row.status as InvoiceDetail["status"],
    issuedAt: new Date(row.issued_at as string),
    periodStart: row.period_start ? new Date(row.period_start as string) : null,
    periodEnd: row.period_end ? new Date(row.period_end as string) : null,
    invoiceUrl: (row.invoice_url as string | null) ?? null,
    receiptUrl: (row.receipt_url as string | null) ?? null,
    provider: row.provider as PaymentProviderName,
    payment,
  };
}

/** A payment's state in the words a household reads — closed words, never the provider's. */
export function paymentStatusWords(status: PaymentStatus): { label: string; tone: "handled" | "attention" | "risk" | "neutral" } {
  switch (status) {
    case "succeeded":
      return { label: "Paid", tone: "handled" };
    case "refunded":
      return { label: "Refunded", tone: "neutral" };
    case "partially_refunded":
      return { label: "Partly refunded", tone: "neutral" };
    case "failed":
      return { label: "Didn't go through", tone: "risk" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "requires_action":
      return { label: "Waiting on your bank", tone: "attention" };
    default:
      return { label: "Processing", tone: "attention" };
  }
}

const METHOD_WORDS: Record<string, string> = {
  card: "Card",
  upi: "UPI",
  netbanking: "Netbanking",
  wallet: "Wallet",
  emi: "EMI",
  bank_transfer: "Bank transfer",
  other: "Other",
};

/** "Card •••• 4242", "UPI" — the method and at most the last four digits we were told. */
export function methodWords(method: string | null, last4: string | null): string | null {
  if (!method) return null;
  const word = METHOD_WORDS[method] ?? "Other";
  return last4 ? `${word} •••• ${last4}` : word;
}

/** What each provider's hosted page lets a household pay with — its own page, not ours. */
export const PROVIDER_METHODS: Record<PaymentProviderName, { name: string; methods: string }> = {
  razorpay: { name: "Razorpay", methods: "UPI, cards, netbanking and wallets" },
  stripe: { name: "Stripe", methods: "Cards, with 3-D Secure when your bank asks for it" },
};

export type CheckoutOption =
  | { ready: true; price: PlanPrice; provider: PaymentProviderName }
  | { ready: false; price: PlanPrice | null; reason: "no_price" | "not_paid_yet" | "no_provider" };

/**
 * Whether this price can be paid for here, and through whom — the same
 * decision `startPricedCheckout` makes, asked before anyone presses a button
 * so the screen never offers a checkout that goes nowhere (rule 10).
 */
export async function checkoutOption(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  input: { priceId: string; planKey: string; requiresPayment: boolean; country: string | null; env?: Env },
): Promise<CheckoutOption> {
  const price = await findPlanPrice(supabase, input.priceId, input.planKey);
  if (!price) return { ready: false, price: null, reason: "no_price" };
  if (!input.requiresPayment) return { ready: false, price, reason: "not_paid_yet" };
  const refs = await providerPlansFor(admin, price.id);
  const eligible = billingProvidersFromEnv(input.env)
    .map((provider) => provider.name as PaymentProviderName)
    .filter((name) => refs[name]);
  const choice = selectPaymentProvider({ currency: price.currency, country: input.country, eligible, config: routingConfigFromEnv(input.env) });
  return choice.provider ? { ready: true, price, provider: choice.provider } : { ready: false, price, reason: "no_provider" };
}

/**
 * Ends a paid plan at the end of the period it is paid for (spec §19). The
 * provider is told first; only when it accepts is the subscription marked,
 * and the plan itself stays until the period ends — the provider's own
 * cancellation webhook moves it to free then. Nothing is refunded here.
 */
export async function cancelAtPeriodEnd(
  admin: SupabaseClient,
  input: { householdId: string; memberId: string; env?: Env },
): Promise<{ periodEnd: Date | null }> {
  const { data, error } = await admin
    .from("household_subscriptions")
    .select("plan_key, provider, external_ref, current_period_end, cancel_at_period_end")
    .eq("household_id", input.householdId)
    .maybeSingle();
  if (error) throw new Error(`cancelAtPeriodEnd failed: ${error.code ?? "unknown"}`);
  const row = data as Row | null;
  const periodEnd = row?.current_period_end ? new Date(row.current_period_end as string) : null;
  if (!row?.provider || !row.external_ref) throw ApiError.conflict("There is no paid plan to cancel. Nothing has changed.");
  if (row.cancel_at_period_end === true) return { periodEnd };

  const provider = billingProviderNamed(row.provider as string, input.env);
  if (!provider?.live || !provider.cancelSubscription) {
    throw ApiError.conflict("We can't reach the payment provider just now. Nothing has changed — please try again later.");
  }
  await provider.cancelSubscription({ externalRef: row.external_ref as string, atPeriodEnd: true });

  const { error: writeError } = await admin
    .from("household_subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("household_id", input.householdId);
  if (writeError) throw new Error(`cancelAtPeriodEnd failed: ${writeError.code ?? "unknown"}`);
  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.memberId,
    eventType: "subscription.changed",
    targetTable: "household_subscriptions",
    targetId: input.householdId,
    metadata: { from: row.plan_key as string, to: row.plan_key as string, endsAtPeriodEnd: true, source: "cancel_requested", provider: row.provider as string },
  });
  return { periodEnd };
}
