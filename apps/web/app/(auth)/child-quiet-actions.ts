"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { isHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/** "22:30" → hour 22, minute 30; anything else is no time at all. */
function readClock(raw: FormDataEntryValue | null): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(String(raw ?? ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/**
 * A child's quiet hours, set by a guardian (story 27-015). An Admin or one of
 * the child's own guardians may; nobody else. Until one is set, the child has
 * their age's default (`child-quiet.ts`); "use the age default" clears it.
 *
 * The write goes through the service role because a child's own preference row
 * is theirs under the table's policy, and a guardian is not them: the check
 * above is what stands in for it, and it only ever touches the in-app row's
 * quiet window, for a member who is a child of this household.
 */
export async function saveChildQuietHoursAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ householdId: z.uuid(), childId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  const useDefault = formData.get("useDefault") === "on";
  const from = readClock(formData.get("quietFrom"));
  const until = readClock(formData.get("quietUntil"));
  if (!useDefault && (!from || !until)) return { error: "Pick when quiet hours start and end." };
  if (!useDefault && from && until && from.hour === until.hour && from.minute === until.minute) return { error: "Quiet hours need to start and end at different times." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const admin = createAdminClient();
    const { data: child } = await admin.from("household_members").select("id, member_type").eq("id", parsed.data.childId).eq("household_id", parsed.data.householdId).maybeSingle();
    if ((child as { member_type?: string } | null)?.member_type !== "child") return { error: "Quiet hours by age are for children." };
    if (!isHouseholdAdmin(membership)) {
      const { data: guardian } = await admin.from("member_guardians").select("child_member_id").eq("household_id", parsed.data.householdId).eq("child_member_id", parsed.data.childId).eq("guardian_member_id", membership.memberId).maybeSingle();
      if (!guardian) return { error: "Only an Admin or this child's guardian can change their quiet hours." };
    }
    const { error } = await admin.from("notification_preferences").upsert(
      {
        household_id: parsed.data.householdId,
        member_id: parsed.data.childId,
        channel: "in_app",
        quiet_from: useDefault ? null : from!.hour,
        quiet_until: useDefault ? null : until!.hour,
        quiet_from_minute: useDefault ? 0 : from!.minute,
        quiet_until_minute: useDefault ? 0 : until!.minute,
      },
      { onConflict: "member_id,channel" },
    );
    if (error) throw new Error(`child quiet hours failed: ${error.code ?? "unknown"}`);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
  revalidatePath("/family");
  return { notice: useDefault ? "default" : "saved" };
}
