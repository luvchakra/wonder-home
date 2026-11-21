"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { auditChange } from "@wonderhome/core/api/audit";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { toMinorUnits as toMinor } from "@wonderhome/core/billing/money";
import { createClient } from "@wonderhome/core/db/server";
import { snoozeBillReminders } from "@wonderhome/core/finance/bill-reminders";
import { updateObligation } from "@wonderhome/core/finance/repository";
import { confirmByAction } from "@wonderhome/core/homesend/changes";
import { requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";

import { reconcileRemindersNow } from "../_lib/reminders";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const quickSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("dueOn"), householdId: z.uuid(), obligationId: z.uuid(), dueOn: isoDate }),
  z.object({ field: z.literal("amount"), householdId: z.uuid(), obligationId: z.uuid(), amount: z.number().min(0).max(1_000_000_000).nullable(), currency: z.string().regex(/^[A-Z]{3}$/) }),
  z.object({ field: z.literal("owner"), householdId: z.uuid(), obligationId: z.uuid(), memberId: z.uuid().nullable() }),
]);

/**
 * One field fixed in place on a bill row (11-023): its due date, its amount
 * or who handles it, through the same governed write the editor uses. Who
 * may edit a bill (an Admin) may fix one; reminders follow the change.
 */
export async function quickFixBillAction(input: z.input<typeof quickSchema>): Promise<{ error?: string }> {
  const parsed = quickSchema.safeParse(input);
  if (!parsed.success) return { error: "Please check the value." };
  const data = parsed.data;
  try {
    const supabase = await createClient();
    const admin = await requireHouseholdAdmin(supabase, data.householdId);
    await updateObligation(supabase, {
      id: data.obligationId,
      householdId: data.householdId,
      ...(data.field === "dueOn" ? { dueOn: data.dueOn } : {}),
      ...(data.field === "amount" ? { amountMinor: data.amount === null ? null : toMinor(data.amount, data.currency), currency: data.amount === null ? null : data.currency } : {}),
      ...(data.field === "owner" ? { responsibleMemberId: data.memberId } : {}),
    });
    // Fixing an entry HomeSend added while Checking confirms it, as the editor does.
    await confirmByAction(supabase, data.householdId, data.obligationId, admin.memberId);
    after(() => auditChange({ householdId: data.householdId, actorMemberId: admin.memberId, eventType: "finance.bill_changed", targetTable: "obligations", targetId: data.obligationId, metadata: { change: data.field } }));
    after(() => reconcileRemindersNow(data.householdId, { force: true }));
    revalidatePath("/bills");
    return {};
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

/** "Remind me on…": the viewer's own reminders about this bill wait until that morning. */
export async function snoozeBillAction(input: { householdId: string; obligationId: string; day: string }): Promise<{ error?: string }> {
  const parsed = z.object({ householdId: z.uuid(), obligationId: z.uuid(), day: isoDate }).safeParse(input);
  if (!parsed.success) return { error: "Pick a day." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await snoozeBillReminders(supabase, { ...parsed.data, memberId: membership.memberId, timeZone: membership.household.timezone });
    revalidatePath("/bills");
    revalidatePath("/notifications");
    return {};
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
}
