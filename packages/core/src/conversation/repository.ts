import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdIntent } from "./intent";
import { reconcileMemory, type Memory } from "./memory";
import type { ActionPreview, Proposal } from "./proposal";

/**
 * Reading and writing conversations (module 04).
 *
 * Reads go through the member's own client, so RLS decides what they see.
 * Writes go through the admin client the route hands in — the tables are
 * read-only from a session on purpose, so nothing a browser sends can
 * fabricate a conversation, approve its own proposal, or plant a memory. The
 * route authorizes first; this module assumes it has.
 */

type Row = Record<string, unknown>;

export type ConversationAction = {
  id: string;
  actionType: string;
  status: "proposed" | "approved" | "rejected" | "executed" | "failed" | "expired";
  preview: ActionPreview | null;
  createdAt: Date;
};

export type ConversationMessage = {
  id: string;
  role: "member" | "assistant" | "system";
  content: string;
  createdAt: Date;
  action: ConversationAction | null;
};

/** The member's open session, created if there is none. */
export async function openSession(
  admin: SupabaseClient,
  input: { householdId: string; memberId: string; channel: "text" | "voice" },
): Promise<string> {
  const { data: existing, error: readError } = await admin
    .from("conversation_sessions")
    .select("id")
    .eq("household_id", input.householdId)
    .eq("member_id", input.memberId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) throw new Error(`openSession read failed: ${readError.code ?? "unknown"}`);
  if (existing) return existing.id as string;

  const { data, error } = await admin
    .from("conversation_sessions")
    .insert({ household_id: input.householdId, member_id: input.memberId, channel: input.channel })
    .select("id")
    .single();

  if (error) throw new Error(`openSession create failed: ${error.code ?? "unknown"}`);
  return data.id as string;
}

/** The recent history of a session, as the member may see it. */
export async function listMessages(
  supabase: SupabaseClient,
  householdId: string,
  sessionId: string,
  limit = 40,
): Promise<ConversationMessage[]> {
  const [{ data: messages, error }, { data: actions }] = await Promise.all([
    supabase
      .from("conversation_messages")
      .select("id, role, content, created_at")
      .eq("household_id", householdId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("conversation_actions")
      .select("id, message_id, action_type, approval_status, payload, created_at")
      .eq("household_id", householdId)
      .eq("session_id", sessionId),
  ]);

  if (error) throw new Error(`listMessages failed: ${error.code ?? "unknown"}`);

  const byMessage = new Map<string, ConversationAction>();
  for (const row of (actions as Row[] | null) ?? []) {
    if (row.message_id) byMessage.set(row.message_id as string, toAction(row));
  }

  return ((messages as Row[] | null) ?? [])
    .map((row) => ({
      id: row.id as string,
      role: row.role as ConversationMessage["role"],
      content: row.content as string,
      createdAt: new Date(row.created_at as string),
      action: byMessage.get(row.id as string) ?? null,
    }))
    .reverse();
}

/**
 * The last few turns of a session, oldest first — what an understanding
 * needs to resolve "actually make it 7" against what was said before.
 * Text and role only; the caller minimises and pseudonymises before any of
 * it leaves the server.
 */
export async function recentTurns(
  admin: SupabaseClient,
  sessionId: string,
  limit = 6,
): Promise<{ role: "member" | "assistant"; text: string }[]> {
  const { data } = await admin
    .from("conversation_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .in("role", ["member", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limit);

  return (((data as Row[] | null) ?? []) as { role: "member" | "assistant"; content: string }[])
    .map((row) => ({ role: row.role, text: row.content }))
    .reverse();
}

/** A recorded proposal, with enough of what was asked to carry it out once approved. */
export async function loadAction(
  admin: SupabaseClient,
  input: { householdId: string; actionId: string },
): Promise<{ id: string; actionType: string; outcomeKey: string | null; parameters: Record<string, unknown>; status: ConversationAction["status"] } | null> {
  const { data } = await admin
    .from("conversation_actions")
    .select("id, action_type, outcome_key, payload, approval_status")
    .eq("id", input.actionId)
    .eq("household_id", input.householdId)
    .maybeSingle();

  if (!data) return null;
  const payload = (data.payload as Row | null) ?? {};
  return {
    id: data.id as string,
    actionType: data.action_type as string,
    outcomeKey: (data.outcome_key as string | null) ?? null,
    parameters: ((payload.parameters as Record<string, unknown> | undefined) ?? {}),
    status: data.approval_status as ConversationAction["status"],
  };
}

/** What happened when a proposal was carried out — or why it was not. */
export async function markActionResult(
  admin: SupabaseClient,
  input: { actionId: string; status: "executed" | "failed"; result: Record<string, unknown> },
): Promise<void> {
  const { error } = await admin
    .from("conversation_actions")
    .update({ approval_status: input.status, result: input.result, updated_at: new Date().toISOString() })
    .eq("id", input.actionId);

  if (error) throw new Error(`markActionResult failed: ${error.code ?? "unknown"}`);
}

/** The member's most recent open session, if they have one. */
export async function currentSessionId(
  supabase: SupabaseClient,
  householdId: string,
  memberId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("conversation_sessions")
    .select("id")
    .eq("household_id", householdId)
    .eq("member_id", memberId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** The latest proposal in a session still waiting for a decision. */
export async function pendingAction(
  admin: SupabaseClient,
  sessionId: string,
): Promise<{ id: string; summary: string; createdAt: Date } | null> {
  const { data } = await admin
    .from("conversation_actions")
    .select("id, payload, created_at")
    .eq("session_id", sessionId)
    .eq("approval_status", "proposed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const payload = (data.payload as Row | null) ?? {};
  const preview = payload.preview as ActionPreview | undefined;
  return { id: data.id as string, summary: preview?.summary ?? "that", createdAt: new Date(data.created_at as string) };
}

export async function recordMessage(
  admin: SupabaseClient,
  input: {
    householdId: string;
    sessionId: string;
    role: "member" | "assistant";
    content: string;
    transcriptConfidence?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  const { data, error } = await admin
    .from("conversation_messages")
    .insert({
      household_id: input.householdId,
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      transcript_confidence: input.transcriptConfidence ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) throw new Error(`recordMessage failed: ${error.code ?? "unknown"}`);
  return data.id as string;
}

/** Writes a proposal down so a later "yes" has something to refer to. */
export async function recordProposal(
  admin: SupabaseClient,
  input: {
    householdId: string;
    sessionId: string;
    messageId: string;
    intent: HouseholdIntent;
    proposal: Proposal;
  },
): Promise<ConversationAction> {
  const preview = "preview" in input.proposal ? input.proposal.preview : null;
  const status: ConversationAction["status"] =
    input.proposal.kind === "executed" ? "executed" : input.proposal.kind === "refused" ? "rejected" : "proposed";

  const { data, error } = await admin
    .from("conversation_actions")
    .insert({
      household_id: input.householdId,
      session_id: input.sessionId,
      message_id: input.messageId,
      action_type: input.intent.action,
      outcome_key: input.intent.target.reference ?? null,
      payload: { preview, parameters: input.intent.parameters, kind: input.proposal.kind },
      approval_status: status,
    })
    .select("id, action_type, approval_status, payload, created_at")
    .single();

  if (error) throw new Error(`recordProposal failed: ${error.code ?? "unknown"}`);
  return toAction(data as Row);
}

/** A person's decision on a proposal. Only ever from proposed. */
export async function decideAction(
  admin: SupabaseClient,
  input: { householdId: string; actionId: string; memberId: string; decision: "approved" | "rejected" },
): Promise<ConversationAction | null> {
  const { data, error } = await admin
    .from("conversation_actions")
    .update({
      approval_status: input.decision,
      decided_by_member_id: input.memberId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.actionId)
    .eq("household_id", input.householdId)
    .eq("approval_status", "proposed")
    .select("id, action_type, approval_status, payload, created_at")
    .maybeSingle();

  if (error) throw new Error(`decideAction failed: ${error.code ?? "unknown"}`);
  return data ? toAction(data as Row) : null;
}

/**
 * Remembers something a person stated, reconciled against what is already
 * believed. A confirmed fact is never quietly replaced.
 */
export async function remember(
  admin: SupabaseClient,
  householdId: string,
  memory: Memory,
): Promise<void> {
  const { data: existingRow } = await admin
    .from("memories")
    .select("id, scope, member_id, category, key, value, source_type, source_id, confidence, status")
    .eq("household_id", householdId)
    .eq("key", memory.key)
    .in("status", ["learned", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existing: (Memory & { id: string }) | null = existingRow
    ? {
        id: existingRow.id as string,
        scope: existingRow.scope as Memory["scope"],
        memberId: (existingRow.member_id as string | null) ?? null,
        category: existingRow.category as Memory["category"],
        key: existingRow.key as string,
        value: existingRow.value as Record<string, unknown>,
        sourceType: existingRow.source_type as Memory["sourceType"],
        sourceId: (existingRow.source_id as string | null) ?? null,
        confidence: Number(existingRow.confidence),
        status: existingRow.status as Memory["status"],
      }
    : null;

  const update = reconcileMemory(existing, memory, { statedByMember: true });
  if (update.kind === "unchanged" || update.kind === "needs_review") return;

  if (update.kind === "supersede" && existing) {
    await admin.from("memories").update({ status: "superseded" }).eq("id", existing.id);
  }

  const { error } = await admin.from("memories").insert({
    household_id: householdId,
    scope: update.memory.scope,
    member_id: update.memory.memberId,
    category: update.memory.category,
    key: update.memory.key,
    value: update.memory.value,
    source_type: update.memory.sourceType,
    source_id: update.memory.sourceId,
    confidence: update.memory.confidence,
    status: update.memory.status,
  });
  if (error) throw new Error(`remember failed: ${error.code ?? "unknown"}`);
}

function toAction(row: Row): ConversationAction {
  const payload = (row.payload as Row | null) ?? {};
  return {
    id: row.id as string,
    actionType: row.action_type as string,
    status: row.approval_status as ConversationAction["status"],
    preview: (payload.preview as ActionPreview | null) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}
