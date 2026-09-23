import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingClarification } from "./clarify";
import { readFocus, type FocusEntity } from "./references";

import { ApiError } from "../api/errors";
import type { HouseholdIntent } from "./intent";
import { claimFor, isReviewable, reconcileMemory, reviewPlacementFor, type Memory } from "./memory";
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

/**
 * What the last few assistant turns were about (Wave 4 §8, §16), newest
 * first — the focus each turn wrote on its own message. Read by a turn that
 * says "that" or "them"; a turn that names things never reads it.
 */
export async function recentFocus(admin: SupabaseClient, sessionId: string, limit = 4): Promise<FocusEntity[]> {
  const { data } = await admin
    .from("conversation_messages")
    .select("metadata, created_at")
    .eq("session_id", sessionId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data as Row[] | null) ?? []).flatMap((row) => readFocus((row.metadata as Row | null)?.focus));
}

/**
 * The question WonderHome asked last, if the last thing it said was one.
 *
 * Stored on the assistant message that asked it rather than in a table of
 * its own: a clarification only matters until the next turn answers it, so
 * it belongs to the message, and reading it back is one query the turn was
 * making anyway.
 *
 * Deliberately only the *last* message. A question two turns ago has been
 * overtaken by whatever happened since, and treating it as still open is
 * how an assistant ends up answering something nobody is asking any more.
 */
export async function pendingClarification(
  admin: SupabaseClient,
  sessionId: string,
): Promise<PendingClarification | null> {
  const { data } = await admin
    .from("conversation_messages")
    .select("role, metadata")
    .eq("session_id", sessionId)
    .in("role", ["member", "assistant"])
    .order("created_at", { ascending: false })
    .limit(1);

  const row = ((data as Row[] | null) ?? [])[0];
  if (!row || row.role !== "assistant") return null;

  const clarify = (row.metadata as Record<string, unknown> | null)?.clarify;
  return clarify ? (clarify as PendingClarification) : null;
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

/**
 * The last thing this conversation proposed or did, as it was recorded —
 * what HomeBrain's "why?" answers cite (Wave 2 §10). The reason is the one
 * written into the preview when it was proposed, and the failure is the one
 * the executor reported; nothing here is reconstructed after the fact.
 */
export async function latestAction(
  admin: SupabaseClient,
  sessionId: string,
): Promise<{ summary: string | null; actionType: string; status: string; kind: string | null; because: string | null; failure: string | null } | null> {
  const { data } = await admin
    .from("conversation_actions")
    .select("action_type, approval_status, payload, result")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const payload = (data.payload as Row | null) ?? {};
  const preview = payload.preview as ActionPreview | null | undefined;
  const result = (data.result as Row | null) ?? {};
  return {
    summary: preview?.summary ?? null,
    actionType: data.action_type as string,
    status: data.approval_status as string,
    kind: typeof payload.kind === "string" ? payload.kind : null,
    because: preview?.because ?? null,
    failure: typeof result.reason === "string" ? result.reason : null,
  };
}

/**
 * Undoing the last thing a member said, so it can be said again differently
 * (story 04-003's "actually" — as a structural edit rather than a new turn).
 *
 * Only the household's own most recent member message may be edited, and
 * only while nothing has come of it yet: this deletes that message and
 * whatever followed it in the session (ordinarily one assistant reply, and
 * the proposal it may have recorded), so the edited turn regenerates a
 * fresh reply rather than appending a second answer to a question that no
 * longer exists. A proposal already approved or executed is a thing that
 * happened, not a draft, and refuses the edit outright — undo is a
 * different, explicit action from this one.
 */
export async function beginEditMessage(
  admin: SupabaseClient,
  input: { householdId: string; sessionId: string; messageId: string },
): Promise<void> {
  const { data: target, error: targetError } = await admin
    .from("conversation_messages")
    .select("id, role, created_at")
    .eq("id", input.messageId)
    .eq("household_id", input.householdId)
    .eq("session_id", input.sessionId)
    .maybeSingle();

  if (targetError) throw new Error(`beginEditMessage read failed: ${targetError.code ?? "unknown"}`);
  if (!target || target.role !== "member") {
    throw ApiError.notFound("That message is not there to edit.");
  }

  const { data: after, error: afterError } = await admin
    .from("conversation_messages")
    .select("id, role")
    .eq("session_id", input.sessionId)
    .gt("created_at", target.created_at as string)
    .order("created_at", { ascending: true });

  if (afterError) throw new Error(`beginEditMessage read failed: ${afterError.code ?? "unknown"}`);
  const following = (after as Row[] | null) ?? [];

  if (following.some((row) => row.role === "member")) {
    throw ApiError.badRequest("That is no longer the last thing you said, so it cannot be edited.");
  }

  const toRemove = [target.id as string, ...following.map((row) => row.id as string)];

  const { data: actions, error: actionsError } = await admin
    .from("conversation_actions")
    .select("id, approval_status")
    .in("message_id", toRemove);

  if (actionsError) throw new Error(`beginEditMessage read failed: ${actionsError.code ?? "unknown"}`);
  if ((actions as Row[] | null)?.some((row) => row.approval_status === "approved" || row.approval_status === "executed")) {
    throw ApiError.badRequest("I already did something because of that, so it cannot be edited. Send a new message instead.");
  }

  const { error: deleteActionsError } = await admin.from("conversation_actions").delete().in("message_id", toRemove);
  if (deleteActionsError) throw new Error(`beginEditMessage delete failed: ${deleteActionsError.code ?? "unknown"}`);

  const { error: deleteMessagesError } = await admin.from("conversation_messages").delete().in("id", toRemove);
  if (deleteMessagesError) throw new Error(`beginEditMessage delete failed: ${deleteMessagesError.code ?? "unknown"}`);
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
 *
 * Every belief HomeTalk learns also becomes a HomeBrain Review item (Wave 2
 * §8, §9), linked by `memory_id`, so the household can see it, confirm it,
 * correct it or remove it — and a change of mind ("actually Asmi is okay
 * with mushrooms now") marks the old item corrected, with who said so, in
 * the same history Review's own corrections write to. Written with the
 * admin client: the review tables are read-only to members by design, and
 * this runs only after the turn's own authorization.
 */
export async function remember(
  admin: SupabaseClient,
  householdId: string,
  memory: Memory,
  statedBy?: { memberId: string; displayName: string },
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

  const { data: inserted, error } = await admin
    .from("memories")
    .insert({
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
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(`remember failed: ${error?.code ?? "unknown"}`);

  if (!isReviewable(update.memory)) return;

  const now = new Date().toISOString();
  const claim = claimFor(update.memory);
  const placement = reviewPlacementFor(update.memory);

  // What it replaces, in Review: retired as corrected, never deleted.
  let replaced: { id: string; claim: string; status: string } | null = null;
  if (update.kind === "supersede" && existing) {
    const { data: previous } = await admin
      .from("certification_items")
      .select("id, claim, status")
      .eq("household_id", householdId)
      .eq("memory_id", existing.id)
      .in("status", ["learned", "confirmed", "needs_review"])
      .limit(1)
      .maybeSingle();
    if (previous) {
      replaced = { id: previous.id as string, claim: previous.claim as string, status: previous.status as string };
      await admin
        .from("certification_items")
        .update({ status: "corrected", last_reviewed_at: now, last_reviewed_by: statedBy?.memberId ?? null })
        .eq("id", replaced.id);
    }
  }

  const { error: itemError } = await admin.from("certification_items").insert({
    household_id: householdId,
    memory_id: inserted.id as string,
    category: placement.category,
    claim,
    scope: update.memory.scope,
    member_id: update.memory.memberId,
    source_type: update.memory.sourceType,
    source_detail: statedBy ? `told by ${statedBy.displayName}` : null,
    status: update.memory.status === "confirmed" ? "confirmed" : "learned",
    risk_level: placement.risk,
  });
  if (itemError) throw new Error(`remember review item failed: ${itemError.code ?? "unknown"}`);

  if (replaced && statedBy) {
    await admin.from("certification_reviews").insert({
      household_id: householdId,
      item_id: replaced.id,
      reviewer_member_id: statedBy.memberId,
      decision: "corrected",
      previous_value: { claim: replaced.claim, status: replaced.status },
      new_value: { claim, status: "learned" },
      note: "Corrected in HomeTalk.",
    });
  }
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
