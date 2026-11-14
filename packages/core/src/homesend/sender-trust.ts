import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { askNeedsYou } from "../hometalk/needs-you-repository";
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
 * fetched, and the household's Admins are asked once, on the "Needs you"
 * list (`hometalk/needs-you-repository.ts`, source `sender_trust`):
 * "New sender: x@y. Trust it from now on?"
 *
 * - **Trust**: the sender joins the household's allowlist (the one gate the
 *   webhook already asks, `email-allowlist.ts`), and what it sent is read
 *   like anything else. From then on its items flow like a member's
 *   (`confirmation.ts` `trustedSender`); their content stays untrusted
 *   (`injection.ts`).
 * - **Not ours**: its items are set aside (`sender_blocked`) and later mail
 *   from it is dropped before it is stored, as before.
 * - **No answer**: the list's default (after 24 hours, decision 4) sets its
 *   items aside (`sender_not_answered`); a 48-hour sweep is the backstop for
 *   a question the list couldn't take. A later email asks again, once.
 *
 * Every row is the server's: the webhook writes it with the service client,
 * and a person's answer is applied only after the caller checked they are an
 * Admin. A default never trusts anyone. Paying, approving and permission
 * never come from a sender.
 */

/** The plan said 3 days; decision 4 caps every question at 48 hours, so that is the backstop. */
export const SENDER_TRUST_HOURS = 48;
const HOUR_MS = 3_600_000;

/** The "Needs you" source for this question (part A's list). */
export const SENDER_TRUST_SOURCE = "sender_trust";

/** An address inside a LIKE pattern matches itself only: `_` and `%` are literal. */
function likeEscaped(address: string): string {
  return address.replace(/[\\%_]/g, (character) => `\\${character}`);
}

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

/** When the backstop sweep sets a still-pending sender's mail aside. */
export function deadlineOf(row: Pick<SenderRow, "asked_at">): Date {
  return new Date(new Date(row.asked_at).getTime() + SENDER_TRUST_HOURS * HOUR_MS);
}

/**
 * The question as one "Needs you" row: to the Admins (recipient null), Trust
 * or Not ours, and "set aside" as the default the list applies after 24 hours.
 */
export function senderQuestion(input: { householdId: string; senderId: string; address: string; askedAt: Date }) {
  return {
    householdId: input.householdId,
    source: SENDER_TRUST_SOURCE,
    subjectTable: "homesend_email_senders",
    subjectId: input.senderId,
    recipientMemberId: null,
    prompt: { code: "homesend.sender", title: input.address },
    answers: [{ value: "trust" }, { value: "not_ours" }],
    defaultAnswer: "set_aside",
    consequence: 1 as const,
    dueOn: null,
    askedAt: input.askedAt,
  };
}

/** Puts the question on the household's "Needs you" list; best-effort (the 48-hour sweep still sets the mail aside). */
async function ask(admin: SupabaseClient, input: { householdId: string; senderId: string; address: string; askedAt: Date }): Promise<void> {
  try {
    await askNeedsYou(admin, senderQuestion(input));
  } catch (thrown) {
    log.warn("sender question not added to Needs you", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
  }
}

/**
 * The list's answer or default (`hometalk/needs-you-answer.ts`). A tap comes
 * with a service client only after the caller checked the person is an Admin;
 * the default runs on the list's own clock. False when it was already settled.
 */
export async function applySenderTrustAnswer(
  admin: SupabaseClient,
  householdId: string,
  senderId: string,
  answer: string,
  how: { byDefault: boolean; memberId: string | null; now: Date },
): Promise<boolean> {
  if (answer === "trust" || answer === "not_ours") {
    // A default never trusts anyone; only a person's tap does.
    if (how.byDefault || !how.memberId) return false;
    const result = await answerSenderTrust(admin, { householdId, senderId, answer, actorMemberId: how.memberId, now: how.now });
    return result.ok;
  }
  return (await setAsideSender(admin, { householdId, senderId, now: how.now })) > 0;
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
    const { data: created, error } = await admin.from("homesend_email_senders").insert({ household_id: input.householdId, address, state: "pending", first_item_id: input.itemId, held_count: 1, asked_at: now.toISOString() }).select("id").single();
    if (error || !created) return false;
    await ask(admin, { householdId: input.householdId, senderId: created.id as string, address, askedAt: now });
  } else if (existing.state === "pending") {
    // Already asked: the one open question stands.
    await admin.from("homesend_email_senders").update({ held_count: (existing.held_count as number) + 1 }).eq("id", existing.id as string);
  } else {
    // Not answered last time: ask again, once, about this new mail.
    await admin.from("homesend_email_senders").update({ state: "pending", held_count: 1, first_item_id: input.itemId, asked_at: now.toISOString(), decided_at: null, decided_by_member_id: null }).eq("id", existing.id as string);
    await ask(admin, { householdId: input.householdId, senderId: existing.id as string, address, askedAt: now });
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

/** Sets one pending sender's held mail aside (no answer in time). Never trusts anyone. 1 when it was still pending. */
async function setAsideSender(admin: SupabaseClient, input: { householdId: string; senderId: string; now: Date }): Promise<number> {
  const { data: closed } = await admin
    .from("homesend_email_senders")
    .update({ state: "not_answered", decided_at: input.now.toISOString() })
    .eq("id", input.senderId)
    .eq("household_id", input.householdId)
    .eq("state", "pending")
    .select("address")
    .maybeSingle();
  if (!closed) return 0;
  await admin
    .from("home_send_items")
    .update({ archive_reason: "sender_not_answered" })
    .eq("household_id", input.householdId)
    .eq("status", "archived")
    .eq("archive_reason", "new_sender")
    .ilike("sender_address", `%${likeEscaped(closed.address as string)}%`);
  return 1;
}

/** The backstop: a pending sender past 48 hours (its question never reached the list) is set aside. Bounded. */
export async function expireUnansweredSenders(admin: SupabaseClient, now: Date = new Date(), limit = 100): Promise<number> {
  try {
    const { data } = await admin
      .from("homesend_email_senders")
      .select("id, household_id")
      .eq("state", "pending")
      .lte("asked_at", new Date(now.getTime() - SENDER_TRUST_HOURS * HOUR_MS).toISOString())
      .limit(limit);
    let expired = 0;
    for (const row of (data ?? []) as { id: string; household_id: string }[]) {
      expired += await setAsideSender(admin, { householdId: row.household_id, senderId: row.id, now });
    }
    return expired;
  } catch (thrown) {
    log.warn("sender trust expiry failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
    return 0;
  }
}
