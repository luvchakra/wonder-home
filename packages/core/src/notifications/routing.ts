import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { DeliveryChannel } from "./channels";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "./policies";

/**
 * Which channel carries which kind of reminder (story 27-002).
 *
 * Everything is allowed until a person says otherwise, so only the exceptions
 * are kept: one `notification_channel_mutes` row is one kind of reminder kept
 * off one channel. A new kind or a new channel needs no row and no change
 * here. The in-app list is the record and cannot be muted. A critical alert
 * ignores a mute (`deliverNotification`): the one thing a person must not
 * miss is not theirs to route away by accident.
 *
 * Read and written through the caller's own session: the table's policy
 * already confines a member to their own rows.
 */

/** The channels a mute can name: every channel but the in-app list. */
export const ROUTABLE_CHANNELS = ["push", "email", "whatsapp"] as const satisfies readonly DeliveryChannel[];
export type RoutableChannel = (typeof ROUTABLE_CHANNELS)[number];

export type Mute = { category: NotificationCategory; channel: RoutableChannel };

export const muteKey = (category: string, channel: string) => `${category}:${channel}`;

export function isCategory(value: unknown): value is NotificationCategory {
  return typeof value === "string" && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export function isRoutable(value: unknown): value is RoutableChannel {
  return typeof value === "string" && (ROUTABLE_CHANNELS as readonly string[]).includes(value);
}

/** Rows into mutes, dropping anything outside the closed lists. */
export function mutesFrom(rows: readonly { category: unknown; channel: unknown }[] | null): Mute[] {
  return (rows ?? []).flatMap((row) => (isCategory(row.category) && isRoutable(row.channel) ? [{ category: row.category, channel: row.channel }] : []));
}

/** Whether this kind of reminder may use this channel. In-app, and a reminder of no known kind, always may. */
export function channelAllowed(mutes: ReadonlySet<string>, category: string | null | undefined, channel: DeliveryChannel): boolean {
  if (channel === "in_app" || !category) return true;
  return !mutes.has(muteKey(category, channel));
}

export async function loadMutes(supabase: SupabaseClient, memberId: string): Promise<Mute[]> {
  const { data, error } = await supabase.from("notification_channel_mutes").select("category, channel").eq("member_id", memberId);
  if (error) throw new Error(`loadMutes failed: ${error.code ?? "unknown"}`);
  return mutesFrom(data as { category: unknown; channel: unknown }[] | null);
}

/** Allow (`allowed: true`) or keep off (`false`) one kind of reminder on one channel, for the signed-in member. */
export async function setRoute(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; category: string; channel: string; allowed: boolean },
): Promise<void> {
  if (!isCategory(input.category)) throw ApiError.badRequest("Choose a kind of reminder from the list.");
  if (!isRoutable(input.channel)) throw ApiError.badRequest("Choose push, email or WhatsApp.");
  if (input.allowed) {
    const { error } = await supabase.from("notification_channel_mutes").delete().eq("member_id", input.memberId).eq("category", input.category).eq("channel", input.channel);
    if (error) throw new Error(`setRoute failed: ${error.code ?? "unknown"}`);
    return;
  }
  const { error } = await supabase
    .from("notification_channel_mutes")
    .insert({ household_id: input.householdId, member_id: input.memberId, category: input.category, channel: input.channel });
  // Already kept off is the answer asked for.
  if (error && error.code !== "23505") throw new Error(`setRoute failed: ${error.code ?? "unknown"}`);
}
