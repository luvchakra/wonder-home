"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { markObligationPaid } from "@wonderhome/core/finance/repository";
import { markPetCareDone } from "@wonderhome/core/home/repository";
import { requireMembership } from "@wonderhome/core/identity/households";
import {
  SNOOZE_PRESETS,
  dismissNotification,
  snoozeNotification,
  snoozeUntil,
  validSnoozeTime,
} from "@wonderhome/core/notifications/actions";
import { atLocal, localMoment } from "@wonderhome/core/notifications/timing";
import { completeSchoolItem } from "@wonderhome/core/school/repository";

import { reconcileRemindersNow } from "../_lib/reminders";
import type { ActionState } from "./actions";

/**
 * What a person does with a reminder (module 23).
 *
 * Two kinds of thing, kept apart on purpose:
 *   * the reminder itself — snooze it, dismiss it, mark it seen — through
 *     the person's own session, where the recipient guard lets them change
 *     its state and never its content;
 *   * the thing it is about — pay the bill, hand in the project, give the
 *     medicine — through that domain's own service, exactly as its own
 *     screen would. The reminder then resolves because its source no longer
 *     needs anyone; nothing here writes a domain table on a reminder's say-so.
 */

const idSchema = z.object({ notificationId: z.uuid(), householdId: z.uuid() });

export async function dismissReminderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ notificationId: formData.get("notificationId"), householdId: formData.get("householdId") });
  if (!parsed.success) return { error: "That reminder could not be found." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await dismissNotification(supabase, parsed.data.notificationId);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
  revalidateReminders();
  // The row leaves the list, so the page says what happened.
  redirect("/notifications?done=dismissed");
}

const snoozeSchema = idSchema.extend({
  preset: z.enum([...SNOOZE_PRESETS, "custom"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export async function snoozeReminderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = snoozeSchema.safeParse({
    notificationId: formData.get("notificationId"),
    householdId: formData.get("householdId"),
    preset: formData.get("preset"),
    date: formData.get("date") || undefined,
    time: formData.get("time") || undefined,
  });
  if (!parsed.success) return { error: "Pick when to be reminded." };

  let until: Date;
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const timeZone = membership.household.timezone;
    const now = new Date();
    if (parsed.data.preset === "custom") {
      if (!parsed.data.date || !parsed.data.time) return { error: "Pick a day and a time." };
      const [hour, minute] = parsed.data.time.split(":").map(Number) as [number, number];
      until = atLocal(parsed.data.date, hour * 60 + minute, timeZone);
      if (!validSnoozeTime(until, now)) return { error: "Pick a time later than now and within the next month." };
    } else {
      until = snoozeUntil(parsed.data.preset, now, timeZone);
    }
    await snoozeNotification(supabase, parsed.data.notificationId, until, now);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
  revalidateReminders();
  // The row moves to Upcoming, so the page says when it comes back.
  redirect(`/notifications?done=snoozed&until=${encodeURIComponent(until.toISOString())}`);
}

/**
 * The one action on the thing itself, chosen by what the reminder is about.
 * The reminder is read through the person's own session, so only their own
 * reminder can start this, and the domain service then applies that
 * domain's own permissions (only an Admin marks a bill paid).
 */
export async function completeReminderSourceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ notificationId: formData.get("notificationId"), householdId: formData.get("householdId") });
  if (!parsed.success) return { error: "That reminder could not be found." };

  let target: string;
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const { data } = await supabase
      .from("notifications")
      .select("source_type, source_id, decision_factors")
      .eq("id", parsed.data.notificationId)
      .maybeSingle();
    const row = data as { source_type: string | null; source_id: string | null; decision_factors: { items?: unknown } | null } | null;
    if (!row?.source_id) return { error: "There is nothing to mark done for this one." };
    const today = localMoment(new Date(), membership.household.timezone).dateKey;

    // The row disappears once its source is done, so the confirmation is the
    // page's, carried as a closed code rather than free text in the address.
    let done: string;
    switch (row.source_type) {
      case "obligation": {
        const { nextDueOn } = await markObligationPaid(supabase, { householdId: parsed.data.householdId, obligationId: row.source_id, paidOn: today });
        done = nextDueOn ? `paid&next=${nextDueOn}` : "paid";
        break;
      }
      case "school_item":
        await completeSchoolItem(supabase, row.source_id);
        done = "done";
        break;
      case "school_day": {
        // A child's day, grouped: each thing in it is marked done on its own,
        // through the same service the Kids & School screen uses.
        const items = Array.isArray(row.decision_factors?.items) ? row.decision_factors.items.filter((id): id is string => typeof id === "string" && z.uuid().safeParse(id).success) : [];
        if (items.length === 0) return { error: "There is nothing to mark done for this one." };
        for (const id of items) await completeSchoolItem(supabase, id);
        done = "done_all";
        break;
      }
      case "pet_care_need":
        await markPetCareDone(supabase, { householdId: parsed.data.householdId, needId: row.source_id, doneOn: today });
        done = "done";
        break;
      default:
        return { error: "There is nothing to mark done for this one." };
    }

    // Done from the reminder itself: that is when this person acts on this
    // kind of thing, the only evidence learned timing (23-012) ever uses.
    await supabase.from("notifications").update({ status: "acted" }).eq("id", parsed.data.notificationId).in("status", ["generated", "delivered", "seen"]);

    // The reminder resolves because its source changed — right away, not at the next pass.
    await reconcileRemindersNow(parsed.data.householdId, { force: true });
    revalidateReminders();
    revalidatePath("/bills");
    revalidatePath("/school");
    revalidatePath("/household/home");
    target = `/notifications?done=${done}`;
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
  redirect(target);
}

function revalidateReminders(): void {
  revalidatePath("/notifications");
  revalidatePath("/");
}
