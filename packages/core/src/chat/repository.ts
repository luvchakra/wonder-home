import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { cleanBody, linkForPage, linkForRecord, type ChatLink, type ChatRecord, type ChatRecordKind } from "./links";

/**
 * Household chat (story 12-015). Every read and write goes through the
 * member's own session: RLS decides what a thread, a message or a record is
 * to them (`supabase/migrations/20261021030000_household_chat.sql`), and the
 * `chat_*` functions do the few writes that need more than "it is mine".
 */

export type ChatThreadKind = "household" | "direct" | "group";

export type ChatInboxRow = {
  threadId: string;
  kind: ChatThreadKind;
  title: string | null;
  lastMessageAt: string | null;
  lastBody: string | null;
  lastAuthor: string | null;
  lastRemoved: boolean;
  unread: number;
  /** The people in a direct or group thread; empty for the household thread. */
  people: string[];
};

export type ChatMessage = {
  id: string;
  authorMemberId: string;
  body: string;
  link: ChatLink | null;
  createdAt: string;
  editedAt: string | null;
  removed: boolean;
};

export type ChatThread = {
  id: string;
  householdId: string;
  kind: ChatThreadKind;
  title: string | null;
  /** Who is in it now (direct and group); the household thread is everyone. */
  people: { memberId: string; addedBy: string | null }[];
};

/**
 * Whether this deployment's database has chat at all (its migration may reach
 * the live project after the code does). Kept per server for five minutes: it
 * is a fact about the schema, the same for every household. Until it is true,
 * nothing offers chat — no nav item, no Family icon, no page (rule 10).
 */
const CHAT_CHECK_MS = 5 * 60 * 1000;
let chatChecked: { at: number; ready: boolean } | null = null;

export async function chatReady(supabase: SupabaseClient, now = Date.now()): Promise<boolean> {
  if (chatChecked && now - chatChecked.at < CHAT_CHECK_MS) return chatChecked.ready;
  const { error } = await supabase.from("chat_threads").select("id", { head: true }).limit(1);
  // A missing table is PostgREST's PGRST205 (or Postgres's 42P01); anything else is an outage, so ask again soon.
  const missing = Boolean(error && (error.code === "PGRST205" || error.code === "42P01"));
  const ready = !error;
  if (ready || missing) chatChecked = { at: now, ready };
  return ready;
}

function refused(error: { code?: string; message?: string } | null, what: string): never {
  if (error?.code === "42501") throw ApiError.forbidden("That chat isn't open to you.");
  if (error?.code === "22023") throw ApiError.badRequest("Add between one and fifty people.");
  throw new Error(`${what} failed: ${error?.code ?? "unknown"}`);
}

export async function chatInbox(supabase: SupabaseClient, householdId: string): Promise<ChatInboxRow[]> {
  const { data, error } = await supabase.rpc("chat_inbox", { p_household: householdId });
  if (error) refused(error, "chat_inbox");
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    threadId: row.thread_id as string,
    kind: row.kind as ChatThreadKind,
    title: (row.title as string | null) ?? null,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    lastBody: (row.last_body as string | null) ?? null,
    lastAuthor: (row.last_author as string | null) ?? null,
    lastRemoved: Boolean(row.last_removed),
    unread: Number(row.unread ?? 0),
    people: (row.people as string[] | null) ?? [],
  }));
}

/** How many messages from others are waiting, across every chat — for a badge. */
export function unreadTotal(rows: readonly ChatInboxRow[]): number {
  return rows.reduce((sum, row) => sum + row.unread, 0);
}

export async function householdThreadId(supabase: SupabaseClient, householdId: string): Promise<string> {
  const { data, error } = await supabase.rpc("chat_household_thread", { p_household: householdId });
  if (error) refused(error, "chat_household_thread");
  return data as string;
}

export async function openDirect(supabase: SupabaseClient, memberId: string): Promise<string> {
  const { data, error } = await supabase.rpc("chat_open_direct", { p_member: memberId });
  if (error) refused(error, "chat_open_direct");
  return data as string;
}

export async function addPeople(supabase: SupabaseClient, threadId: string, memberIds: readonly string[]): Promise<number> {
  const unique = [...new Set(memberIds)];
  const { data, error } = await supabase.rpc("chat_add_participants", { p_thread: threadId, p_members: unique });
  if (error) refused(error, "chat_add_participants");
  return Number(data ?? 0);
}

export async function leaveChat(supabase: SupabaseClient, threadId: string): Promise<void> {
  const { error } = await supabase.rpc("chat_leave", { p_thread: threadId });
  if (error) refused(error, "chat_leave");
}

export async function markRead(supabase: SupabaseClient, threadId: string): Promise<void> {
  const { error } = await supabase.rpc("chat_mark_read", { p_thread: threadId });
  if (error) refused(error, "chat_mark_read");
}

export async function readThread(supabase: SupabaseClient, threadId: string): Promise<ChatThread | null> {
  const [{ data: thread, error }, { data: people, error: peopleError }] = await Promise.all([
    supabase.from("chat_threads").select("id, household_id, kind, title").eq("id", threadId).maybeSingle(),
    supabase.from("chat_participants").select("member_id, added_by, left_at").eq("thread_id", threadId).limit(200),
  ]);
  if (error) refused(error, "readThread");
  if (peopleError) refused(peopleError, "readThread people");
  if (!thread) return null;
  const row = thread as { id: string; household_id: string; kind: ChatThreadKind; title: string | null };
  return {
    id: row.id,
    householdId: row.household_id,
    kind: row.kind,
    title: row.title,
    people: row.kind === "household"
      ? []
      : ((people as { member_id: string; added_by: string | null; left_at: string | null }[] | null) ?? [])
          .filter((person) => person.left_at === null)
          .map((person) => ({ memberId: person.member_id, addedBy: person.added_by })),
  };
}

/** The newest messages of a thread, oldest first, as a conversation reads. */
export async function readMessages(supabase: SupabaseClient, threadId: string, limit = 200): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, author_member_id, body, link_kind, link_path, link_label, created_at, edited_at, removed_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) refused(error, "readMessages");
  return ((data as Record<string, unknown>[] | null) ?? [])
    .map((row) => ({
      id: row.id as string,
      authorMemberId: row.author_member_id as string,
      body: row.removed_at ? "" : (row.body as string),
      link: !row.removed_at && row.link_path && row.link_label && row.link_kind
        ? { kind: row.link_kind as ChatLink["kind"], path: row.link_path as string, label: row.link_label as string }
        : null,
      createdAt: row.created_at as string,
      editedAt: (row.edited_at as string | null) ?? null,
      removed: Boolean(row.removed_at),
    }))
    .reverse();
}

/** What the browser may ask to link: a record by kind and id, or a screen by key. */
export type LinkChoice = { kind: ChatRecordKind; id: string } | { kind: "page"; key: string };

/**
 * Turns a choice into a link by reading the record through the writer's own
 * session — so a link only ever names something they can see — or null.
 */
export async function resolveLink(supabase: SupabaseClient, householdId: string, choice: LinkChoice | null): Promise<ChatLink | null> {
  if (!choice) return null;
  if (choice.kind === "page") return linkForPage(choice.key);
  const read = async (): Promise<ChatRecord | null> => {
    switch (choice.kind) {
      case "bill": {
        const { data } = await supabase.from("obligations").select("id, name").eq("household_id", householdId).eq("id", choice.id).maybeSingle();
        return data ? { kind: "bill", id: data.id as string, label: data.name as string } : null;
      }
      case "meal": {
        const { data } = await supabase.from("meals").select("id, name, on_date").eq("household_id", householdId).eq("id", choice.id).maybeSingle();
        return data ? { kind: "meal", id: data.id as string, label: data.name as string, onDate: data.on_date as string } : null;
      }
      case "event": {
        const { data } = await supabase.from("family_events").select("id, title").eq("household_id", householdId).eq("id", choice.id).maybeSingle();
        return data ? { kind: "event", id: data.id as string, label: data.title as string } : null;
      }
      case "grocery": {
        const { data } = await supabase.from("consumables").select("id, name").eq("household_id", householdId).eq("id", choice.id).maybeSingle();
        return data ? { kind: "grocery", id: data.id as string, label: data.name as string } : null;
      }
      case "school": {
        const { data } = await supabase.from("school_items").select("id, title").eq("household_id", householdId).eq("id", choice.id).maybeSingle();
        return data ? { kind: "school", id: data.id as string, label: data.title as string } : null;
      }
      case "home": {
        const { data } = await supabase.from("home_assets").select("id, name").eq("household_id", householdId).eq("id", choice.id).maybeSingle();
        return data ? { kind: "home", id: data.id as string, label: data.name as string } : null;
      }
    }
  };
  const record = await read();
  return record ? linkForRecord(record) : null;
}

/** What a writer can link, newest and most actionable first: a short list per kind. */
export type LinkOption = { kind: ChatRecordKind; id: string; label: string };

export async function linkOptions(supabase: SupabaseClient, householdId: string, today: string): Promise<LinkOption[]> {
  const [bills, meals, events, groceries, school, home] = await Promise.all([
    supabase.from("obligations").select("id, name").eq("household_id", householdId).not("status", "in", "(paid,cancelled)").order("due_on", { ascending: true, nullsFirst: false }).limit(15),
    supabase.from("meals").select("id, name, on_date").eq("household_id", householdId).gte("on_date", today).order("on_date", { ascending: true }).limit(15),
    supabase.from("family_events").select("id, title").eq("household_id", householdId).gte("starts_at", `${today}T00:00:00Z`).neq("status", "cancelled").order("starts_at", { ascending: true }).limit(15),
    supabase.from("consumables").select("id, name, shopping_list_entries!inner(state)").eq("household_id", householdId).eq("shopping_list_entries.state", "to_buy").order("name", { ascending: true }).limit(20),
    // School work still to do and the things at home to look after (the owner, 2026-10-21: "/ can list all module related tasks").
    supabase.from("school_items").select("id, title").eq("household_id", householdId).in("status", ["pending", "in_progress"]).order("due_at", { ascending: true, nullsFirst: false }).limit(15),
    supabase.from("home_assets").select("id, name").eq("household_id", householdId).eq("status", "active").order("name", { ascending: true }).limit(15),
  ]);
  const rows = <T,>(result: { data: T[] | null; error: unknown }) => (result.error ? [] : (result.data ?? []));
  return [
    ...rows(bills as { data: { id: string; name: string }[] | null; error: unknown }).map((row) => ({ kind: "bill" as const, id: row.id, label: row.name })),
    ...rows(meals as { data: { id: string; name: string }[] | null; error: unknown }).map((row) => ({ kind: "meal" as const, id: row.id, label: row.name })),
    ...rows(events as { data: { id: string; title: string }[] | null; error: unknown }).map((row) => ({ kind: "event" as const, id: row.id, label: row.title })),
    ...rows(groceries as { data: { id: string; name: string }[] | null; error: unknown }).map((row) => ({ kind: "grocery" as const, id: row.id, label: row.name })),
    ...rows(school as { data: { id: string; title: string }[] | null; error: unknown }).map((row) => ({ kind: "school" as const, id: row.id, label: row.title })),
    ...rows(home as { data: { id: string; name: string }[] | null; error: unknown }).map((row) => ({ kind: "home" as const, id: row.id, label: row.name })),
  ];
}

export async function sendMessage(
  supabase: SupabaseClient,
  input: { threadId: string; householdId: string; authorMemberId: string; body: unknown; link: ChatLink | null },
): Promise<string> {
  const body = cleanBody(input.body);
  if (!body) throw ApiError.badRequest("Write something first.");
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: input.threadId,
      household_id: input.householdId,
      author_member_id: input.authorMemberId,
      body,
      link_kind: input.link?.kind ?? null,
      link_path: input.link?.path ?? null,
      link_label: input.link?.label ?? null,
    })
    .select("id")
    .single();
  if (error) refused(error, "sendMessage");
  return (data as { id: string }).id;
}

/** Changes a message's words; RLS lets only its writer do it, and only while it stands. */
export async function editMessage(supabase: SupabaseClient, messageId: string, bodyValue: unknown): Promise<boolean> {
  const body = cleanBody(bodyValue);
  if (!body) throw ApiError.badRequest("Write something first.");
  const { data, error } = await supabase
    .from("chat_messages")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .is("removed_at", null)
    .select("id");
  if (error) refused(error, "editMessage");
  return ((data as unknown[] | null) ?? []).length === 1;
}

/** Takes a message back. Its row stays, so the thread's history does not move. */
export async function takeBackMessage(supabase: SupabaseClient, messageId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("chat_messages")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", messageId)
    .is("removed_at", null)
    .select("id");
  if (error) refused(error, "takeBackMessage");
  return ((data as unknown[] | null) ?? []).length === 1;
}

/**
 * The messages from the last few days that carry a #tag, as this member's
 * session reads them, so a tag in a chat they are not in never counts for
 * them (Home's "Trending at home", the owner, 2026-10-21). Bounded.
 */
export async function recentTaggedMessages(supabase: SupabaseClient, householdId: string, days: number, now: Date = new Date()): Promise<{ threadId: string; body: string; createdAt: string }[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const { data, error } = await supabase
    .from("chat_messages")
    .select("thread_id, body, created_at")
    .eq("household_id", householdId)
    .is("removed_at", null)
    .gte("created_at", since.toISOString())
    .like("body", "%#%")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return [];
  return (data ?? []).map((row) => ({ threadId: row.thread_id as string, body: row.body as string, createdAt: row.created_at as string }));
}
