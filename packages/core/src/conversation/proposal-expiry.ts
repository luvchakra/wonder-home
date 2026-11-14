import type { SupabaseClient } from "@supabase/supabase-js";

import { formatterFor } from "../i18n/format";
import { DEFAULT_PREFERENCES } from "../i18n/preferences";
import { log } from "../observability/logger";
import { createNotification } from "../notifications/create";
import { msg } from "../notifications/message";
import { reminderText } from "../notifications/sources";
import { PROPOSAL_EXPIRY_HOURS, PROPOSAL_REMIND_AFTER_HOURS } from "./proposal-window";

/**
 * Proposals and approvals expire as not done (the owner, 2026-11-14; plan
 * "Nothing stuck in review", phase 2).
 *
 * Live on 14 Nov, 3 HomeTalk proposals were never answered and sat as
 * "proposed" for good. Now an action still waiting for a person (a payment,
 * an order, a booking, a message outside the household, or a child's request
 * waiting for a grown-up) gets one reminder to whoever decides it after
 * 24 hours, and after 48 hours it is closed as not done: the conversation
 * action becomes `expired`, its approval row too, and its notification is
 * resolved. Nothing is ever approved automatically: expiry only ever closes
 * a proposal the way "no" would.
 *
 * The plan is pure (`planProposalSweep`); `sweepStaleProposals` runs it on
 * the delivery clock (`/api/v1/notifications/dispatch`).
 */

export { PROPOSAL_EXPIRY_HOURS, PROPOSAL_REMIND_AFTER_HOURS };

const HOUR_MS = 3_600_000;

export type StaleProposalRow = {
  id: string;
  household_id: string;
  action_type: string;
  created_at: string;
  payload: Record<string, unknown> | null;
  /** The member whose conversation it is: for their own request, they decide. */
  session_member_id: string | null;
};

export type ProposalSweepPlan = {
  /** One reminder each, to whoever decides it. */
  remind: { row: StaleProposalRow; recipientMemberId: string; summary: string }[];
  /** Closed as not done. */
  expire: StaleProposalRow[];
};

function referralOf(payload: Record<string, unknown> | null): { approvalId?: string; approverMemberId?: string } | null {
  const referral = payload?.referral;
  return referral && typeof referral === "object" ? (referral as { approvalId?: string; approverMemberId?: string }) : null;
}

/** Who decides a waiting proposal: the grown-up a child's request went to, else the person who asked. */
export function deciderOf(row: StaleProposalRow): string | null {
  return referralOf(row.payload)?.approverMemberId ?? row.session_member_id;
}

function summaryOf(row: StaleProposalRow): string {
  const preview = row.payload?.preview as { summary?: unknown } | undefined;
  const summary = typeof preview?.summary === "string" ? preview.summary : typeof row.payload?.summary === "string" ? (row.payload.summary as string) : "";
  return summary.trim().slice(0, 160) || "Something you asked for";
}

export function planProposalSweep(rows: readonly StaleProposalRow[], now: Date): ProposalSweepPlan {
  const plan: ProposalSweepPlan = { remind: [], expire: [] };
  for (const row of rows) {
    const age = now.getTime() - new Date(row.created_at).getTime();
    if (!Number.isFinite(age)) continue;
    if (age >= PROPOSAL_EXPIRY_HOURS * HOUR_MS) {
      plan.expire.push(row);
      continue;
    }
    if (age < PROPOSAL_REMIND_AFTER_HOURS * HOUR_MS) continue;
    if (typeof row.payload?.remindedAt === "string") continue;
    const recipient = deciderOf(row);
    if (recipient) plan.remind.push({ row, recipientMemberId: recipient, summary: summaryOf(row) });
  }
  return plan;
}

const ENGLISH = formatterFor({ ...DEFAULT_PREFERENCES, language: "en" });

/**
 * One pass across households: reminds and expires what has waited too long.
 * Bounded; a failure leaves everything as it was and never takes the clock down.
 */
export async function sweepStaleProposals(admin: SupabaseClient, now: Date = new Date(), limit = 200): Promise<{ reminded: number; expired: number }> {
  const result = { reminded: 0, expired: 0 };
  try {
    const { data, error } = await admin
      .from("conversation_actions")
      .select("id, household_id, action_type, created_at, payload, conversation_sessions(member_id)")
      .eq("approval_status", "proposed")
      .lte("created_at", new Date(now.getTime() - PROPOSAL_REMIND_AFTER_HOURS * HOUR_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error || !data) return result;
    const rows: StaleProposalRow[] = (data as (Omit<StaleProposalRow, "session_member_id"> & { conversation_sessions: { member_id: string } | { member_id: string }[] | null })[]).map((row) => {
      const session = Array.isArray(row.conversation_sessions) ? row.conversation_sessions[0] : row.conversation_sessions;
      return { id: row.id, household_id: row.household_id, action_type: row.action_type, created_at: row.created_at, payload: row.payload, session_member_id: session?.member_id ?? null };
    });
    const plan = planProposalSweep(rows, now);

    for (const row of plan.expire) {
      // Closed the way "no" would close it: compare-and-swap on the status, so an answer in the same moment wins.
      const { data: closed } = await admin
        .from("conversation_actions")
        .update({ approval_status: "expired", decided_at: now.toISOString(), result: { reason: "not_answered", expiredAfterHours: PROPOSAL_EXPIRY_HOURS } })
        .eq("id", row.id)
        .eq("household_id", row.household_id)
        .eq("approval_status", "proposed")
        .select("id")
        .maybeSingle();
      if (!closed) continue;
      result.expired += 1;
      const approvalId = referralOf(row.payload)?.approvalId;
      await admin.from("approvals").update({ status: "expired", decided_at: now.toISOString() }).eq("household_id", row.household_id).eq("conversation_action_id", row.id).eq("status", "pending");
      await admin
        .from("notifications")
        .update({ status: "resolved", resolved_at: now.toISOString() })
        .eq("household_id", row.household_id)
        .eq("source_type", "approval")
        .in("source_id", approvalId ? [row.id, approvalId] : [row.id])
        .in("status", ["generated", "delivered", "seen"]);
    }

    for (const { row, recipientMemberId, summary } of plan.remind) {
      // Marked first, so a second tick never sends a second reminder.
      const { data: marked } = await admin
        .from("conversation_actions")
        .update({ payload: { ...(row.payload ?? {}), remindedAt: now.toISOString() } })
        .eq("id", row.id)
        .eq("household_id", row.household_id)
        .eq("approval_status", "proposed")
        .select("id")
        .maybeSingle();
      if (!marked) continue;
      const words = reminderText(msg("reminder.proposal.waitingTitle"), msg("reminder.proposal.waitingBody", { summary, hours: PROPOSAL_EXPIRY_HOURS - PROPOSAL_REMIND_AFTER_HOURS }), "medium", ENGLISH);
      const created = await createNotification(admin, {
        householdId: row.household_id,
        decision: {
          kind: "notify",
          recipientMemberId,
          type: "action",
          threadKey: `proposal:${row.id}`,
          updatesExistingThread: false,
          deliverAt: now,
          impact: words.body,
          action: { action: "approve", target: "/ai" },
          factors: { riskLevel: "medium", source: "approval" },
        },
        title: words.title,
        body: words.body,
        category: "system",
        source: { type: "approval", id: row.id },
        copy: words.copy,
        reason: "reminder",
        expiresAt: new Date(new Date(row.created_at).getTime() + PROPOSAL_EXPIRY_HOURS * HOUR_MS),
      }).catch(() => null);
      if (created) result.reminded += 1;
    }
  } catch (thrown) {
    log.warn("proposal expiry sweep failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
  }
  return result;
}
