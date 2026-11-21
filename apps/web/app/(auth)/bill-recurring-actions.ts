"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { auditChange } from "@wonderhome/core/api/audit";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { endBillSeries, restoreBillSeries, skipBillPeriod, undoSkip, type SkippedBill } from "@wonderhome/core/finance/recurring";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { reconcileRemindersNow } from "../_lib/reminders";

const ids = z.object({ householdId: z.uuid(), obligationId: z.uuid() });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function settle(householdId: string) {
  // The skipped month's reminder stops now rather than at the next reconcile.
  after(() => reconcileRemindersNow(householdId, { force: true }));
  revalidatePath("/bills");
  revalidatePath("/household/home");
}

/** "Skip {month}" on a recurring bill (11-022): nothing paid, the bill moves to its next month. */
export async function skipBillMonthAction(input: { householdId: string; obligationId: string }): Promise<{ error?: string; skipped?: SkippedBill }> {
  const parsed = ids.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const admin = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const skipped = await skipBillPeriod(supabase, { ...parsed.data, memberId: admin.memberId });
    after(() => auditChange({ householdId: parsed.data.householdId, actorMemberId: admin.memberId, eventType: "finance.bill_changed", targetTable: "obligations", targetId: parsed.data.obligationId, metadata: { change: "skipped", period: skipped.periodLabel } }));
    settle(parsed.data.householdId);
    return { skipped };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

export async function undoSkipAction(input: { householdId: string; obligationId: string; skipped: SkippedBill }): Promise<{ error?: string }> {
  const parsed = ids
    .extend({
      skipped: z.object({
        periodLabel: z.string().regex(MONTH),
        nextDueOn: isoDate,
        previous: z.object({ dueOn: isoDate, status: z.enum(["expected", "received", "scheduled", "overdue"]), amountMinor: z.number().int().nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable() }),
      }),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await undoSkip(supabase, parsed.data);
    settle(parsed.data.householdId);
    return {};
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

/** "End after this one": the bill stops repeating once its current month is paid. */
export async function endBillSeriesAction(input: { householdId: string; obligationId: string }): Promise<{ error?: string; recurrence?: string }> {
  const parsed = ids.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const admin = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const ended = await endBillSeries(supabase, parsed.data);
    after(() => auditChange({ householdId: parsed.data.householdId, actorMemberId: admin.memberId, eventType: "finance.bill_changed", targetTable: "obligations", targetId: parsed.data.obligationId, metadata: { change: "ended" } }));
    settle(parsed.data.householdId);
    return { recurrence: ended.recurrence };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

export async function restoreBillSeriesAction(input: { householdId: string; obligationId: string; recurrence: string }): Promise<{ error?: string }> {
  const parsed = ids.extend({ recurrence: z.enum(["monthly", "quarterly", "yearly"]) }).safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await restoreBillSeries(supabase, parsed.data);
    settle(parsed.data.householdId);
    return {};
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}
