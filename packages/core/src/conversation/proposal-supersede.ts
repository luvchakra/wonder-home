import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";

/**
 * A newer proposal for the same thing replaces the older one (owner,
 * 2026-11-22).
 *
 * Live on 22 Nov, "Move morning walk to 5:50 am" and, 35 seconds later,
 * "Move morning walk to 5:20 am" were both left waiting for a yes, side by
 * side on "Needs you". The person changed their mind; only the newest is
 * still meant. So when a proposal is written down, any older one still
 * waiting in the same household for the same action on the same entity (the
 * same field: the time something moves to, who owns a responsibility) is
 * closed as superseded: `expired` with `result.reason = "superseded"` and the
 * id that replaced it. Never done, never approved — closed the way "no"
 * would close it, compare-and-swap on the status so an answer in the same
 * moment wins.
 *
 * Only one-field edits are superseded. Two payments, two orders or two
 * calendar entries can both be meant, so they never replace each other; and
 * a child's request waiting on a grown-up (a referral) is the grown-up's to
 * decide, so it is never closed by someone else's newer proposal.
 */
export const SUPERSEDABLE: ReadonlySet<string> = new Set(["adjust_schedule", "assign_responsibility"]);

export type SupersedeCandidate = {
  id: string;
  action_type: string;
  outcome_key: string | null;
  payload: Record<string, unknown> | null;
};

function key(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function isReferral(payload: Record<string, unknown> | null | undefined): boolean {
  return Boolean(payload && typeof payload.referral === "object" && payload.referral);
}

/** Which waiting proposals the new one replaces. Pure. */
export function supersededBy(fresh: SupersedeCandidate, waiting: readonly SupersedeCandidate[]): string[] {
  if (!SUPERSEDABLE.has(fresh.action_type) || isReferral(fresh.payload)) return [];
  const entity = key(fresh.outcome_key);
  if (!entity) return [];
  return waiting
    .filter((row) => row.id !== fresh.id && row.action_type === fresh.action_type && key(row.outcome_key) === entity && !isReferral(row.payload))
    .map((row) => row.id);
}

/**
 * Closes what a just-recorded proposal replaces, with its approval row and any
 * reminder about it. Bounded; never throws, so a failure leaves the older
 * proposal waiting (it still expires after 48 hours) and never fails the turn.
 */
export async function supersedeOlderProposals(
  admin: SupabaseClient,
  fresh: SupersedeCandidate & { household_id: string; session_id: string },
  now: Date = new Date(),
): Promise<string[]> {
  if (!SUPERSEDABLE.has(fresh.action_type) || !key(fresh.outcome_key)) return [];
  try {
    const { data, error } = await admin
      .from("conversation_actions")
      .select("id, action_type, outcome_key, payload")
      .eq("household_id", fresh.household_id)
      .eq("session_id", fresh.session_id)
      .eq("action_type", fresh.action_type)
      .eq("approval_status", "proposed")
      .neq("id", fresh.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !data) return [];
    const ids = supersededBy(fresh, data as SupersedeCandidate[]);
    const closed: string[] = [];
    for (const id of ids) {
      const { data: row } = await admin
        .from("conversation_actions")
        .update({ approval_status: "expired", decided_at: now.toISOString(), result: { reason: "superseded", supersededBy: fresh.id } })
        .eq("id", id)
        .eq("household_id", fresh.household_id)
        .eq("approval_status", "proposed")
        .select("id")
        .maybeSingle();
      if (!row) continue;
      closed.push(id);
      await admin.from("approvals").update({ status: "expired", decided_at: now.toISOString() }).eq("household_id", fresh.household_id).eq("conversation_action_id", id).eq("status", "pending");
      await admin
        .from("notifications")
        .update({ status: "resolved", resolved_at: now.toISOString() })
        .eq("household_id", fresh.household_id)
        .eq("source_type", "approval")
        .eq("source_id", id)
        .in("status", ["generated", "delivered", "seen"]);
    }
    return closed;
  } catch (thrown) {
    log.warn("proposal supersede failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
    return [];
  }
}
