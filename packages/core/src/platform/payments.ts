import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import type { BillingProvider, PaymentStatus } from "../billing/provider";
import { billingProviderNamed } from "../billing/router";
import { platformCan, type PlatformAdmin } from "./admin";

/**
 * Payments as platform staff see them (story 20-011): counts first, then the
 * rows that need a person — failures, refunds, and what reconciliation found.
 * Read through the service-role client, because staff have no membership to
 * read through. Nothing here carries a card number, a secret or provider prose:
 * the ledger never held them.
 */

export const PAYMENT_REFUND_REASON_CODES = ["requested_by_customer", "duplicate", "service_issue", "other"] as const;
export type PaymentRefundReasonCode = (typeof PAYMENT_REFUND_REASON_CODES)[number];

type Row = Record<string, unknown>;

export type PaymentsOverview = {
  windowDays: number;
  counts: { status: string; provider: string; currency: string; payments: number; amount: number }[];
  refunds: { pending: number; succeeded: number; failed: number };
  failures: { id: string; householdId: string; provider: string; planKey: string | null; amount: number | null; currency: string; failureCode: string | null; at: string }[];
  recentRefunds: { id: string; paymentId: string; householdId: string; provider: string; amount: number; currency: string; status: string; reason: string | null; at: string }[];
  reconciliation: {
    lastRuns: { provider: string; outcome: string; checked: number; differences: number; unreachable: number; at: string }[];
    openFindings: { id: string; paymentId: string; householdId: string; provider: string; kind: string; ledgerStatus: string; providerStatus: string | null; at: string }[];
  };
};

function requireCapability(actor: PlatformAdmin, capability: string, refusal: string): void {
  if (!platformCan(actor, capability)) throw ApiError.forbidden(refusal);
}

export async function paymentsOverview(admin: SupabaseClient, actor: PlatformAdmin, windowDays = 30, now: Date = new Date()): Promise<PaymentsOverview> {
  requireCapability(actor, "payments.read", "Your platform role cannot see payments.");
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();

  const [payments, refunds, failures, runs, findings] = await Promise.all([
    admin.from("payments").select("status, provider, currency, amount").gte("created_at", since).limit(5000),
    admin.from("payment_refunds").select("id, payment_id, household_id, provider, amount, currency, status, reason, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(200),
    admin
      .from("payments")
      .select("id, household_id, provider, plan_key, amount, currency, failure_code, created_at")
      .eq("status", "failed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(25),
    admin.from("billing_reconciliation_runs").select("provider, outcome, checked, differences, unreachable, started_at").order("started_at", { ascending: false }).limit(10),
    admin
      .from("billing_reconciliation_findings")
      .select("id, payment_id, household_id, provider, kind, ledger_status, provider_status, created_at")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  for (const result of [payments, refunds, failures, runs, findings]) {
    if (result.error) throw new Error(`payments overview failed: ${result.error.code ?? "unknown"}`);
  }

  // One count per status, provider and currency: amounts are never added across currencies.
  const tally = new Map<string, PaymentsOverview["counts"][number]>();
  for (const row of (payments.data ?? []) as Row[]) {
    const key = `${row.status}|${row.provider}|${row.currency}`;
    const entry = tally.get(key) ?? { status: row.status as string, provider: row.provider as string, currency: row.currency as string, payments: 0, amount: 0 };
    entry.payments += 1;
    entry.amount = Math.round((entry.amount + Number(row.amount ?? 0)) * 100) / 100;
    tally.set(key, entry);
  }

  const refundRows = (refunds.data ?? []) as Row[];
  const latestRunPerProvider = new Map<string, Row>();
  for (const run of (runs.data ?? []) as Row[]) if (!latestRunPerProvider.has(run.provider as string)) latestRunPerProvider.set(run.provider as string, run);

  return {
    windowDays,
    counts: [...tally.values()].sort((a, b) => b.payments - a.payments),
    refunds: {
      pending: refundRows.filter((row) => row.status === "pending" || row.status === "processing").length,
      succeeded: refundRows.filter((row) => row.status === "succeeded").length,
      failed: refundRows.filter((row) => row.status === "failed" || row.status === "cancelled").length,
    },
    failures: ((failures.data ?? []) as Row[]).map((row) => ({
      id: row.id as string,
      householdId: row.household_id as string,
      provider: row.provider as string,
      planKey: (row.plan_key as string | null) ?? null,
      amount: row.amount === null ? null : Number(row.amount),
      currency: row.currency as string,
      failureCode: (row.failure_code as string | null) ?? null,
      at: row.created_at as string,
    })),
    recentRefunds: refundRows.slice(0, 25).map((row) => ({
      id: row.id as string,
      paymentId: row.payment_id as string,
      householdId: row.household_id as string,
      provider: row.provider as string,
      amount: Number(row.amount),
      currency: row.currency as string,
      status: row.status as string,
      reason: (row.reason as string | null) ?? null,
      at: row.created_at as string,
    })),
    reconciliation: {
      lastRuns: [...latestRunPerProvider.values()].map((run) => ({
        provider: run.provider as string,
        outcome: run.outcome as string,
        checked: Number(run.checked),
        differences: Number(run.differences),
        unreachable: Number(run.unreachable),
        at: run.started_at as string,
      })),
      openFindings: ((findings.data ?? []) as Row[]).map((row) => ({
        id: row.id as string,
        paymentId: row.payment_id as string,
        householdId: row.household_id as string,
        provider: row.provider as string,
        kind: row.kind as string,
        ledgerStatus: row.ledger_status as string,
        providerStatus: (row.provider_status as string | null) ?? null,
        at: row.created_at as string,
      })),
    },
  };
}

/** What is still refundable: the amount paid, less refunds done or on their way. */
export function refundableAmount(paid: number, refunds: readonly { amount: number; status: string }[]): number {
  const committed = refunds.filter((refund) => refund.status !== "failed" && refund.status !== "cancelled").reduce((sum, refund) => sum + refund.amount, 0);
  return Math.max(0, Math.round((paid - committed) * 100) / 100);
}

const REFUNDABLE: ReadonlySet<PaymentStatus> = new Set(["succeeded", "partially_refunded"]);

/**
 * Staff start a refund (story 20-011). It is pending until the provider's own
 * refund event confirms it — the API call returning is never taken as the
 * outcome — and the refund row's id is the provider's idempotency key, so a
 * retried request is never a second refund.
 */
export async function staffRefund(
  admin: SupabaseClient,
  actor: PlatformAdmin,
  input: { paymentId: string; amount?: number; reasonCode: PaymentRefundReasonCode },
  options: { provider?: BillingProvider | null } = {},
): Promise<{ refundId: string; amount: number; currency: string; status: "processing" }> {
  requireCapability(actor, "payments.refund", "Your platform role cannot refund a payment.");

  const { data: payment, error } = await admin
    .from("payments")
    .select("id, household_id, provider, provider_payment_id, amount, currency, status")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (error) throw new Error(`staff refund failed: ${error.code ?? "unknown"}`);
  if (!payment) throw ApiError.notFound("That payment is not on record.");
  const row = payment as Row;
  if (!REFUNDABLE.has(row.status as PaymentStatus) || row.amount === null) throw ApiError.conflict("Only a payment that went through can be refunded.");

  const { data: existing } = await admin.from("payment_refunds").select("amount, status").eq("payment_id", row.id as string);
  const refundable = refundableAmount(
    Number(row.amount),
    ((existing ?? []) as Row[]).map((refund) => ({ amount: Number(refund.amount), status: refund.status as string })),
  );
  const amount = input.amount ?? refundable;
  if (!(amount > 0)) throw ApiError.conflict("Nothing is left to refund on this payment.");
  if (amount > refundable + 0.001) throw ApiError.badRequest(`At most ${refundable} ${row.currency as string} can be refunded.`);

  const provider = options.provider === undefined ? billingProviderNamed(row.provider as string) : options.provider;
  if (!provider?.live || !provider.refundPayment) throw ApiError.conflict("That payment provider is not configured here, so the refund cannot be sent.");

  const { data: created, error: insertError } = await admin
    .from("payment_refunds")
    .insert({
      household_id: row.household_id,
      payment_id: row.id,
      provider: row.provider,
      amount,
      currency: row.currency,
      status: "pending",
      reason: input.reasonCode,
      requested_by: actor.profileId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`staff refund failed: ${insertError.code ?? "unknown"}`);
  const refundId = (created as Row).id as string;

  try {
    const { providerRefundId } = await provider.refundPayment({
      providerPaymentId: row.provider_payment_id as string,
      amount,
      currency: row.currency as string,
      idempotencyKey: refundId,
    });
    await admin.from("payment_refunds").update({ provider_refund_id: providerRefundId, status: "processing" }).eq("id", refundId);
  } catch {
    await admin.from("payment_refunds").update({ status: "failed" }).eq("id", refundId);
    throw ApiError.conflict("The provider did not accept the refund. Nothing was sent back; try again or refund from the provider's dashboard.");
  }

  await auditChange({
    householdId: row.household_id as string,
    eventType: "payment.refund_requested",
    actorProfileId: actor.profileId,
    targetTable: "payment_refunds",
    targetId: refundId,
    // Closed words and the amount in its own currency; no provider id, no card detail.
    metadata: { reasonCode: input.reasonCode, amount, currency: row.currency, provider: row.provider, source: "platform_staff" },
  });

  return { refundId, amount, currency: row.currency as string, status: "processing" };
}
