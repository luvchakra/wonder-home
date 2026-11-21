import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { auditChange } from "../api/audit";
import { localMoment } from "../notifications/timing";
import { markObligationPaid, undoBillPayment, type PaidBill } from "./repository";

/**
 * "Usually paid by autopay" (11-024, the owner, 2026-11-21).
 *
 * An Admin marks a bill the bank or card pays on its own. On its due date,
 * once its amount is known, the daily pass records it as paid through the
 * governed `markObligationPaid` a person's "Mark paid" uses, paid by the
 * bill's owner, kept as a run that is Checking until a payment message
 * confirms it, with one-tap Undo. One run per bill and month, so a period is
 * never marked twice. WonderHome never pays anything: this only writes down
 * what the household's autopay does.
 *
 *   - a bill with no amount yet waits until one is known (never a guess);
 *   - a skipped month is never marked;
 *   - a payment message that agrees confirms the run; one that disagrees
 *     flags it and never changes the payment (`homesend/payment-apply.ts`).
 */

type Row = Record<string, unknown>;

const OPEN = new Set(["expected", "received", "scheduled", "overdue"]);
const missingTable = (code: string | undefined) => code === "42P01" || code === "PGRST205";

// ── Choosing what is due ──────────────────────────────────────────────────

export type AutopayBill = {
  id: string;
  name: string;
  status: string;
  dueOn: string | null;
  amountMinor: number | null;
  currency: string | null;
  ownerMemberId: string | null;
};

/** Autopay bills whose day has come, with an amount, not skipped, not already marked this month. */
export function dueAutopay(
  bills: readonly AutopayBill[],
  today: string,
  autopay: ReadonlySet<string>,
  done: ReadonlySet<string>,
  skips: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): AutopayBill[] {
  return bills.filter((bill) => {
    if (!autopay.has(bill.id) || !OPEN.has(bill.status) || !bill.dueOn || bill.dueOn > today) return false;
    if (bill.amountMinor === null || !(bill.amountMinor > 0) || !bill.currency) return false;
    const period = bill.dueOn.slice(0, 7);
    if (skips.get(bill.id)?.has(period)) return false;
    return !done.has(`${bill.id}|${period}`);
  });
}

// ── The switch ────────────────────────────────────────────────────────────

/** Bills on autopay. None before the 11-024 migration. */
export async function listAutopay(supabase: SupabaseClient, householdId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("obligation_autopay").select("obligation_id").eq("household_id", householdId).limit(500);
  if (error) return new Set();
  return new Set(((data ?? []) as { obligation_id: string }[]).map((row) => row.obligation_id));
}

/** An Admin turns autopay on or off for a bill (RLS: Admins only). */
export async function setAutopay(
  supabase: SupabaseClient,
  input: { householdId: string; obligationId: string; on: boolean; memberId: string },
): Promise<void> {
  const { data: bill, error: billError } = await supabase.from("obligations").select("id").eq("household_id", input.householdId).eq("id", input.obligationId).maybeSingle();
  if (billError) throw new Error(`setAutopay failed: ${billError.code ?? "unknown"}`);
  if (!bill) throw ApiError.notFound("That bill is no longer here.");
  const { error } = input.on
    ? await supabase.from("obligation_autopay").upsert({ obligation_id: input.obligationId, household_id: input.householdId, enabled_by_member_id: input.memberId }, { onConflict: "obligation_id" })
    : await supabase.from("obligation_autopay").delete().eq("household_id", input.householdId).eq("obligation_id", input.obligationId);
  if (error) {
    if (missingTable(error.code)) throw ApiError.badRequest("Autopay isn't switched on yet.");
    throw new Error(`setAutopay failed: ${error.code ?? "unknown"}`);
  }
  await auditChange({ householdId: input.householdId, actorMemberId: input.memberId, eventType: "finance.bill_changed", targetTable: "obligations", targetId: input.obligationId, metadata: { autopay: input.on } });
}

// ── Runs ──────────────────────────────────────────────────────────────────

export type AutopayRun = {
  id: string;
  obligationId: string;
  periodLabel: string;
  dueOn: string;
  amountMinor: number;
  currency: string;
  ownerMemberId: string | null;
  state: "checking" | "confirmed" | "flagged" | "undone";
  paid: PaidBill | null;
  createdAt: string;
};

const RUN_COLUMNS = "id, obligation_id, period_label, due_on, amount_minor, currency, owner_member_id, state, paid, created_at";

function runFromRow(row: Row): AutopayRun {
  return {
    id: row.id as string,
    obligationId: row.obligation_id as string,
    periodLabel: row.period_label as string,
    dueOn: row.due_on as string,
    amountMinor: Number(row.amount_minor),
    currency: row.currency as string,
    ownerMemberId: (row.owner_member_id as string | null) ?? null,
    state: row.state as AutopayRun["state"],
    paid: row.paid && typeof row.paid === "object" && "periodLabel" in (row.paid as object) ? (row.paid as PaidBill) : null,
    createdAt: row.created_at as string,
  };
}

/** Recent runs (the last 60 days), newest first. None before the migration. */
export async function listAutopayRuns(supabase: SupabaseClient, householdId: string, now: Date = new Date()): Promise<AutopayRun[]> {
  const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const { data, error } = await supabase.from("obligation_autopay_runs").select(RUN_COLUMNS).eq("household_id", householdId).gte("created_at", since).order("created_at", { ascending: false }).limit(300);
  if (error) return [];
  return ((data ?? []) as Row[]).map(runFromRow);
}

/**
 * The daily pass for one household (service role). Each due bill is claimed
 * first (the unique bill-and-month row), then marked paid; a failed mark
 * removes the claim so the next pass tries again.
 */
export async function applyAutopay(admin: SupabaseClient, householdId: string, now: Date): Promise<{ marked: number; failed: number }> {
  const autopay = await listAutopay(admin, householdId);
  if (autopay.size === 0) return { marked: 0, failed: 0 };
  const ids = [...autopay];
  const [{ data: household }, { data: bills, error }, { data: runs }, { data: skipRows }] = await Promise.all([
    admin.from("households").select("timezone").eq("id", householdId).maybeSingle(),
    admin.from("obligations").select("id, name, status, due_on, amount_minor, currency, responsible_member_id").eq("household_id", householdId).in("id", ids).limit(500),
    admin.from("obligation_autopay_runs").select("obligation_id, period_label").eq("household_id", householdId).in("obligation_id", ids).limit(2000),
    admin.from("obligation_skips").select("obligation_id, period_label").eq("household_id", householdId).in("obligation_id", ids).limit(2000),
  ]);
  if (error) throw new Error(`applyAutopay read failed: ${error.code ?? "unknown"}`);
  const today = localMoment(now, ((household?.timezone as string | null) || "UTC") as string).dateKey;
  const done = new Set(((runs ?? []) as Row[]).map((row) => `${row.obligation_id as string}|${row.period_label as string}`));
  const skips = new Map<string, Set<string>>();
  for (const row of (skipRows ?? []) as Row[]) {
    const set = skips.get(row.obligation_id as string) ?? new Set<string>();
    set.add(row.period_label as string);
    skips.set(row.obligation_id as string, set);
  }
  const due = dueAutopay(
    ((bills ?? []) as Row[]).map((row) => ({
      id: row.id as string,
      name: (row.name as string | null) ?? "",
      status: row.status as string,
      dueOn: (row.due_on as string | null) ?? null,
      amountMinor: row.amount_minor === null || row.amount_minor === undefined ? null : Number(row.amount_minor),
      currency: (row.currency as string | null) ?? null,
      ownerMemberId: (row.responsible_member_id as string | null) ?? null,
    })),
    today,
    autopay,
    done,
    skips,
  );

  let marked = 0;
  let failed = 0;
  for (const bill of due) {
    const periodLabel = bill.dueOn!.slice(0, 7);
    const { data: claim, error: claimError } = await admin
      .from("obligation_autopay_runs")
      .insert({ household_id: householdId, obligation_id: bill.id, period_label: periodLabel, due_on: bill.dueOn, amount_minor: bill.amountMinor, currency: bill.currency, owner_member_id: bill.ownerMemberId })
      .select("id")
      .maybeSingle();
    // Already claimed (another pass got there first): nothing to do.
    if (claimError || !claim) {
      if (claimError && claimError.code !== "23505") failed += 1;
      continue;
    }
    try {
      const paid = await markObligationPaid(admin, { householdId, obligationId: bill.id, paidOn: bill.dueOn!, amountMinor: bill.amountMinor, currency: bill.currency, paidByMemberId: bill.ownerMemberId });
      await admin.from("obligation_autopay_runs").update({ paid }).eq("id", (claim as Row).id as string);
      await auditChange({ householdId, eventType: "finance.autopay_recorded", targetTable: "obligations", targetId: bill.id, metadata: { periodLabel, state: "checking" } });
      marked += 1;
    } catch {
      await admin.from("obligation_autopay_runs").delete().eq("id", (claim as Row).id as string);
      failed += 1;
    }
  }
  return { marked, failed };
}

/** Every household with a bill on autopay, for the daily pass. */
export async function autopayHouseholds(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.from("obligation_autopay").select("household_id").limit(5000);
  if (error) return [];
  return [...new Set(((data ?? []) as { household_id: string }[]).map((row) => row.household_id))];
}

/** The daily pass across households: one failing never stops the next. */
export async function runAutopay(admin: SupabaseClient, now: Date = new Date()): Promise<{ households: number; marked: number; failed: number }> {
  const households = await autopayHouseholds(admin);
  let marked = 0;
  let failed = 0;
  for (const householdId of households) {
    try {
      const result = await applyAutopay(admin, householdId, now);
      marked += result.marked;
      failed += result.failed;
    } catch {
      failed += 1;
    }
  }
  return { households: households.length, marked, failed };
}

/**
 * Undo (the person's own client): the bill goes back as it was before the
 * run, and the run is kept as undone so the month is never marked again.
 */
export async function undoAutopayRun(supabase: SupabaseClient, input: { householdId: string; runId: string; memberId: string; isAdmin?: boolean }): Promise<void> {
  const { data, error } = await supabase.from("obligation_autopay_runs").select(RUN_COLUMNS).eq("household_id", input.householdId).eq("id", input.runId).maybeSingle();
  if (error) throw new Error(`undoAutopayRun failed: ${error.code ?? "unknown"}`);
  if (!data) throw ApiError.notFound("That payment is no longer here.");
  const run = runFromRow(data as Row);
  // The bill's owner, or an Admin, may undo it.
  if (input.isAdmin === false && run.ownerMemberId !== input.memberId) throw ApiError.forbidden("Only the bill's owner or an Admin can undo this.");
  if (run.state === "undone") return;
  if (run.paid) await undoBillPayment(supabase, { householdId: input.householdId, obligationId: run.obligationId, paid: run.paid });
  const { error: updateError } = await supabase
    .from("obligation_autopay_runs")
    .update({ state: "undone", settled_at: new Date().toISOString(), settled_by_member_id: input.memberId })
    .eq("household_id", input.householdId)
    .eq("id", input.runId);
  if (updateError) throw new Error(`undoAutopayRun failed: ${updateError.code ?? "unknown"}`);
  await auditChange({ householdId: input.householdId, actorMemberId: input.memberId, eventType: "finance.autopay_undone", targetTable: "obligations", targetId: run.obligationId, metadata: { periodLabel: run.periodLabel } });
}

/** A payment message about a run: agreeing confirms it, disagreeing flags it. The payment itself is never changed. */
export async function settleAutopayRun(admin: SupabaseClient, householdId: string, runId: string, agrees: boolean, now: Date): Promise<void> {
  await admin
    .from("obligation_autopay_runs")
    .update({ state: agrees ? "confirmed" : "flagged", settled_at: now.toISOString() })
    .eq("household_id", householdId)
    .eq("id", runId)
    .eq("state", "checking");
}
