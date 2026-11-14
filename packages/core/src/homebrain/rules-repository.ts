import type { SupabaseClient } from "@supabase/supabase-js";

import type { HomeSendKind } from "../homesend/items";
import { lessonsFrom, mergeLesson, RULE_KINDS, type HouseholdRule, type Lesson, type RuleField, type RuleKind, type RuleSource } from "./rules";

/**
 * The household's rules (`rules.ts`) in `homesend_learned_defaults`, read and
 * written with the member's own client: RLS keeps each row to its household,
 * a row is written only as the member who taught it, a member value only
 * names someone of the same household, and only an Admin forgets one.
 *
 * Never throws on learning: a rule is a convenience, and failing to keep one
 * changes nothing about the entry itself. A missing column (before the
 * migration) reads as the 14-066 sender_child rows only.
 */

type Row = {
  id: string;
  kind: string;
  key: string;
  value_member_id: string | null;
  value_text?: string | null;
  learned_by_member_id: string | null;
  learned_from_item_id: string | null;
  learned_at: string;
  mixed: boolean | null;
  source?: string | null;
  times?: number | null;
};

const COLUMNS = "id, kind, key, value_member_id, value_text, learned_by_member_id, learned_from_item_id, learned_at, mixed, source, times";
const OLD_COLUMNS = "id, kind, key, value_member_id, learned_by_member_id, learned_from_item_id, learned_at, mixed";
/** A household learns tens of rules; this bound is far above any real one. */
const LIMIT = 500;

function toRule(row: Row): HouseholdRule | null {
  if (!(RULE_KINDS as readonly string[]).includes(row.kind)) return null;
  return {
    id: row.id,
    kind: row.kind as RuleKind,
    key: row.key,
    valueMemberId: row.value_member_id ?? null,
    valueText: row.value_text ?? null,
    learnedByMemberId: row.learned_by_member_id,
    learnedFromItemId: row.learned_from_item_id,
    learnedAt: row.learned_at,
    mixed: row.mixed === true,
    source: row.source === "pick" || row.source === "correction" ? row.source : "answer",
    times: typeof row.times === "number" && row.times > 0 ? row.times : 1,
  };
}

export async function listHouseholdRules(client: SupabaseClient, householdId: string): Promise<HouseholdRule[]> {
  const read = (columns: string) =>
    client.from("homesend_learned_defaults").select(columns).eq("household_id", householdId).order("learned_at", { ascending: false }).limit(LIMIT);
  let { data, error } = await read(COLUMNS);
  // Before the migration: the 14-066 columns only.
  if (error && /column/i.test(error.message ?? "")) ({ data, error } = await read(OLD_COLUMNS));
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toRule).filter((rule): rule is HouseholdRule => rule !== null);
}

/** Keeps one lesson, merging with what the key already says. Returns whether it was kept. */
export async function learnRule(
  client: SupabaseClient,
  input: { householdId: string; lesson: Lesson; learnedByMemberId: string; itemId?: string | null; source: RuleSource; now?: Date },
): Promise<boolean> {
  try {
    const { lesson } = input;
    const { data: before } = await client
      .from("homesend_learned_defaults")
      .select("value_member_id, value_text, mixed, times")
      .eq("household_id", input.householdId)
      .eq("kind", lesson.kind)
      .eq("key", lesson.key)
      .maybeSingle();
    const previous = before as { value_member_id: string | null; value_text: string | null; mixed: boolean | null; times: number | null } | null;
    const merged = mergeLesson(
      previous ? { valueMemberId: previous.value_member_id, valueText: previous.value_text, mixed: previous.mixed === true, times: previous.times ?? 1 } : null,
      lesson,
    );
    // A mixed rule keeps the first value it was taught (shown as "asked again"); the newest teacher is recorded.
    const keepValue = previous && merged.mixed ? { value_member_id: previous.value_member_id, value_text: previous.value_text } : { value_member_id: lesson.valueMemberId, value_text: lesson.valueText };
    const { error } = await client.from("homesend_learned_defaults").upsert(
      {
        household_id: input.householdId,
        kind: lesson.kind,
        key: lesson.key,
        ...keepValue,
        learned_by_member_id: input.learnedByMemberId,
        learned_from_item_id: input.itemId ?? null,
        learned_at: (input.now ?? new Date()).toISOString(),
        mixed: merged.mixed,
        source: input.source,
        times: merged.times,
      },
      { onConflict: "household_id,kind,key" },
    );
    return !error;
  } catch {
    return false;
  }
}

export type TeachInput = {
  householdId: string;
  /** Who answered, picked or corrected, as themselves. */
  memberId: string;
  kind: HomeSendKind | null;
  field: RuleField;
  to: { memberId?: string | null; memberType?: string | null; text?: string | null };
  sender?: string | null;
  vendor?: string | null;
  /** The words the item or place was named with ("atta", "nani's"). */
  phrase?: string | null;
  itemId?: string | null;
};

/** An answer to a question, or a pick from choices: every safe lesson in it. Returns how many were kept. */
export async function learnFromAnswer(client: SupabaseClient, input: TeachInput & { source?: "answer" | "pick" }): Promise<number> {
  let kept = 0;
  for (const lesson of lessonsFrom(input)) {
    if (await learnRule(client, { householdId: input.householdId, lesson, learnedByMemberId: input.memberId, itemId: input.itemId, source: input.source ?? "answer" })) kept += 1;
  }
  return kept;
}

/**
 * A person corrected an entry in place ("That's for Kabir, not Meera", "No,
 * it's on the 12th"): the HomeSend change is marked corrected, which raises
 * that kind's bar when it happens often (`kind-bar.ts`), and every safe
 * lesson in it is learned. Called by HomeTalk and WhatsApp after the governed
 * write succeeds. Never throws.
 */
export async function learnFromCorrection(client: SupabaseClient, input: TeachInput & { changeId?: string | null; now?: Date }): Promise<number> {
  const now = input.now ?? new Date();
  if (input.changeId) {
    try {
      await client
        .from("homesend_changes")
        .update({ corrected_at: now.toISOString(), corrected_field: input.field, corrected_by_member_id: input.memberId })
        .eq("household_id", input.householdId)
        .eq("id", input.changeId)
        .is("undone_at", null);
    } catch {
      // A correction that can't be counted still corrects the entry.
    }
  }
  let kept = 0;
  for (const lesson of lessonsFrom(input)) {
    if (await learnRule(client, { householdId: input.householdId, lesson, learnedByMemberId: input.memberId, itemId: input.itemId, source: "correction", now })) kept += 1;
  }
  return kept;
}
