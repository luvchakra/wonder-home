import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { log } from "../observability/logger";
import { bareAddress } from "./addresses";
import { enqueueClassifyRetry } from "./retry-queue";

/**
 * Email from outside the household is trusted once (the owner, 2026-11-14;
 * plan "Nothing stuck in review", decision 5).
 *
 * Mail to a household's HomeSend address from a sender nobody has approved
 * used to be dropped unread. Now, on "Ask once" (`record-first.ts`), the first
 * item from a new sender is kept but set aside: archived with reason
 * `new_sender`, its text never read by a model and its attachments never
 * fetched, and the household is asked once, through the "Needs you" list:
 * "New sender: x@y. Trust it from now on?"
 *
 * - **Trust**: the sender joins the household's allowlist (the one gate the
 *   webhook already asks, `email-allowlist.ts`), and what it sent is read
 *   like anything else. From then on its items flow like a member's
 *   (`confirmation.ts` `trustedSender`); their content stays untrusted
 *   (`injection.ts`).
 * - **Not ours**: its items are set aside (`sender_blocked`) and later mail
 *   from it is dropped before it is stored, as before.
 * - **No answer in 3 days**: its items are set aside (`sender_not_answered`).
 *   A later email asks again, once.
 *
 * Every row is the server's: the webhook writes it with the service client,
 * and an answer is applied only after the caller checked the person is an
 * Admin. Paying, approving and permission never come from a sender.
 */

export const SENDER_TRUST_DAYS = 3;

/** An address inside a LIKE pattern matches itself only: `_` and `%` are literal. */
function likeEscaped(address: string): string {
  return address.replace(/[\\%_]/g, (character) => `\\${character}`);
}
const DAY_MS = 86_400_000;

export type SenderState = "pending" | "trusted" | "blocked" | "not_answered";

export type SenderRow = {
  id: string;
  household_id: string;
  address: string;
  state: SenderState;
  first_item_id: string | null;
  held_count: number;
  asked_at: string;
};

/**
 * One entry of part A's "Needs you" list. The shape is the one agreed for
 * every source: a question, tap answers, the default that applies on its own
 * at the deadline, and who is asked.
 */
export type NeedsYouEntry = {
  id: string;
  kind: "sender_trust";
  householdId: string;
  /** Words as catalog keys, so each reader has them in their own language. */
  question: { key: "homesend.sender.question"; params: { address: string } };
  answers: { key: SenderAnswer; label: "homesend.sender.trust" | "homesend.sender.notOurs" }[];
  /** What happens when nobody answers by `deadline`: set aside, never trusted. */
  defaultAnswer: "set_aside";
  defaultWords: "homesend.sender.default";
  deadline: string;
  /** The household's Admins decide who the household trusts. */
  recipients: "admins";
  /** How consequential, for ordering the list: an unknown sender is low. */
  weight: number;
  heldItems: number;
};

export type SenderAnswer = "trust" | "not_ours";

/** What the webhook does with mail from this sender, for one household. */
export type SenderVerdict = "read" | "hold" | "drop";

/**
 * Pure: on the allowlist it is read; on "Ask once", a sender not blocked is
 * held (a first one is asked about); otherwise it is dropped, as before.
 */
export function senderVerdict(input: { allowlisted: boolean; mode: "ask_once" | "review"; state: SenderState | null }): SenderVerdict {
  if (input.allowlisted) return "read";
  if (input.mode !== "ask_once") return "drop";
  if (input.state === "blocked") return "drop";
  return "hold";
}

export function deadlineOf(row: Pick<SenderRow, "asked_at">): Date {
  return new Date(new Date(row.asked_at).getTime() + SENDER_TRUST_DAYS * DAY_MS);
}

/** The open questions, one per pending sender, oldest first; past their deadline they are not asked. */
export function senderTrustNeeds(rows: readonly SenderRow[], now: Date): NeedsYouEntry[] {
  return rows
    .filter((row) => row.state === "pending" && deadlineOf(row).getTime() > now.getTime())
    .sort((a, b) => a.asked_at.localeCompare(b.asked_at))
    .map((row) => ({
      id: `sender_trust:${row.id}`,
      kind: "sender_trust" as const,
      householdId: row.household_id,
      question: { key: "homesend.sender.question" as const, params: { address: row.address } },
      answers: [
        { key: "trust" as const, label: "homesend.sender.trust" as const },
        { key: "not_ours" as const, label: "homesend.sender.notOurs" as const },
      ],
      defaultAnswer: "set_aside" as const,
      defaultWords: "homesend.sender.default" as const,
      deadline: deadlineOf(row).toISOString(),
      recipients: "admins" as const,
      weight: 1,
      heldItems: row.held_count,
    }));
}

/** The pending senders of one household, bounded, for the "Needs you" list. */
export async function listPendingSenders(supabase: SupabaseClient, householdId: string): Promise<SenderRow[]> {
  const { data, error } = await supabase
    .from("homesend_email_senders")
    .select("id, household_id, address, state, first_item_id, held_count, asked_at")
    .eq("household_id", householdId)
    .eq("state", "pending")
    .order("asked_at", { ascending: true })
    .limit(20);
  if (error || !data) return [];
  return data as SenderRow[];
}

/** Each recipient household's state for this sender; an unreadable table (before the migration) reads as "no state". */
export async function senderStates(admin: SupabaseClient, households: readonly string[], from: string): Promise<Map<string, SenderState> | null> {
  const address = bareAddress(from)?.toLowerCase();
  if (!address || households.length === 0) return new Map();
  const { data, error } = await admin.from("homesend_email_senders").select("household_id, state").eq("address", address).in("household_id", households as string[]).limit(50);
  if (error) return null;
  return new Map(((data ?? []) as { household_id: string; state: SenderState }[]).map((row) => [row.household_id, row.state]));
}

/**
 * Sets one item from a sender nobody trusts aside and makes sure the
 * household is asked about the sender, once. Returns false when it could not
 * (before the migration): the caller then drops the item, as before.
 */
export async function holdFromNewSender(admin: SupabaseClient, input: { householdId: string; from: string; itemId: string; now?: Date }): Promise<boolean> {
  const now = input.now ?? new Date();
  const address = bareAddress(input.from)?.toLowerCase();
  if (!address) return false;
  const { error: archiveError } = await admin
    .from("home_send_items")
    .update({ status: "archived", archived_from: "received", archived_at: now.toISOString(), archive_reason: "new_sender" })
    .eq("id", input.itemId)
    .eq("household_id", input.householdId)
    .eq("status", "received");
  if (archiveError) return false;

  const { data: existing } = await admin.from("homesend_email_senders").select("id, state, held_count").eq("household_id", input.householdId).eq("address", address).maybeSingle();
  if (!existing) {
    const { error } = await admin.from("homesend_email_senders").insert({ household_id: input.householdId, address, state: "pending", first_item_id: input.itemId, held_count: 1, asked_at: now.toISOString() });
    if (error) return false;
  } else if (existing.state === "pending") {
    await admin.from("homesend_email_senders").update({ held_count: (existing.held_count as number) + 1 }).eq("id", existing.id as string);
  } else {
    // Not answered last time: ask again, once, about this new mail.
    await admin.from("homesend_email_senders").update({ state: "pending", held_count: 1, first_item_id: input.itemId, asked_at: now.toISOString(), decided_at: null, decided_by_member_id: null }).eq("id", existing.id as string);
  }
  await auditChange({ householdId: input.householdId, actorMemberId: null, eventType: "homesend.sender_held", targetTable: "home_send_items", targetId: input.itemId, metadata: { reason: "new_sender" } }).catch(() => undefined);
  return true;
}

/**
 * An Admin's answer about a sender. The caller has already checked the
 * person is an Admin of this household; this writes with the service client.
 */
export async function answerSenderTrust(
  admin: SupabaseClient,
  input: { householdId: string; senderId: string; answer: SenderAnswer; actorMemberId: string; now?: Date },
): Promise<{ ok: true; released: number } | { ok: false; reason: "not_found" | "already_answered" }> {
  const now = input.now ?? new Date();
  const { data: sender } = await admin.from("homesend_email_senders").select("id, address, state").eq("id", input.senderId).eq("household_id", input.householdId).maybeSingle();
  if (!sender) return { ok: false, reason: "not_found" };
  if (sender.state !== "pending" && sender.state !== "not_answered") return { ok: false, reason: "already_answered" };
  const address = sender.address as string;

  const { data: claimed } = await admin
    .from("homesend_email_senders")
    .update({ state: input.answer === "trust" ? "trusted" : "blocked", decided_at: now.toISOString(), decided_by_member_id: input.actorMemberId })
    .eq("id", input.senderId)
    .eq("state", sender.state as string)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, reason: "already_answered" };

  const held = await admin
    .from("home_send_items")
    .select("id")
    .eq("household_id", input.householdId)
    .eq("status", "archived")
    .in("archive_reason", ["new_sender", "sender_not_answered"])
    .ilike("sender_address", `%${likeEscaped(address)}%`)
    .limit(50);
  const itemIds = ((held.data ?? []) as { id: string }[]).map((row) => row.id);

  let released = 0;
  if (input.answer === "trust") {
    // The one gate the webhook asks: from now on this sender is read.
    await admin.from("homesend_email_allowlist").upsert({ household_id: input.householdId, kind: "address", value: address, created_by_member_id: input.actorMemberId }, { onConflict: "household_id,kind,value", ignoreDuplicates: true });
    for (const itemId of itemIds) {
      const { data: back } = await admin.from("home_send_items").update({ status: "received", archived_from: null, archived_at: null }).eq("id", itemId).eq("household_id", input.householdId).eq("status", "archived").select("id").maybeSingle();
      if (!back) continue;
      released += 1;
      // Read through the same understanding step as everything else, on the job queue.
      await enqueueClassifyRetry(admin, { householdId: input.householdId, itemId, now }).catch(() => false);
    }
  } else if (itemIds.length > 0) {
    await admin.from("home_send_items").update({ archive_reason: "sender_blocked" }).in("id", itemIds).eq("household_id", input.householdId).eq("status", "archived");
  }
  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    eventType: input.answer === "trust" ? "homesend.sender_trusted" : "homesend.sender_blocked",
    targetTable: "homesend_email_senders",
    targetId: input.senderId,
    metadata: { items: itemIds.length },
  }).catch(() => undefined);
  return { ok: true, released };
}

/** Senders nobody answered about in 3 days: their items are set aside. Bounded; never trusts anyone. */
export async function expireUnansweredSenders(admin: SupabaseClient, now: Date = new Date(), limit = 100): Promise<number> {
  try {
    const { data } = await admin
      .from("homesend_email_senders")
      .select("id, household_id, address")
      .eq("state", "pending")
      .lte("asked_at", new Date(now.getTime() - SENDER_TRUST_DAYS * DAY_MS).toISOString())
      .limit(limit);
    let expired = 0;
    for (const row of (data ?? []) as { id: string; household_id: string; address: string }[]) {
      const { data: closed } = await admin.from("homesend_email_senders").update({ state: "not_answered", decided_at: now.toISOString() }).eq("id", row.id).eq("state", "pending").select("id").maybeSingle();
      if (!closed) continue;
      expired += 1;
      await admin
        .from("home_send_items")
        .update({ archive_reason: "sender_not_answered" })
        .eq("household_id", row.household_id)
        .eq("status", "archived")
        .eq("archive_reason", "new_sender")
        .ilike("sender_address", `%${likeEscaped(row.address)}%`);
    }
    return expired;
  } catch (thrown) {
    log.warn("sender trust expiry failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
    return 0;
  }
}
