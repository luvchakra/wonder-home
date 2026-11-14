import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deadlinesFor,
  EXPIRE_AFTER_HOURS,
  rankNeedsYou,
  type Consequence,
  type NeedsYouAnswer,
  type NeedsYouItem,
  type NeedsYouPrompt,
  type NewNeedsYou,
} from "./needs-you";

/**
 * The one "Needs you" list, served from one place (2026-11-14, decision 4).
 *
 * Three kinds of row, one list:
 *   - `needs_you_items`: every question WonderHome asks with tap answers and a
 *     default (HomeSend's, and parts B's and C's through `askNeedsYou`);
 *   - HomeTalk proposals still waiting for a yes (`conversation_actions`,
 *     `proposed`), answered in HomeTalk where they were made;
 *   - approvals still pending (`approvals`), decided on their own screen.
 * Read through the caller's own client, so RLS decides who sees what.
 */

type Row = Record<string, unknown>;

const COLUMNS = "id, household_id, source, subject_table, subject_id, recipient_member_id, prompt, answers, default_answer, default_at, expires_at, consequence, due_on, created_at";

function fromRow(row: Row): NeedsYouItem {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    source: row.source as string,
    subjectTable: row.subject_table as string,
    subjectId: row.subject_id as string,
    recipientMemberId: (row.recipient_member_id as string | null) ?? null,
    prompt: (row.prompt as NeedsYouPrompt) ?? { code: "unknown" },
    answers: Array.isArray(row.answers) ? (row.answers as NeedsYouAnswer[]) : [],
    defaultAnswer: row.default_answer as string,
    defaultAt: row.default_at as string,
    expiresAt: row.expires_at as string,
    consequence: Math.max(0, Math.min(3, Number(row.consequence ?? 0))) as Consequence,
    dueOn: (row.due_on as string | null) ?? null,
    createdAt: row.created_at as string,
    answeredInPlace: true,
  };
}

/** Whether the list's migration is on this database. */
export async function needsYouReady(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.from("needs_you_items").select("id").limit(1);
  return !error;
}

/**
 * Ask a question: one open row per thing per source (a second ask while one is
 * open is a no-op and returns the open one's id). The interface parts B and C
 * add items through: `source` "sender_trust" or "conflict", their own closed
 * `prompt.code`, tap `answers`, the `defaultAnswer` that applies after 24
 * hours. Their default is applied by their own handler (`registerNeedsYouHandler`).
 */
export async function askNeedsYou(client: SupabaseClient, input: NewNeedsYou): Promise<string | null> {
  const { defaultAt, expiresAt } = deadlinesFor(input.askedAt);
  const insert = await client
    .from("needs_you_items")
    .insert({
      household_id: input.householdId,
      source: input.source,
      subject_table: input.subjectTable,
      subject_id: input.subjectId,
      recipient_member_id: input.recipientMemberId,
      prompt: input.prompt,
      answers: input.answers,
      default_answer: input.defaultAnswer,
      default_at: defaultAt,
      expires_at: expiresAt,
      consequence: input.consequence,
      due_on: input.dueOn,
      status: "open",
      created_at: input.askedAt.toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (!insert.error) return (insert.data?.id as string | undefined) ?? null;
  // Already asked and still open: that one stands.
  if (insert.error.code === "23505") {
    const open = await client.from("needs_you_items").select("id").eq("source", input.source).eq("subject_id", input.subjectId).eq("status", "open").maybeSingle();
    return (open.data?.id as string | undefined) ?? null;
  }
  throw new Error(`askNeedsYou failed: ${insert.error.code ?? "unknown"}`);
}

/** Close a question: answered by a person, its default applied, expired, or withdrawn (the thing it asked about was settled elsewhere). */
export async function closeNeedsYou(
  client: SupabaseClient,
  id: string,
  close: { status: "answered" | "defaulted" | "expired" | "withdrawn"; answer?: string | null; memberId?: string | null; now?: Date },
): Promise<boolean> {
  const { data, error } = await client
    .from("needs_you_items")
    .update({
      status: close.status,
      answer: close.answer ?? null,
      answered_by_member_id: close.status === "answered" ? (close.memberId ?? null) : null,
      resolved_at: (close.now ?? new Date()).toISOString(),
    })
    .eq("id", id)
    .eq("status", "open")
    .select("id");
  if (error) throw new Error(`closeNeedsYou failed: ${error.code ?? "unknown"}`);
  return (data ?? []).length > 0;
}

/** One open question by id, as the caller may see it. */
export async function getNeedsYou(client: SupabaseClient, householdId: string, id: string): Promise<NeedsYouItem | null> {
  const { data, error } = await client.from("needs_you_items").select(COLUMNS).eq("household_id", householdId).eq("id", id).eq("status", "open").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

/** HomeTalk proposals still waiting for a yes, made in the last 48 hours: answered in HomeTalk. */
async function pendingProposals(client: SupabaseClient, householdId: string, now: Date): Promise<NeedsYouItem[]> {
  const since = new Date(now.getTime() - EXPIRE_AFTER_HOURS * 3_600_000).toISOString();
  const { data, error } = await client
    .from("conversation_actions")
    .select("id, session_id, action_type, payload, created_at")
    .eq("household_id", householdId)
    .eq("approval_status", "proposed")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) return [];
  return ((data ?? []) as Row[]).map((row) => {
    const payload = (row.payload as Record<string, unknown> | null) ?? {};
    const preview = payload.preview as { summary?: unknown } | null | undefined;
    const created = new Date(row.created_at as string);
    const { defaultAt, expiresAt } = deadlinesFor(created);
    return {
      id: `proposal:${row.id as string}`,
      householdId,
      source: "hometalk_proposal",
      subjectTable: "conversation_actions",
      subjectId: row.id as string,
      recipientMemberId: null,
      prompt: { code: "hometalk.proposal", title: typeof preview?.summary === "string" ? preview.summary.slice(0, 200) : null, kind: row.action_type as string, href: "/ai" },
      answers: [{ value: "open" }],
      defaultAnswer: "not_done",
      defaultAt,
      expiresAt,
      consequence: 1 as Consequence,
      dueOn: null,
      createdAt: row.created_at as string,
      answeredInPlace: false,
    };
  });
}

/** Approvals still pending: decided where they were asked; they never approve themselves. */
async function pendingApprovals(client: SupabaseClient, householdId: string, now: Date): Promise<NeedsYouItem[]> {
  const { data, error } = await client
    .from("approvals")
    .select("id, action_type, summary, created_at, expires_at")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) return [];
  return ((data ?? []) as Row[]).map((row) => ({
    id: `approval:${row.id as string}`,
    householdId,
    source: "approval",
    subjectTable: "approvals",
    subjectId: row.id as string,
    recipientMemberId: null,
    prompt: { code: "approval", title: (row.summary as string | null)?.slice(0, 200) ?? null, kind: row.action_type as string, href: "/ai" },
    answers: [{ value: "open" }],
    defaultAnswer: "not_done",
    defaultAt: (row.expires_at as string) ?? new Date(now.getTime() + 86_400_000).toISOString(),
    expiresAt: (row.expires_at as string) ?? new Date(now.getTime() + 86_400_000).toISOString(),
    consequence: (/pay|order|purchase/.test(String(row.action_type)) ? 3 : 1) as Consequence,
    dueOn: null,
    createdAt: row.created_at as string,
    answeredInPlace: false,
  }));
}

export type NeedsYouList = { shown: NeedsYouItem[]; total: number };

/**
 * The list for the person reading it: their open questions, the household's
 * HomeTalk proposals and pending approvals they may see, ranked, at most
 * three shown. Never throws: a part that can't be read is left out.
 */
export async function loadNeedsYou(client: SupabaseClient, householdId: string, options: { now?: Date; limit?: number } = {}): Promise<NeedsYouList> {
  const now = options.now ?? new Date();
  const [questions, proposals, approvals] = await Promise.all([
    Promise.resolve(
      client.from("needs_you_items").select(COLUMNS).eq("household_id", householdId).eq("status", "open").order("consequence", { ascending: false }).order("created_at", { ascending: true }).limit(100),
    ).then(
      ({ data, error }) => (error ? [] : ((data ?? []) as Row[]).map(fromRow)),
      () => [] as NeedsYouItem[],
    ),
    pendingProposals(client, householdId, now).catch(() => []),
    pendingApprovals(client, householdId, now).catch(() => []),
  ]);
  return rankNeedsYou([...questions, ...proposals, ...approvals], options.limit);
}

// --- Handlers: what an answer or a default does, per source ----------------

export type NeedsYouActor = { householdId: string; memberId: string | null };

/**
 * What applying an answer does for one source. `client` is the answerer's own
 * client for a person's tap (RLS decides), or the service role for a default.
 * Returns false when nothing could be done (the thing was already settled):
 * the question is then withdrawn rather than answered.
 */
export type NeedsYouHandler = (client: SupabaseClient, item: NeedsYouItem, answer: string, how: { byDefault: boolean; actor: NeedsYouActor; now: Date }) => Promise<boolean>;

const HANDLERS = new Map<string, NeedsYouHandler>();

/** Parts B and C register what their answers and defaults do. */
export function registerNeedsYouHandler(source: string, handler: NeedsYouHandler): void {
  HANDLERS.set(source, handler);
}

export function handlerFor(source: string): NeedsYouHandler | undefined {
  return HANDLERS.get(source);
}
