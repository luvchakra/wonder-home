import type { SupabaseClient } from "@supabase/supabase-js";

import type { NotificationDecision } from "./decide";

/**
 * Turning a decision into a row (stories 06-001 through 06-007).
 *
 * `decideNotification` has always been pure — whether, whom, when, what
 * they can do — and nothing ever carried its answer into `notifications`.
 * This is that bridge, and the only one: a household member can never
 * insert their own notification (there is no INSERT policy for
 * `authenticated`), so this takes a service-role client and does the one
 * household-boundary check RLS would otherwise have done.
 *
 * One open thread per recipient is a real constraint on the table
 * (`notifications_one_open_per_thread`), and Postgres cannot target a
 * partial unique index through PostgREST's upsert, so this reads first and
 * updates the existing open row when `decision.updatesExistingThread` says
 * there is one, rather than trying to insert a duplicate.
 */

export type NotifyInput = {
  householdId: string;
  decision: Extract<NotificationDecision, { kind: "notify" }>;
  title: string;
  body: string;
};

export async function createNotification(
  admin: SupabaseClient,
  input: NotifyInput,
): Promise<{ id: string } | null> {
  const { householdId, decision, title, body } = input;

  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("household_id", householdId)
    .eq("recipient_member_id", decision.recipientMemberId)
    .eq("thread_key", decision.threadKey)
    .in("status", ["generated", "delivered", "seen"])
    .maybeSingle();

  const row = {
    household_id: householdId,
    recipient_member_id: decision.recipientMemberId,
    type: decision.type,
    thread_key: decision.threadKey,
    title: title.slice(0, 160),
    body: body.slice(0, 500),
    action: decision.action,
    decision_factors: decision.factors,
    scheduled_for: decision.deliverAt.toISOString(),
  };

  if (existing) {
    const { error } = await admin.from("notifications").update(row).eq("id", existing.id);
    if (error) return null;
    return { id: existing.id as string };
  }

  const { data, error } = await admin.from("notifications").insert(row).select("id").single();
  if (error) return null;
  return { id: (data as { id: string }).id };
}
