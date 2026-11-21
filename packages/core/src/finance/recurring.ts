import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import { nextOpenDueDate } from "./periods";

/**
 * Recurring bills done properly (11-022, the owner 2026-11-21): how a bill
 * repeats, said in words; skip a month nobody pays; end the series after the
 * current one. Nothing is paid and nothing is invented: a skip records only
 * that the month was skipped, and the bill moves on as marking it paid would.
 */

type Row = Record<string, unknown>;

export type Repeat = { every: "month" | "quarter" | "year"; day: number; dueOn: string } | null;

/** "Repeats every month, on day 5" — the parts; the words are the reader's. */
export function repeatOf(recurrence: string | null | undefined, dueOn: string | null): Repeat {
  if (!dueOn) return null;
  const every = recurrence === "monthly" ? "month" : recurrence === "quarterly" ? "quarter" : recurrence === "yearly" ? "year" : null;
  if (!every) return null;
  return { every, day: Number(dueOn.slice(8, 10)), dueOn };
}

const OPEN = ["expected", "received", "scheduled", "overdue"];
const missingTable = (code: string | undefined) => code === "42P01" || code === "PGRST205";

/** Every skipped month, by bill. None before the 11-022 migration. */
export async function listSkips(supabase: SupabaseClient, householdId: string): Promise<Map<string, Set<string>>> {
  const skips = new Map<string, Set<string>>();
  const { data, error } = await supabase.from("obligation_skips").select("obligation_id, period_label").eq("household_id", householdId).limit(500);
  if (error) return skips;
  for (const row of (data ?? []) as Row[]) {
    const set = skips.get(row.obligation_id as string) ?? new Set<string>();
    set.add(row.period_label as string);
    skips.set(row.obligation_id as string, set);
  }
  return skips;
}

export type SkippedBill = { periodLabel: string; nextDueOn: string; previous: { dueOn: string; status: string; amountMinor: number | null; currency: string | null } };

async function skipBillPeriodImpl(supabase: SupabaseClient, input: { householdId: string; obligationId: string; memberId: string }): Promise<SkippedBill> {
  const { data, error } = await supabase
    .from("obligations")
    .select("id, status, due_on, recurrence, amount_minor, currency")
    .eq("id", input.obligationId)
    .eq("household_id", input.householdId)
    .maybeSingle();
  if (error) throw new Error(`skipBillPeriod failed: ${error.code ?? "unknown"}`);
  if (!data) throw ApiError.notFound("That bill is no longer here.");
  const bill = data as Row;
  const dueOn = (bill.due_on as string | null) ?? null;
  const recurrence = (bill.recurrence as string | null) ?? null;
  if (!dueOn || !repeatOf(recurrence, dueOn)) throw ApiError.badRequest("Only a bill that repeats can skip a month.");
  if (!OPEN.includes(bill.status as string)) throw ApiError.badRequest("That bill is already settled.");
  const periodLabel = dueOn.slice(0, 7);

  const [{ data: paidRows }, { data: skipRows }, { data: givenRows }] = await Promise.all([
    supabase.from("obligation_history").select("*").eq("obligation_id", input.obligationId).gte("period_label", periodLabel).limit(40),
    supabase.from("obligation_skips").select("period_label").eq("obligation_id", input.obligationId).gte("period_label", periodLabel).limit(40),
    supabase.from("obligation_periods").select("period_label, amount_minor, currency").eq("obligation_id", input.obligationId).limit(40),
  ]);
  const closed = new Set<string>([periodLabel]);
  for (const row of (paidRows ?? []) as Row[]) if (!(row.due_minor !== null && row.due_minor !== undefined && Number(row.due_minor) > Number(row.amount_minor))) closed.add(row.period_label as string);
  for (const row of (skipRows ?? []) as Row[]) closed.add(row.period_label as string);
  const nextDueOn = nextOpenDueDate(dueOn, recurrence, closed);
  if (!nextDueOn) throw ApiError.badRequest("That bill has no next month to move to.");

  const { error: skipError } = await supabase.from("obligation_skips").insert({ household_id: input.householdId, obligation_id: input.obligationId, period_label: periodLabel, skipped_by_member_id: input.memberId });
  if (skipError) {
    if (missingTable(skipError.code)) throw ApiError.badRequest("Skipping a month isn't switched on yet.");
    if (skipError.code === "23505") throw ApiError.badRequest("That month is already skipped.");
    if (skipError.code === "42501") throw ApiError.forbidden("Only a household administrator can skip a month.");
    throw new Error(`skipBillPeriod failed: ${skipError.code ?? "unknown"}`);
  }
  // The next month's amount is what someone gave for it, else not in yet — as when it is marked paid.
  const given = ((givenRows ?? []) as Row[]).find((row) => row.period_label === nextDueOn.slice(0, 7));
  const { error: updateError } = await supabase
    .from("obligations")
    .update({ due_on: nextDueOn, status: "expected", amount_minor: given ? Number(given.amount_minor) : null, currency: given ? (given.currency as string) : null })
    .eq("id", input.obligationId)
    .eq("household_id", input.householdId);
  if (updateError) {
    await supabase.from("obligation_skips").delete().eq("obligation_id", input.obligationId).eq("period_label", periodLabel);
    throw new Error(`skipBillPeriod failed: ${updateError.code ?? "unknown"}`);
  }
  return {
    periodLabel,
    nextDueOn,
    previous: { dueOn, status: bill.status as string, amountMinor: bill.amount_minor === null ? null : Number(bill.amount_minor), currency: (bill.currency as string | null) ?? null },
  };
}

/** Takes a skip back: the month is open again and the bill is where it was. */
async function undoSkipImpl(supabase: SupabaseClient, input: { householdId: string; obligationId: string; skipped: SkippedBill }): Promise<void> {
  await supabase.from("obligation_skips").delete().eq("household_id", input.householdId).eq("obligation_id", input.obligationId).eq("period_label", input.skipped.periodLabel);
  const previous = input.skipped.previous;
  const { error } = await supabase
    .from("obligations")
    .update({ due_on: previous.dueOn, status: previous.status, amount_minor: previous.amountMinor, currency: previous.currency })
    .eq("id", input.obligationId)
    .eq("household_id", input.householdId);
  if (error) throw new Error(`undoSkip failed: ${error.code ?? "unknown"}`);
}

/**
 * "End after this one": the bill stops repeating. Its current period stays
 * due; once marked paid it is settled rather than moving on. Returns how it
 * repeated, so Undo puts it back.
 */
async function endBillSeriesImpl(supabase: SupabaseClient, input: { householdId: string; obligationId: string }): Promise<{ recurrence: string }> {
  const { data, error } = await supabase.from("obligations").select("recurrence").eq("id", input.obligationId).eq("household_id", input.householdId).maybeSingle();
  if (error) throw new Error(`endBillSeries failed: ${error.code ?? "unknown"}`);
  if (!data) throw ApiError.notFound("That bill is no longer here.");
  const recurrence = ((data as Row).recurrence as string | null) ?? null;
  if (!recurrence || recurrence === "one_off") throw ApiError.badRequest("That bill doesn't repeat.");
  const { error: updateError } = await supabase.from("obligations").update({ recurrence: "one_off" }).eq("id", input.obligationId).eq("household_id", input.householdId);
  if (updateError) {
    if (updateError.code === "42501") throw ApiError.forbidden("Only a household administrator can change a bill.");
    throw new Error(`endBillSeries failed: ${updateError.code ?? "unknown"}`);
  }
  return { recurrence };
}

async function restoreBillSeriesImpl(supabase: SupabaseClient, input: { householdId: string; obligationId: string; recurrence: "monthly" | "quarterly" | "yearly" }): Promise<void> {
  const { error } = await supabase.from("obligations").update({ recurrence: input.recurrence }).eq("id", input.obligationId).eq("household_id", input.householdId);
  if (error) throw new Error(`restoreBillSeries failed: ${error.code ?? "unknown"}`);
}

export const skipBillPeriod = invalidatesContext(skipBillPeriodImpl, (_supabase, input) => input.householdId);
export const undoSkip = invalidatesContext(undoSkipImpl, (_supabase, input) => input.householdId);
export const endBillSeries = invalidatesContext(endBillSeriesImpl, (_supabase, input) => input.householdId);
export const restoreBillSeries = invalidatesContext(restoreBillSeriesImpl, (_supabase, input) => input.householdId);
