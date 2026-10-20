import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChannelAdapter, DeliveryChannel } from "./channels";
import { deliverNotification } from "./deliver";
import { parseCopy } from "./message";

/**
 * An unanswered reminder reaches its person a second way before it reaches
 * anyone else (story 27-007).
 *
 * The policy names the channels to try (`channelEscalation.via`); the first one
 * this person has on, that can reach them and that passes the same gates as
 * any send (mutes, quiet hours, daily ceiling) carries it. It happens once per
 * reminder: the `escalated` event it leaves, whether or not a channel could
 * take it, is the record that the step has been taken. Never to a second
 * person, and it is not another reminder, so the reminder count's ceiling is
 * unchanged (`maxDeliveriesFor`).
 */
export async function escalateAcrossChannels(
  admin: SupabaseClient,
  input: {
    householdId: string;
    row: { id: string; recipient_member_id: string; title: string; body: string; message?: unknown; priority: string };
    category: string;
    via: readonly DeliveryChannel[];
    now: Date;
    adapters?: Record<DeliveryChannel, ChannelAdapter>;
  },
): Promise<DeliveryChannel | null> {
  const { data: done } = await admin.from("notification_events").select("id").eq("notification_id", input.row.id).eq("event_type", "escalated").eq("metadata->>to", "channel").limit(1);
  if (((done ?? []) as unknown[]).length > 0) return null;

  // Claim the step first: a second pass that starts now finds it taken.
  const { error } = await admin.from("notification_events").insert({
    household_id: input.householdId,
    notification_id: input.row.id,
    event_type: "escalated",
    channel: null,
    metadata: { to: "channel" },
  });
  if (error) return null;

  const priority = input.row.priority === "critical" || input.row.priority === "high" || input.row.priority === "low" ? input.row.priority : "normal";
  for (const channel of input.via) {
    const result = await deliverNotification(
      admin,
      {
        householdId: input.householdId,
        notificationId: input.row.id,
        recipientMemberId: input.row.recipient_member_id,
        notification: { title: input.row.title, body: input.row.body, priority },
        copy: parseCopy(input.row.message),
        reason: "reminder",
        category: input.category,
        only: channel,
        now: input.now,
      },
      input.adapters,
    );
    if (result.sent.includes(channel) || result.failed.includes(channel)) {
      await admin.from("notification_events").update({ channel }).eq("notification_id", input.row.id).eq("event_type", "escalated").eq("metadata->>to", "channel");
      return channel;
    }
  }
  return null;
}
