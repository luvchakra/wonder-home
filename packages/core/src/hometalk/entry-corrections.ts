import type { SupabaseClient } from "@supabase/supabase-js";

import type { PersonLike } from "../context/builders";
import { amountOf, type PlainCorrection } from "../conversation/plain-corrections";
import { recordCorrectionEvidence, type CorrectionEvidence } from "../evaluation/evidence";
import { confirmHomeSendEntry } from "../homesend/changes";
import type { DetailField } from "../homesend/completeness";
import { detectInstructionInjection } from "../homesend/injection";
import type { HomeSendKind } from "../homesend/items";
import { learnFromCorrection } from "../homebrain/rules-repository";
import { log } from "../observability/logger";
import { applyHomeSendPatch, type ItemRow } from "./checking-questions";
import { readDetailAnswer } from "./detail-answers";

/**
 * A plain correction of the speaker's most recent matching HomeSend entry
 * (the owner, 2026-11-14; `conversation/plain-corrections.ts`): "No, it's on
 * the 12th", "That's for Kabir, not Meera", "The amount is 1,240".
 *
 * - Which entry: the newest one the speaker sent in during the last two days
 *   that has the field being corrected (a date, a child, an amount) and, for
 *   "not Meera", is filed under Meera now. Nobody else's entry is touched.
 * - How: the same in-place write a Checking answer uses (`applyHomeSendPatch`,
 *   the domain's own update), so it is attributed and audited; the reading on
 *   the item is updated too, and the old value is kept for Undo.
 * - After: a person just checked it, so a Checking entry is confirmed; the
 *   change is kept as evidence (`ai_corrections`), and HomeBrain learns from
 *   it (`learnFromCorrection`: the change is marked corrected, which feeds
 *   that kind's bar, and a rule is kept only where one is safe).
 * - Never: a payment, an approval or a permission. Instructions in the words
 *   are not followed (`injection.ts`).
 */

export const CORRECTION_WINDOW_HOURS = 48;

type Field = PlainCorrection["field"];

/** Which reading field and detail a correction changes, for each kind it fits. */
const FIELDS: Record<Field, Partial<Record<HomeSendKind, { detail: DetailField; reading: string }>>> = {
  date: {
    bill: { detail: "dueDate", reading: "dueDate" },
    school_item: { detail: "dueDate", reading: "dueDate" },
    activity_item: { detail: "date", reading: "dueDate" },
    health_document: { detail: "date", reading: "documentDate" },
  },
  amount: {
    bill: { detail: "amount", reading: "amount" },
  },
  person: {
    school_item: { detail: "child", reading: "subjectMemberId" },
    activity_item: { detail: "child", reading: "subjectMemberId" },
  },
};

export type EntryCorrection = {
  itemId: string;
  kind: HomeSendKind;
  title: string;
  field: Field;
  /** The reading's values before and after, for Undo and the reply. */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  confirmed: boolean;
};

/** Undo record of a correction: enough to put the old value back through the same write. */
export type EntryCorrectionUndo = { itemId: string; field: Field; before: Record<string, unknown> };

function sameName(person: PersonLike, name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return [person.displayName, person.nickname].some((value) => typeof value === "string" && value.trim().toLowerCase() === wanted);
}

/** The new value as the reading holds it, or null when the words don't give one for this kind. */
export function patchFor(
  correction: PlainCorrection,
  kind: HomeSendKind,
  people: readonly PersonLike[],
  context: { timezone: string; now: Date },
): Record<string, unknown> | null {
  const spec = FIELDS[correction.field][kind];
  if (!spec) return null;
  if (correction.field === "person") {
    const matches = people.filter((person) => sameName(person, correction.to));
    // One person by that name, or nothing: never a guess between two.
    if (matches.length !== 1) return null;
    return { subjectMemberId: matches[0]!.id, subjectMemberName: matches[0]!.displayName };
  }
  if (correction.field === "amount") {
    const amount = amountOf(correction.text);
    return amount === null ? null : { amount };
  }
  const read = readDetailAnswer(kind, spec.detail, correction.text, context);
  if (!read || read === "skip") return null;
  const value = (read as Record<string, unknown>)[spec.reading];
  return typeof value === "string" ? { [spec.reading]: value } : null;
}

type RecentRow = ItemRow & { updated_at: string; sender_address?: string | null };

/**
 * Applies a plain correction to the speaker's most recent matching entry.
 * Null when nothing of theirs fits: the turn is read as anything else would be.
 */
export async function correctRecentEntry(
  client: SupabaseClient,
  input: {
    householdId: string;
    actorMemberId: string;
    people: readonly PersonLike[];
    correction: PlainCorrection;
    utterance: string;
    timezone: string;
    now: Date;
    /** The server's client, for the evidence row (written by the server only). */
    admin?: SupabaseClient;
  },
): Promise<EntryCorrection | null> {
  if (detectInstructionInjection(input.utterance).flagged) return null;
  const since = new Date(input.now.getTime() - CORRECTION_WINDOW_HOURS * 3_600_000).toISOString();
  const kinds = Object.keys(FIELDS[input.correction.field]);
  const { data, error } = await client
    .from("home_send_items")
    .select("id, status, classified_kind, extracted, understanding, routed_table, routed_id, created_by_member_id, updated_at, sender_address")
    .eq("household_id", input.householdId)
    .eq("created_by_member_id", input.actorMemberId)
    .eq("status", "routed")
    .in("classified_kind", kinds)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error || !data) return null;

  for (const item of data as RecentRow[]) {
    const kind = item.classified_kind;
    if (!kind) continue;
    const spec = FIELDS[input.correction.field][kind];
    if (!spec) continue;
    const extracted = item.extracted ?? {};
    // "not Meera": only an entry filed under Meera now.
    if (input.correction.field === "person" && input.correction.from) {
      const from = input.correction.from;
      const current = input.people.find((person) => person.id === extracted.subjectMemberId);
      if (!(current && sameName(current, from)) && String(extracted.subjectMemberName ?? "").toLowerCase() !== from.toLowerCase()) continue;
    }
    const patch = patchFor(input.correction, kind, input.people, { timezone: input.timezone, now: input.now });
    if (!patch) continue;
    const before: Record<string, unknown> = Object.fromEntries(Object.keys(patch).map((key) => [key, extracted[key] ?? null]));
    // Already so: not a correction of this one.
    if (Object.keys(patch).every((key) => before[key] === patch[key])) continue;

    const applied = await applyHomeSendPatch(client, { householdId: input.householdId, actorMemberId: input.actorMemberId, item, field: spec.detail, patch, timezone: input.timezone });
    if (!applied) continue;
    await client.from("home_send_items").update({ extracted: { ...extracted, ...patch } }).eq("household_id", input.householdId).eq("id", item.id);
    // A person just checked it: a Checking entry is confirmed.
    const confirmed = (await confirmHomeSendEntry(client, input.householdId, item.id, { memberId: input.actorMemberId, how: "person" }).catch(() => 0)) > 0;
    await recordSignal(input.admin, { householdId: input.householdId, itemId: item.id, memberId: input.actorMemberId, field: input.correction.field, before, after: patch });
    // HomeBrain learns the household's rule from it, where one is safe (part C, `homebrain/rules-repository.ts`; a date or amount teaches no rule).
    await teach(client, { householdId: input.householdId, memberId: input.actorMemberId, kind, itemId: item.id, sender: item.sender_address ?? null, correction: input.correction, patch });
    return { itemId: item.id, kind, title: typeof extracted.title === "string" ? extracted.title : "it", field: input.correction.field, before, after: patch, confirmed };
  }
  return null;
}

/** Undo: the old value back through the same write. */
export async function undoEntryCorrection(
  client: SupabaseClient,
  input: { householdId: string; actorMemberId: string; undo: EntryCorrectionUndo; timezone: string },
): Promise<boolean> {
  const { data } = await client
    .from("home_send_items")
    .select("id, status, classified_kind, extracted, understanding, routed_table, routed_id, created_by_member_id")
    .eq("household_id", input.householdId)
    .eq("id", input.undo.itemId)
    .maybeSingle();
  const item = data as ItemRow | null;
  if (!item?.classified_kind || item.created_by_member_id !== input.actorMemberId) return false;
  const spec = FIELDS[input.undo.field][item.classified_kind];
  if (!spec) return false;
  const restorable = Object.fromEntries(Object.entries(input.undo.before).filter(([, value]) => value !== null));
  if (Object.keys(restorable).length === 0) return false;
  const applied = await applyHomeSendPatch(client, { householdId: input.householdId, actorMemberId: input.actorMemberId, item, field: spec.detail, patch: restorable, timezone: input.timezone });
  if (!applied) return false;
  await client.from("home_send_items").update({ extracted: { ...(item.extracted ?? {}), ...input.undo.before } }).eq("household_id", input.householdId).eq("id", item.id);
  return true;
}

/** The correction as HomeBrain's lesson; it marks the change corrected (raising that kind's bar) and never throws. */
async function teach(
  client: SupabaseClient,
  input: { householdId: string; memberId: string; kind: HomeSendKind; itemId: string; sender: string | null; correction: PlainCorrection; patch: Record<string, unknown> },
): Promise<void> {
  try {
    const { data: change } = await client.from("homesend_changes").select("id").eq("household_id", input.householdId).eq("intake_id", input.itemId).is("undone_at", null).limit(1).maybeSingle();
    const to =
      input.correction.field === "person"
        ? { memberId: typeof input.patch.subjectMemberId === "string" ? input.patch.subjectMemberId : null, memberType: "child" }
        : { text: String(Object.values(input.patch)[0] ?? "") };
    await learnFromCorrection(client, {
      householdId: input.householdId,
      memberId: input.memberId,
      kind: input.kind,
      field: input.correction.field,
      to,
      sender: input.sender,
      itemId: input.itemId,
      changeId: (change as { id?: string } | null)?.id ?? null,
    });
  } catch (thrown) {
    log.warn("correction lesson not kept", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
  }
}

const ERROR_TYPE: Record<Field, CorrectionEvidence["errorType"]> = { date: "wrong_date", amount: "wrong_amount", person: "false_entity_match" };

/** The learning signal part C reads: one `ai_corrections` row per corrected field. Best-effort. */
async function recordSignal(
  admin: SupabaseClient | undefined,
  input: { householdId: string; itemId: string; memberId: string; field: Field; before: Record<string, unknown>; after: Record<string, unknown> },
): Promise<void> {
  if (!admin) return;
  const key = Object.keys(input.after)[0]!;
  const value = (record: Record<string, unknown>) => (record[key] === null || record[key] === undefined ? null : String(record[key]).slice(0, 200));
  await recordCorrectionEvidence(admin, {
    householdId: input.householdId,
    surface: "homesend",
    sourceType: "home_send_item",
    sourceId: input.itemId,
    memberId: input.memberId,
    evidence: [{ field: input.field, modelValue: value(input.before), humanValue: value(input.after), errorType: ERROR_TYPE[input.field] }],
  }).catch((thrown) => log.warn("correction evidence not recorded", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] }));
}
