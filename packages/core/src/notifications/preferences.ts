import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { DELIVERY_CHANNELS, type ChannelPreference, type DeliveryChannel } from "./channels";

/**
 * A member's own delivery preferences (story 06-008).
 *
 * Read and written through the caller's session, never the admin client:
 * `notification_preferences_write_own` already restricts a write to the
 * caller's own member row, so there is nothing this layer needs to enforce
 * beyond what RLS already does — unlike the voice settings, which are one
 * household-wide row an Admin controls, this is personal, and everyone here
 * is already only ever touching their own.
 */

type Row = { channel: string; enabled: boolean; quiet_from: number | null; quiet_until: number | null; target: string | null };

const DEFAULT_PREFERENCE = (channel: DeliveryChannel): ChannelPreference => ({
  channel,
  enabled: channel === "in_app",
  quietFrom: null,
  quietUntil: null,
  target: null,
});

/** Every channel, defaulted for whichever the member has never set. */
export async function loadChannelPreferences(
  supabase: SupabaseClient,
  memberId: string,
): Promise<ChannelPreference[]> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("channel, enabled, quiet_from, quiet_until, target")
    .eq("member_id", memberId);

  const byChannel = new Map<string, ChannelPreference>();
  if (!error && data) {
    for (const row of data as Row[]) {
      byChannel.set(row.channel, {
        channel: row.channel as DeliveryChannel,
        enabled: row.enabled,
        quietFrom: row.quiet_from,
        quietUntil: row.quiet_until,
        target: row.target,
      });
    }
  }

  return DELIVERY_CHANNELS.map((channel) => byChannel.get(channel) ?? DEFAULT_PREFERENCE(channel));
}

export type SaveChannelPreferenceInput = {
  householdId: string;
  memberId: string;
  channel: DeliveryChannel;
  enabled: boolean;
  quietFrom: number | null;
  quietUntil: number | null;
  target: string | null;
};

export async function saveChannelPreference(
  supabase: SupabaseClient,
  input: SaveChannelPreferenceInput,
): Promise<void> {
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      household_id: input.householdId,
      member_id: input.memberId,
      channel: input.channel,
      enabled: input.enabled,
      quiet_from: input.quietFrom,
      quiet_until: input.quietUntil,
      target: input.target,
    },
    { onConflict: "member_id,channel" },
  );

  if (error) {
    if (error.code === "23514") {
      throw ApiError.badRequest("That does not look like a WhatsApp number — use the country code, e.g. +15551234567.");
    }
    throw new Error(`saveChannelPreference failed: ${error.code ?? "unknown"}`);
  }
}
