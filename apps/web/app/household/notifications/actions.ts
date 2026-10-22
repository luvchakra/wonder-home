"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { parseHouseholdNotificationSettings, saveHouseholdNotificationSettings, saveHouseholdQuietHours } from "@wonderhome/core/notifications/household-settings";
import { TUNABLE_CATEGORIES } from "@wonderhome/core/notifications/policies";
import { ROUTABLE_CHANNELS } from "@wonderhome/core/notifications/routing";

const hour = z.number().int().min(0).max(23);
const input = z.object({
  householdId: z.uuid(),
  kindsOff: z.array(z.enum(TUNABLE_CATEGORIES)).max(TUNABLE_CATEGORIES.length),
  defaults: z.record(z.enum(TUNABLE_CATEGORIES), z.string().max(60)),
  channelsOff: z.array(z.enum(ROUTABLE_CHANNELS)).max(ROUTABLE_CHANNELS.length),
  channelStep: z.boolean(),
  backupStep: z.boolean(),
  quiet: z.object({ fromHour: hour, untilHour: hour }).nullable(),
});

/**
 * An Admin's choices for how the whole household is notified (the owner,
 * 2026-10-22). Admins only, checked here and again by `policies`' own RLS.
 * Both rows are versioned and audited by `savePolicy`; the write marks every
 * household reminder due, so the next five-minute tick applies it.
 */
export async function saveHouseholdNotificationsAction(raw: z.input<typeof input>): Promise<{ ok: true } | { error: string }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: "Please try again." };
  const { householdId, quiet, ...settings } = parsed.data;
  if (quiet && quiet.fromHour === quiet.untilHour) return { error: "Quiet hours need two different times." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId);
    await Promise.all([
      saveHouseholdNotificationSettings(supabase, { householdId, actorMemberId: membership.memberId, settings: parseHouseholdNotificationSettings(settings) }),
      saveHouseholdQuietHours(supabase, { householdId, actorMemberId: membership.memberId, quiet }),
    ]);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
  revalidatePath("/household/notifications");
  revalidatePath("/settings/notifications");
  return { ok: true };
}
