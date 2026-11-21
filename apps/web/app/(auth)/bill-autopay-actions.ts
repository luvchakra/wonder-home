"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { setAutopay, undoAutopayRun } from "@wonderhome/core/finance/autopay";
import { isHouseholdAdmin, requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";
import { reconcileRemindersNow } from "../_lib/reminders";

function settle(householdId: string) {
  after(() => reconcileRemindersNow(householdId, { force: true }));
  revalidatePath("/bills");
  revalidatePath("/household/home");
}

/** "Usually paid by autopay" on a bill (11-024), Admins only. WonderHome never pays: it only records the payment on the due date. */
export async function setAutopayAction(input: { householdId: string; obligationId: string; on: boolean }): Promise<{ error?: string }> {
  const parsed = z.object({ householdId: z.uuid(), obligationId: z.uuid(), on: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const admin = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await setAutopay(supabase, { ...parsed.data, memberId: admin.memberId });
    settle(parsed.data.householdId);
    return {};
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

/** Undo a payment the autopay pass recorded: the bill's owner or an Admin. */
export async function undoAutopayAction(input: { householdId: string; runId: string }): Promise<{ error?: string }> {
  const parsed = z.object({ householdId: z.uuid(), runId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await undoAutopayRun(supabase, { ...parsed.data, memberId: membership.memberId, isAdmin: isHouseholdAdmin(membership) });
    settle(parsed.data.householdId);
    return {};
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}
