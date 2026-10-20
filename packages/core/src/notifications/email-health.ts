import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";

/**
 * Stop mailing an address the mail server keeps refusing (story 27-009).
 *
 * One refusal can be a mistyped moment; three in a row, with nothing delivered
 * between them, is an address that does not work. Past that, trying again only
 * costs the platform mailbox its standing with mail providers, so the person's
 * email channel is paused: switched off, with the closed word saying why, so
 * Settings can tell them and they can switch it back on once they have looked
 * at their address. Pausing never touches a notification: the in-app list
 * already has every one.
 */
export const REJECTIONS_BEFORE_PAUSE = 3;

type Attempt = { event_type: string; metadata: { code?: unknown } | null };

/** Whether the most recent email attempts are all refusals, enough of them to pause. */
export function shouldPauseEmail(latestFirst: readonly Attempt[]): boolean {
  const recent = latestFirst.slice(0, REJECTIONS_BEFORE_PAUSE);
  return recent.length === REJECTIONS_BEFORE_PAUSE && recent.every((attempt) => attempt.event_type === "delivery_failed" && attempt.metadata?.code === "rejected");
}

/** Pauses the member's email channel when their last attempts were all refused. Never throws. */
export async function pauseEmailIfRejected(admin: SupabaseClient, memberId: string, now: Date = new Date()): Promise<boolean> {
  try {
    const { data } = await admin
      .from("notification_events")
      .select("event_type, metadata, notifications!inner(recipient_member_id)")
      .eq("channel", "email")
      .in("event_type", ["sent", "delivery_failed"])
      .eq("notifications.recipient_member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(REJECTIONS_BEFORE_PAUSE);
    if (!shouldPauseEmail((data ?? []) as Attempt[])) return false;
    const { error } = await admin
      .from("notification_preferences")
      .update({ enabled: false, paused_reason: "address_rejected", paused_at: now.toISOString() })
      .eq("member_id", memberId)
      .eq("channel", "email");
    return !error;
  } catch (thrown) {
    log.warn("email pause failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    return false;
  }
}

/** The member's own email channel, off, by their own signed link (story 27-009). A paused or never-set channel stays as it is. */
export async function turnEmailOff(admin: SupabaseClient, memberId: string): Promise<boolean> {
  const { error } = await admin.from("notification_preferences").update({ enabled: false }).eq("member_id", memberId).eq("channel", "email");
  return !error;
}
