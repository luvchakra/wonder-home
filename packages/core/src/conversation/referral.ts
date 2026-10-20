import type { SupabaseClient } from "@supabase/supabase-js";

import { createNotification } from "../notifications/create";
import { decideNotification, type HouseholdEvent } from "../notifications/decide";

/**
 * A child's or helper's request goes to an adult for the final OK (the owner,
 * 2026-10-20: "such queries are fine but results should go to adult for final
 * approval before adding to WonderHome").
 *
 * HomeTalk still understands and previews what a child asks for, exactly as
 * for anyone. What changes is who says yes: a child's or helper's "go ahead"
 * never writes. It records one `approvals` row for that exact proposal (its
 * fingerprint), addressed to an adult — the requester's guardian, else an
 * Admin — and tells them with one notification carrying Approve and Decline.
 * Only that adult's approval (or another guardian's or Admin's) carries the
 * proposal out, through the same executor as any approved HomeTalk action.
 * Server-only: it writes with the service role, after the caller has checked
 * who is asking.
 */

/** How long an adult has to answer before the request lapses. */
export const REFERRAL_HOURS = 48;
export const REFERRAL_TTL_MINUTES = REFERRAL_HOURS * 60;

type Row = Record<string, unknown>;

export type Approver = { memberId: string; name: string };

/** Who should OK it: the requester's guardian first, else an Admin. */
export async function approverFor(admin: SupabaseClient, householdId: string, requesterMemberId: string): Promise<Approver | null> {
  const [{ data: guardians }, { data: admins }] = await Promise.all([
    admin
      .from("member_guardians")
      .select("guardian_member_id, household_members!member_guardians_guardian_member_id_fkey(display_name, member_type, status)")
      .eq("household_id", householdId)
      .eq("child_member_id", requesterMemberId)
      .limit(5),
    admin
      .from("household_roles")
      .select("member_id, household_members(display_name, member_type, status)")
      .eq("household_id", householdId)
      .eq("role", "admin")
      .limit(10),
  ]);
  const usable = (row: Row, idKey: string): Approver | null => {
    const raw = row.household_members as Row | Row[] | null;
    const member = Array.isArray(raw) ? raw[0] : raw;
    if (!member || member.member_type !== "adult" || (member.status && member.status !== "active")) return null;
    return { memberId: row[idKey] as string, name: ((member.display_name as string) ?? "").split(/\s+/)[0] || (member.display_name as string) };
  };
  for (const row of (guardians ?? []) as Row[]) {
    const found = usable(row, "guardian_member_id");
    if (found && found.memberId !== requesterMemberId) return found;
  }
  for (const row of (admins ?? []) as Row[]) {
    const found = usable(row, "member_id");
    if (found && found.memberId !== requesterMemberId) return found;
  }
  return null;
}

/** Whether this adult may give the final OK for this requester: an Admin, or one of their guardians. */
export async function mayApproveFor(admin: SupabaseClient, input: { householdId: string; approverMemberId: string; requesterMemberId: string }): Promise<boolean> {
  if (input.approverMemberId === input.requesterMemberId) return false;
  const [{ data: member }, { data: roles }, { data: guardian }] = await Promise.all([
    admin.from("household_members").select("member_type, status").eq("id", input.approverMemberId).eq("household_id", input.householdId).maybeSingle(),
    admin.from("household_roles").select("role").eq("member_id", input.approverMemberId).eq("household_id", input.householdId),
    admin.from("member_guardians").select("guardian_member_id").eq("child_member_id", input.requesterMemberId).eq("guardian_member_id", input.approverMemberId).maybeSingle(),
  ]);
  if (!member || member.member_type !== "adult" || (member.status && member.status !== "active")) return false;
  return Boolean(guardian) || ((roles ?? []) as Row[]).some((row) => row.role === "admin");
}

export type Referral = { approvalId: string; approver: Approver };

/**
 * Sends one proposal to an adult. Asking twice for the same proposal finds
 * the request already waiting (one pending approval per fingerprint) and
 * sends nothing new.
 */
export async function referToAdult(
  admin: SupabaseClient,
  input: { householdId: string; actionId: string; requester: { memberId: string; name: string }; now?: Date },
): Promise<Referral | null> {
  const { data: row } = await admin
    .from("conversation_actions")
    .select("action_type, approval_status, approval_fingerprint, payload")
    .eq("id", input.actionId)
    .eq("household_id", input.householdId)
    .maybeSingle();
  if (!row || row.approval_status !== "proposed") return null;
  const preview = (((row.payload as Row | null) ?? {}).preview as Row | undefined) ?? {};
  const said = typeof preview.summary === "string" && preview.summary.trim() ? (preview.summary as string) : (row.action_type as string);
  const one = { actionType: row.action_type as string, fingerprint: (row.approval_fingerprint as string | null) ?? null, summary: said.charAt(0).toUpperCase() + said.slice(1) };
  const approver = await approverFor(admin, input.householdId, input.requester.memberId);
  if (!approver) return null;
  const now = input.now ?? new Date();
  const fingerprint = one.fingerprint ?? `action-${input.actionId}`;
  const summary = `${input.requester.name} asks: ${one.summary}`.slice(0, 300);
  const actionType = /^[a-z][a-z0-9_.]{1,60}$/.test(one.actionType) ? one.actionType : "hometalk.request";

  const { data: existing } = await admin
    .from("approvals")
    .select("id")
    .eq("household_id", input.householdId)
    .eq("conversation_action_id", input.actionId)
    .eq("status", "pending")
    .maybeSingle();
  let approvalId = (existing?.id as string | undefined) ?? null;
  const fresh = !approvalId;
  if (!approvalId) {
    const { data, error } = await admin
      .from("approvals")
      .insert({
        household_id: input.householdId,
        conversation_action_id: input.actionId,
        requested_by: "member",
        approver_member_id: approver.memberId,
        action_type: actionType,
        action_fingerprint: fingerprint,
        summary,
        expires_at: new Date(now.getTime() + REFERRAL_HOURS * 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`referToAdult failed: ${error?.code ?? "unknown"}`);
    approvalId = data.id as string;
  }

  // The proposal remembers who it waits on, so the requester's card says so.
  const { data: action } = await admin.from("conversation_actions").select("payload").eq("id", input.actionId).maybeSingle();
  const payload = ((action?.payload as Row | null) ?? {}) as Row;
  await admin
    .from("conversation_actions")
    .update({ payload: { ...payload, referral: { approvalId, approverMemberId: approver.memberId, approverName: approver.name, requesterMemberId: input.requester.memberId } } })
    .eq("id", input.actionId)
    .eq("household_id", input.householdId);

  if (fresh) {
    const event: HouseholdEvent = {
      threadKey: `approval:${approvalId}`,
      outcomeKey: actionType,
      kind: "approval_needed",
      aiResolvable: false,
      riskLevel: "medium",
      dueAt: null,
      impact: summary,
      recommendedAction: { action: "approve" },
    };
    const decision = decideNotification(event, {
      candidates: [{ memberId: approver.memberId, role: "administrator", canAct: true, availability: null }],
      openThreadKeys: [],
      now,
    });
    if (decision.kind === "notify") {
      await createNotification(admin, {
        householdId: input.householdId,
        decision,
        title: `${input.requester.name} is asking for your OK`,
        body: `${one.summary}. Nothing is added until you approve.`,
        category: "system",
        source: { type: "approval", id: approvalId },
      }).catch(() => null);
    }
  }
  return { approvalId, approver };
}

export type PendingApproval = {
  id: string;
  summary: string;
  actionId: string | null;
  requesterMemberId: string | null;
  createdAt: Date;
  expiresAt: Date;
};

/** What waits on this adult: the household's pending member requests they may answer. */
export async function pendingApprovalsFor(admin: SupabaseClient, input: { householdId: string; memberId: string; now?: Date }): Promise<PendingApproval[]> {
  const now = input.now ?? new Date();
  const { data } = await admin
    .from("approvals")
    .select("id, summary, conversation_action_id, created_at, expires_at, conversation_actions(payload)")
    .eq("household_id", input.householdId)
    .eq("requested_by", "member")
    .eq("status", "pending")
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = ((data ?? []) as Row[]).map((row) => {
    const raw = row.conversation_actions as Row | Row[] | null;
    const payload = ((Array.isArray(raw) ? raw[0] : raw)?.payload as Row | null) ?? {};
    const referral = (payload.referral as Row | undefined) ?? {};
    return {
      id: row.id as string,
      summary: row.summary as string,
      actionId: (row.conversation_action_id as string | null) ?? null,
      requesterMemberId: (referral.requesterMemberId as string | undefined) ?? null,
      createdAt: new Date(row.created_at as string),
      expiresAt: new Date(row.expires_at as string),
    };
  });
  const allowed = await Promise.all(
    rows.map((row) => (row.requesterMemberId ? mayApproveFor(admin, { householdId: input.householdId, approverMemberId: input.memberId, requesterMemberId: row.requesterMemberId }) : Promise.resolve(false))),
  );
  return rows.filter((_, index) => allowed[index]);
}

/** Closes the approval row once an adult has answered, and resolves its notification. */
export async function closeApproval(admin: SupabaseClient, input: { householdId: string; approvalId: string; status: "approved" | "rejected" | "expired" }): Promise<void> {
  await admin
    .from("approvals")
    .update({ status: input.status === "approved" ? "consumed" : input.status, decided_at: new Date().toISOString() })
    .eq("id", input.approvalId)
    .eq("household_id", input.householdId)
    .eq("status", "pending");
  await admin
    .from("notifications")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("household_id", input.householdId)
    .eq("source_type", "approval")
    .eq("source_id", input.approvalId)
    .in("status", ["generated", "delivered", "seen"]);
}
