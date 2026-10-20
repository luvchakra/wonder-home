import type { SupabaseClient } from "@supabase/supabase-js";

import type { DeliveryChannel } from "./channels";
import type { PushReason } from "./push-gate";

/**
 * A delivery that failed for a reason worth another try is queued again, on the
 * shared job queue (story 27-010).
 *
 * Only a failure the channel itself marked retryable comes here: a mail server
 * or WhatsApp not answering, never a refused address or a channel that is not
 * set up. The queue brings the backoff, the lease and the end: a job is tried
 * at most three times in all, then parked as dead so a broken channel is
 * visible instead of retried forever. At most one retry per notification and
 * channel waits at a time (the dedupe key). The retry itself is in
 * `retry-handler.ts`; this file only queues, so `deliver.ts` can use it.
 */
export const NOTIFICATION_RETRY_KIND = "notification.retry";
export const NOTIFICATION_RETRY_ATTEMPTS = 3;
const FIRST_RETRY_AFTER_SECONDS = 120;

export async function enqueueNotificationRetry(
  admin: SupabaseClient,
  input: { householdId: string; notificationId: string; channel: DeliveryChannel; reason: PushReason; now?: Date },
): Promise<boolean> {
  const runAfter = new Date((input.now ?? new Date()).getTime() + FIRST_RETRY_AFTER_SECONDS * 1000).toISOString();
  const { error } = await admin.from("jobs").insert({
    household_id: input.householdId,
    kind: NOTIFICATION_RETRY_KIND,
    payload: { notificationId: input.notificationId, channel: input.channel, reason: input.reason },
    dedupe_key: `${input.notificationId}:${input.channel}`,
    run_after: runAfter,
    max_attempts: NOTIFICATION_RETRY_ATTEMPTS,
  });
  // Already waiting: the unique dedupe index says so, and that is fine.
  if (error && error.code !== "23505") return false;
  return !error;
}
