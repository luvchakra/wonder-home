import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClaimedJob, JobHandler } from "../homesend/retry-queue";
import { DELIVERY_CHANNELS, type ChannelAdapter, type DeliveryChannel } from "./channels";
import { deliverNotification } from "./deliver";
import { parseCopy } from "./message";
import { NOTIFICATION_RETRY_KIND } from "./retry";

/**
 * Tries a failed delivery again (story 27-010): the same notification, on the
 * one channel that failed, through the same door and gates as the first try
 * (`deliverNotification`), so quiet hours, mutes and ceilings still apply.
 *
 * - A reminder that has since been settled is not sent: a retry never delivers
 *   what is no longer true.
 * - Sent: the job is done. Failed again: the queue backs off and tries once
 *   more, up to its limit. Held back by a gate (quiet hours, switched off
 *   since): nothing to retry, so the job ends quietly.
 */
export function notificationRetryHandler(adapters?: Record<DeliveryChannel, ChannelAdapter>): JobHandler {
  return async (admin: SupabaseClient, job: ClaimedJob) => {
    const payload = job.payload ?? {};
    const notificationId = typeof payload.notificationId === "string" ? payload.notificationId : null;
    const channel = DELIVERY_CHANNELS.find((candidate) => candidate === payload.channel);
    if (!notificationId || !channel || !job.household_id) return "skipped";

    const { data } = await admin
      .from("notifications")
      .select("id, recipient_member_id, title, body, message, priority, status, category")
      .eq("id", notificationId)
      .eq("household_id", job.household_id)
      .maybeSingle();
    const row = data as { id: string; recipient_member_id: string; title: string; body: string; message: unknown; priority: string; status: string; category: string | null } | null;
    if (!row || !["generated", "delivered", "seen"].includes(row.status)) return "skipped";

    const result = await deliverNotification(
      admin,
      {
        householdId: job.household_id,
        notificationId: row.id,
        recipientMemberId: row.recipient_member_id,
        notification: { title: row.title, body: row.body, priority: row.priority === "critical" || row.priority === "high" || row.priority === "low" ? row.priority : "normal" },
        copy: parseCopy(row.message),
        reason: payload.reason === "reminder" ? "reminder" : "alert",
        category: row.category,
        only: channel,
        retry: true,
      },
      adapters,
    );
    if (result.sent.includes(channel)) return "read";
    return result.failed.includes(channel) ? "failed" : "skipped";
  };
}

/** Every kind of job the notification clock knows how to run, so a drain never claims one it cannot. */
export function notificationJobHandlers(adapters?: Record<DeliveryChannel, ChannelAdapter>): Record<string, JobHandler> {
  return { [NOTIFICATION_RETRY_KIND]: notificationRetryHandler(adapters) };
}
