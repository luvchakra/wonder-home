"use server";

import { revalidatePath } from "next/cache";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { DELIVERY_CHANNELS, type DeliveryChannel } from "@wonderhome/core/notifications/channels";
import { saveChannelPreference } from "@wonderhome/core/notifications/preferences";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * How one member wants to be reached (story 06-008).
 *
 * Unlike the voice settings, this is personal, not household-wide: `notify`
 * only ever touches the caller's own `notification_preferences` row, which
 * RLS already restricts to its owner, so `requireMembership` here is about
 * confirming they belong to the household at all, not about elevated
 * permission.
 */

function isChannel(value: unknown): value is DeliveryChannel {
  return typeof value === "string" && (DELIVERY_CHANNELS as readonly string[]).includes(value);
}

export async function saveChannelPreferenceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const channel = formData.get("channel");
  if (!isChannel(channel)) return { error: "Unknown channel." };

  const householdId = String(formData.get("householdId") ?? "");
  const enabled = formData.get("enabled") === "on";
  const quietFrom = readHour(formData.get("quietFrom"));
  const quietUntil = readHour(formData.get("quietUntil"));
  const targetRaw = String(formData.get("target") ?? "").trim();
  const target = targetRaw === "" ? null : targetRaw;

  if (channel === "whatsapp" && target && !/^\+[1-9]\d{1,14}$/.test(target)) {
    return { error: "Use the full number with a country code, e.g. +15551234567." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    await saveChannelPreference(supabase, {
      householdId,
      memberId: membership.memberId,
      channel,
      enabled,
      quietFrom,
      quietUntil,
      target,
    });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }

  revalidatePath("/settings/notifications");
  return { notice: "Saved." };
}

function readHour(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : null;
}
