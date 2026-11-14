import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import type { NeedsYouItem } from "../hometalk/needs-you";
import { effectOf } from "./deadlines";

/**
 * What a HomeSend question's answer does — a person's tap or the default that
 * applies after 24 hours (2026-11-14, decision 4). One table (`effectOf`) for
 * both, so a default never does anything a person's tap couldn't.
 *
 *   - "Looks right" confirms the entry (by a person, or by default: audited
 *     `homesend.confirmed` with `how: "default"`); "keep Checking" closes the
 *     question and leaves a money or health entry Checking with its stated
 *     reason; "Not right" undoes it (the caller runs the same undo the
 *     HomeSend screen's Undo does).
 *   - "Keep as a note", "Set aside", "Keep what's on record": the item is
 *     archived with that reason — kept, restorable, never deleted.
 *
 * Every write is a compare-and-swap on the state it expects, so something a
 * person settled meanwhile is left as they left it (the result is "settled").
 */

type Row = Record<string, unknown>;

export type HomeSendAnswerResult = "done" | "settled" | "undo";

export async function applyHomeSendAnswer(
  client: SupabaseClient,
  item: Pick<NeedsYouItem, "householdId" | "source" | "subjectId">,
  answer: string,
  how: { byDefault: boolean; memberId: string | null; now: Date },
): Promise<HomeSendAnswerResult> {
  const effect = effectOf(item.source, answer, how.byDefault);
  const householdId = item.householdId;
  const by = how.byDefault ? "default" : "person";

  if (effect.effect === "undo") return "undo";
  if (effect.effect === "none") return "settled";

  if (effect.effect === "confirm") {
    const { data, error } = await client
      .from("homesend_changes")
      .update({ confirmation_state: "confirmed", confirmed_at: how.now.toISOString(), confirmed_by_member_id: how.byDefault ? null : how.memberId })
      .eq("household_id", householdId)
      .eq("intake_id", item.subjectId)
      .eq("confirmation_state", "unconfirmed")
      .is("undone_at", null)
      .select("id, domain, entity_id");
    if (error) throw new Error(`confirm failed: ${error.code ?? "unknown"}`);
    const rows = (data ?? []) as Row[];
    for (const row of rows) {
      await auditChange({
        householdId,
        actorMemberId: how.byDefault ? undefined : (how.memberId ?? undefined),
        eventType: "homesend.confirmed",
        targetTable: row.domain as string,
        targetId: row.entity_id as string,
        metadata: { intakeId: item.subjectId, how: by },
      });
    }
    if (rows.length > 0) await endChecking(client, householdId, item.subjectId, "confirmed");
    return rows.length > 0 ? "done" : "settled";
  }

  if (effect.effect === "keep_checking") {
    // The entry stays Checking, its reminders on and saying "check before paying"; HomeTalk stops asking.
    await endChecking(client, householdId, item.subjectId, "please_check");
    await auditChange({ householdId, eventType: "homesend.kept_checking", targetTable: "home_send_items", targetId: item.subjectId, metadata: { how: by } });
    return "done";
  }

  // Archive: the item, from wherever it waits, with its reason.
  const { data: rows, error: readError } = await client
    .from("home_send_items")
    .select("id, status, updated_at")
    .eq("household_id", householdId)
    .eq("id", item.subjectId)
    .in("status", ["received", "classified", "failed"])
    .limit(1);
  if (readError) throw new Error(`archive read failed: ${readError.code ?? "unknown"}`);
  const row = ((rows ?? []) as Row[])[0];
  if (!row) return "settled";
  const { data, error } = await client
    .from("home_send_items")
    .update({ status: "archived", archived_from: row.status, archived_at: how.now.toISOString(), archive_reason: effect.reason, retry_requested_at: null })
    .eq("household_id", householdId)
    .eq("id", item.subjectId)
    .eq("status", row.status as string)
    .eq("updated_at", row.updated_at as string)
    .select("id");
  if (error) throw new Error(`archive failed: ${error.code ?? "unknown"}`);
  if ((data ?? []).length === 0) return "settled";
  await auditChange({
    householdId,
    actorMemberId: how.byDefault ? undefined : (how.memberId ?? undefined),
    eventType: "homesend.auto_archived",
    targetTable: "home_send_items",
    targetId: item.subjectId,
    metadata: { reason: effect.reason, by: how.byDefault ? "default" : "person", from: row.status, question: item.source },
  });
  return "done";
}

/** The item's Checking questions end ("confirmed" or "please_check"), so HomeTalk and WhatsApp stop asking. */
async function endChecking(client: SupabaseClient, householdId: string, itemId: string, done: "confirmed" | "please_check"): Promise<void> {
  const { data } = await client.from("home_send_items").select("understanding, updated_at").eq("household_id", householdId).eq("id", itemId).maybeSingle();
  const understanding = (data?.understanding as Record<string, unknown> | null) ?? null;
  const checking = understanding?.checking as Record<string, unknown> | null | undefined;
  if (!understanding || !checking || checking.done) return;
  await client
    .from("home_send_items")
    .update({ understanding: { ...understanding, checking: { ...checking, open: null, done } } })
    .eq("household_id", householdId)
    .eq("id", itemId)
    .eq("updated_at", data!.updated_at as string);
}
