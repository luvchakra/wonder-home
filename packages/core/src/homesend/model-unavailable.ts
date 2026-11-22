import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import type { IntakeUnderstanding } from "../homebrain/intake-api";

/**
 * The assistant never quietly runs without its model (2026-11-21).
 *
 * The owner's exam timetable came back "I couldn't tell what it's about"
 * because Anthropic had been refusing WonderHome's key for six days: no model
 * read it at all, and the rules' fallback spoke as if the photo were unclear.
 * Something sent while the provider refuses the key or can't be reached is
 * now kept as failed with the reason `model_unavailable`:
 *
 *   - the sender is told the truth ("I can't read it right now, and I'll read
 *     it as soon as I can and tell you what I did");
 *   - no 24 h / 48 h deadline and no Needs-you question starts for it
 *     (`deadlines.ts` waits, the tidy keeps it);
 *   - it is read again on the job queue (`retry-queue.ts`, the item's own
 *     dedupe key, the queue's exponential backoff capped at an hour, at most
 *     `MODEL_READ_MAX_ATTEMPTS`), off the request path, until a model reads it;
 *   - once read it goes through the normal record-first path and the sender is
 *     told what was done, once, on the channel it came from (`AfterModelRead`).
 *
 * `queueModelReads` is the clock's sweep: it queues any such item without a
 * job, gives items from the last 14 days that the rules alone answered as
 * "unknown" while no model was reachable the same retry (product behaviour,
 * not a one-off script), and after 14 days lets one go the ordinary way.
 */

export const MODEL_READ_WINDOW_DAYS = 14;
/** The queue's backoff is 15 s × 2^n, at most an hour: a few quick tries, then hourly for about 14 days. */
export const MODEL_READ_MAX_ATTEMPTS = 340;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Marks an item as kept but not read for want of a model. False when the
 * database doesn't know the reason yet (migration 20261121020000 not applied):
 * the caller then keeps its old "unknown" reading, so either order is safe.
 */
export async function recordModelUnavailable(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  extra: { rawText?: string | null; understanding?: IntakeUnderstanding | null } = {},
  /** Since 2026-11-21 also `output_rejected` (a reading in a shape WonderHome couldn't use) and `unreadable` (a model declined). */
  reason: "model_unavailable" | "output_rejected" | "unreadable" = "model_unavailable",
): Promise<boolean> {
  const update: Record<string, unknown> = { status: "failed", failure_reason: reason };
  if (extra.rawText) update.raw_text = extra.rawText;
  if (extra.understanding) update.understanding = extra.understanding;
  const { error } = await supabase.from("home_send_items").update(update).eq("household_id", householdId).eq("id", itemId);
  if (!error) return true;
  // The database doesn't know the newer reason yet: a rejected reading is read again the ordinary way.
  if (error.code === "23514" && reason === "output_rejected") return recordModelUnavailable(supabase, householdId, itemId, extra, "unreadable");
  if (error.code !== "23514") log.warn("homesend: model_unavailable not recorded", { reason: error.code ?? "unknown", allow: ["reason"] });
  return false;
}

/**
 * The rules-only signature: an item read without any model (classify gave
 * nothing back) is classified as `unknown` with an empty reading. A model's
 * own "unreadable" verdict is stored as failed/unreadable instead, so it is
 * never mistaken for this.
 */
export function readByRulesOnly(row: { status: string; classified_kind: string | null; understanding: unknown }): boolean {
  if (row.classified_kind !== "unknown") return false;
  const understanding = row.understanding as { readable?: unknown; contentSummary?: unknown; facts?: unknown } | null;
  if (!understanding || understanding.readable !== false) return false;
  const summary = typeof understanding.contentSummary === "string" ? understanding.contentSummary.trim() : "";
  const facts = Array.isArray(understanding.facts) ? understanding.facts.length : 0;
  return summary === "" && facts === 0;
}

export type ModelReadSweep = { marked: number; queued: number; expired: number };

/**
 * The clock's sweep. Bounded: `limit` rows of each kind per pass, the last
 * 14 days only. Idempotent: an item already queued keeps its one job (the
 * queue's dedupe index), and a marked item is not marked again.
 */
export async function queueModelReads(
  admin: SupabaseClient,
  input: { now?: Date; limit?: number; queue?: (householdId: string, itemId: string, now: Date) => Promise<boolean> } = {},
): Promise<ModelReadSweep> {
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const since = new Date(now.getTime() - MODEL_READ_WINDOW_DAYS * DAY_MS).toISOString();
  const queue = input.queue ?? ((householdId: string, itemId: string, at: Date) => queueModelRead(admin, { householdId, itemId, now: at }));
  const result: ModelReadSweep = { marked: 0, queued: 0, expired: 0 };

  // 1. Answered by the rules alone and handled by nobody: still waiting, or set aside by a rule (never by a person).
  const { data: candidates } = await admin
    .from("home_send_items")
    .select("id, household_id, status, classified_kind, understanding, archived_from, archive_reason")
    .gte("created_at", since)
    .eq("classified_kind", "unknown")
    .or("status.in.(received,classified),and(status.eq.archived,archive_reason.in.(unreadable,not_resent,kept_as_note))")
    .order("created_at", { ascending: false })
    .limit(limit);
  for (const row of (candidates ?? []) as { id: string; household_id: string; status: string; classified_kind: string | null; understanding: unknown; archived_from: string | null; archive_reason: string | null }[]) {
    if (!readByRulesOnly(row)) continue;
    if (row.status === "archived" && row.archived_from && !["received", "classified", "failed"].includes(row.archived_from)) continue;
    const { data: moved, error } = await admin
      .from("home_send_items")
      .update({ status: "failed", failure_reason: "model_unavailable", archived_at: null, archived_from: null })
      .eq("household_id", row.household_id)
      .eq("id", row.id)
      .eq("status", row.status)
      .select("id");
    if (error || (moved ?? []).length === 0) continue;
    result.marked += 1;
  }

  // 2. Every item kept for want of a model (or read in a shape WonderHome couldn't use), queued (once) to be read again.
  const { data: waiting } = await admin
    .from("home_send_items")
    .select("id, household_id, created_at, failure_reason, updated_at")
    .eq("status", "failed")
    .in("failure_reason", ["model_unavailable", "output_rejected"])
    .order("created_at", { ascending: false })
    .limit(limit);
  const rejectedSince = new Date(now.getTime() - DAY_MS).toISOString();
  for (const row of (waiting ?? []) as { id: string; household_id: string; created_at: string; failure_reason: string; updated_at: string }[]) {
    // A closer read that still gave nothing usable for a day: it goes the ordinary way, said plainly.
    if (row.failure_reason === "output_rejected" && row.created_at < rejectedSince) {
      const { error } = await admin.from("home_send_items").update({ failure_reason: "unreadable" }).eq("household_id", row.household_id).eq("id", row.id).eq("failure_reason", "output_rejected");
      if (!error) result.expired += 1;
      continue;
    }
    if (row.created_at < since) {
      // Fourteen days without a model: it goes the ordinary way (read again, asked once, or set aside with its reason).
      const { error } = await admin.from("home_send_items").update({ failure_reason: "unreadable" }).eq("household_id", row.household_id).eq("id", row.id).eq("failure_reason", row.failure_reason);
      if (!error) result.expired += 1;
      continue;
    }
    if (await queue(row.household_id, row.id, now).catch(() => false)) result.queued += 1;
  }
  return result;
}

/** Queues one item to be read again: the classify retry job, with room for a long outage. */
export async function queueModelRead(admin: SupabaseClient, input: { householdId: string; itemId: string; now?: Date; afterSeconds?: number }): Promise<boolean> {
  const { CLASSIFY_RETRY_KIND } = await import("./retry-queue");
  const runAfter = new Date((input.now ?? new Date()).getTime() + (input.afterSeconds ?? 60) * 1000).toISOString();
  const { error } = await admin.from("jobs").insert({
    household_id: input.householdId,
    kind: CLASSIFY_RETRY_KIND,
    payload: { itemId: input.itemId },
    dedupe_key: input.itemId,
    run_after: runAfter,
    max_attempts: MODEL_READ_MAX_ATTEMPTS,
  });
  if (error && error.code !== "23505") throw new Error(`queueModelRead failed: ${error.code ?? "unknown"}`);
  return !error;
}
