import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingProvider, PaymentProviderName, PaymentStatus, RemotePayment } from "./provider";
import { billingProviderNamed, PAYMENT_PROVIDERS } from "./router";

/**
 * Reconciliation (story 20-011): does our ledger say what each provider says?
 *
 * The ledger only ever moves on a verified provider event, so a missed or
 * lost webhook leaves it behind the provider. This pass reads recent payments
 * back from the provider and records any difference in closed words. It never
 * corrects the ledger itself: a difference is for a person to look at, and the
 * provider's next event (or a staff action) is what moves a payment.
 */

export type ReconciliationKind = "missing_at_provider" | "status_mismatch" | "amount_mismatch" | "currency_mismatch";

export type LedgerEntry = { id: string; householdId: string; providerPaymentId: string; status: PaymentStatus; amount: number | null; currency: string };

/** Statuses still on their way somewhere: a provider ahead of us here is timing, not a difference. */
const IN_FLIGHT: ReadonlySet<PaymentStatus> = new Set(["created", "requires_action", "processing"]);

/** What, if anything, differs between one ledger row and the provider's view of it. */
export function compareWithProvider(ledger: LedgerEntry, remote: RemotePayment | null): ReconciliationKind | null {
  if (!remote) return "missing_at_provider";
  if (remote.currency !== ledger.currency) return "currency_mismatch";
  if (ledger.amount !== null && Math.abs(remote.amount - ledger.amount) >= 0.005) return "amount_mismatch";
  if (remote.status !== ledger.status && !(IN_FLIGHT.has(ledger.status) && IN_FLIGHT.has(remote.status))) return "status_mismatch";
  return null;
}

export type ReconciliationSummary = {
  provider: PaymentProviderName;
  outcome: "completed" | "skipped_not_configured" | "failed";
  checked: number;
  matched: number;
  differences: number;
  unreachable: number;
};

/** How far back a pass looks, and how much it reads, so one run stays bounded. */
export const RECONCILE_WINDOW_DAYS = 35;
export const RECONCILE_LIMIT = 200;

/**
 * One pass for one provider. Needs the service-role client: it reads every
 * household's ledger and writes the service-only reconciliation tables.
 */
export async function reconcileProvider(
  admin: SupabaseClient,
  name: PaymentProviderName,
  options: { provider?: BillingProvider | null; now?: Date } = {},
): Promise<ReconciliationSummary> {
  const provider = options.provider === undefined ? billingProviderNamed(name) : options.provider;
  const empty = { provider: name, checked: 0, matched: 0, differences: 0, unreachable: 0 };
  if (!provider?.live || !provider.fetchPayment) return { ...empty, outcome: "skipped_not_configured" };

  const now = options.now ?? new Date();
  const { data: run, error: runError } = await admin.from("billing_reconciliation_runs").insert({ provider: name, started_at: now.toISOString() }).select("id").single();
  if (runError) throw new Error(`reconcile run failed: ${runError.code ?? "unknown"}`);
  const runId = (run as { id: string }).id;

  const since = new Date(now.getTime() - RECONCILE_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: rows, error } = await admin
    .from("payments")
    .select("id, household_id, provider_payment_id, status, amount, currency")
    .eq("provider", name)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(RECONCILE_LIMIT);
  if (error) {
    await admin.from("billing_reconciliation_runs").update({ outcome: "failed", finished_at: new Date().toISOString() }).eq("id", runId);
    return { ...empty, outcome: "failed" };
  }

  const summary = { ...empty, outcome: "completed" as const };
  for (const row of (rows ?? []) as Record<string, unknown>[]) {
    const entry: LedgerEntry = {
      id: row.id as string,
      householdId: row.household_id as string,
      providerPaymentId: row.provider_payment_id as string,
      status: row.status as PaymentStatus,
      amount: row.amount === null ? null : Number(row.amount),
      currency: row.currency as string,
    };
    summary.checked += 1;
    let remote: RemotePayment | null;
    try {
      remote = await provider.fetchPayment(entry.providerPaymentId);
    } catch {
      // An outage is not a difference: counted, never recorded as a finding.
      summary.unreachable += 1;
      continue;
    }
    const kind = compareWithProvider(entry, remote);
    if (!kind) {
      summary.matched += 1;
      // A payment that agrees now closes whatever was open about it.
      await admin.from("billing_reconciliation_findings").update({ resolved_at: now.toISOString() }).eq("payment_id", entry.id).is("resolved_at", null);
      continue;
    }
    summary.differences += 1;
    const { data: open } = await admin
      .from("billing_reconciliation_findings")
      .select("id")
      .eq("payment_id", entry.id)
      .eq("kind", kind)
      .is("resolved_at", null)
      .maybeSingle();
    // One open finding per payment and kind: a difference that persists is not news each night.
    if (!open) {
      await admin.from("billing_reconciliation_findings").insert({
        run_id: runId,
        payment_id: entry.id,
        household_id: entry.householdId,
        provider: name,
        kind,
        ledger_status: entry.status,
        provider_status: remote?.status ?? null,
      });
    }
  }

  await admin
    .from("billing_reconciliation_runs")
    .update({ outcome: "completed", finished_at: new Date().toISOString(), checked: summary.checked, matched: summary.matched, differences: summary.differences, unreachable: summary.unreachable })
    .eq("id", runId);
  return summary;
}

/** Every provider, one after the other. A provider that is not configured is skipped and says so. */
export async function reconcileAllProviders(admin: SupabaseClient, now: Date = new Date()): Promise<ReconciliationSummary[]> {
  const out: ReconciliationSummary[] = [];
  for (const name of PAYMENT_PROVIDERS) out.push(await reconcileProvider(admin, name, { now }));
  return out;
}
