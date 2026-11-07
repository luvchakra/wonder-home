import type { SupabaseClient } from "@supabase/supabase-js";
import { LEARNED_KINDS, learnable, type LearnedDefault, type LearnedKind } from "./learned";
import type { HomeSendKind } from "./items";

/**
 * `homesend_learned_defaults` (story 14-066): what a household has told
 * HomeSend once, so it is never asked again. Read and written with the
 * member's own client: RLS keeps every row to its household, a row is
 * written only as the member who answered, about a member of the same
 * household, and only an Admin clears one.
 *
 * Safe before the migration: a missing table reads as nothing learned and
 * learning quietly does nothing, so HomeSend simply asks as it did.
 */

type Row = {
  id: string;
  kind: string;
  key: string;
  value_member_id: string;
  learned_by_member_id: string | null;
  learned_from_item_id: string | null;
  learned_at: string;
  mixed: boolean | null;
};

const COLUMNS = "id, kind, key, value_member_id, learned_by_member_id, learned_from_item_id, learned_at, mixed";
/** A household learns a handful of senders; this bound is far above any real one. */
const LIMIT = 200;

function toDefault(row: Row): LearnedDefault | null {
  if (!(LEARNED_KINDS as readonly string[]).includes(row.kind)) return null;
  return {
    id: row.id,
    kind: row.kind as LearnedKind,
    key: row.key,
    valueMemberId: row.value_member_id,
    learnedByMemberId: row.learned_by_member_id,
    learnedFromItemId: row.learned_from_item_id,
    learnedAt: row.learned_at,
    mixed: row.mixed === true,
  };
}

export async function listLearnedDefaults(client: SupabaseClient, householdId: string): Promise<LearnedDefault[]> {
  const { data, error } = await client
    .from("homesend_learned_defaults")
    .select(COLUMNS)
    .eq("household_id", householdId)
    .order("learned_at", { ascending: false })
    .limit(LIMIT);
  if (error || !data) return [];
  return (data as Row[]).map(toDefault).filter((row): row is LearnedDefault => row !== null);
}

/**
 * Remembers who a sender's items are for, after a person said so. Never
 * throws: learning is a convenience, and failing to learn changes nothing
 * about the item itself.
 */
export async function learnSubject(
  client: SupabaseClient,
  input: {
    householdId: string;
    kind: HomeSendKind | null;
    sender: string | null | undefined;
    person: { memberId: string; memberType?: string | null };
    learnedByMemberId: string;
    itemId: string;
    now?: Date;
  },
): Promise<boolean> {
  const lesson = learnable(input.kind, input.sender, input.person);
  if (!lesson) return false;
  // A sender already learned for a different child becomes `mixed`: it settles nothing from then on.
  const { data: before } = await client
    .from("homesend_learned_defaults")
    .select("value_member_id, mixed")
    .eq("household_id", input.householdId)
    .eq("kind", lesson.kind)
    .eq("key", lesson.key)
    .maybeSingle();
  const previous = before as { value_member_id: string; mixed: boolean | null } | null;
  const mixed = previous ? previous.mixed === true || previous.value_member_id !== lesson.valueMemberId : false;
  const { error } = await client.from("homesend_learned_defaults").upsert(
    {
      household_id: input.householdId,
      kind: lesson.kind,
      key: lesson.key,
      value_member_id: lesson.valueMemberId,
      learned_by_member_id: input.learnedByMemberId,
      learned_from_item_id: input.itemId,
      learned_at: (input.now ?? new Date()).toISOString(),
      mixed,
    },
    { onConflict: "household_id,kind,key" },
  );
  return !error;
}

/** An Admin forgets one thing HomeSend learned (`id`), or everything (`id` omitted). Returns how many went. */
export async function forgetLearnedDefaults(client: SupabaseClient, householdId: string, id?: string): Promise<number> {
  let query = client.from("homesend_learned_defaults").delete({ count: "exact" }).eq("household_id", householdId);
  if (id) query = query.eq("id", id);
  const { count, error } = await query;
  if (error) throw new Error("HomeSend couldn't forget that just now.");
  return count ?? 0;
}
