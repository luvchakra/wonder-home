/**
 * What the cat tells a child, from WonderHome's own list (the owner,
 * 2026-10-20: "store a long list of such quotes in a table, tag with age,
 * gender etc. use that to display, never repeat these for a child").
 *
 * `companion_sayings` holds facts, sayings, ideas, jokes and riddles, each
 * tagged with the ages it suits, a gender when it was chosen for one, and its
 * topics, in every app language. `companion_sayings_for` picks the next few
 * for this child's age and gender as on record — the ones they have not
 * heard first, and only once every one has been heard, the one heard longest
 * ago (the owner, 2026-10-21: "repeat the quotes only when the stored list is
 * finished"). A saying the cat shows is recorded in `companion_sayings_heard`
 * with when, so the list goes round in full before anything comes back.
 */

type Client = import("@supabase/supabase-js").SupabaseClient;

export const SAYING_KINDS = ["fact", "quote", "idea", "joke", "riddle"] as const;
export type SayingKind = (typeof SAYING_KINDS)[number];

export type Saying = { id: string; kind: SayingKind; text: string };

/** A saying in the reader's language, else English; never empty. */
export function sayingText(words: Record<string, unknown>, language: string): string | null {
  const own = typeof words[language] === "string" ? (words[language] as string).trim() : "";
  if (own) return own;
  const english = typeof words.en === "string" ? words.en.trim() : "";
  return english || null;
}

/**
 * The next sayings for this child, in their language: unheard first, then the
 * longest-unheard once the list is finished. `null` when the list is not
 * there (a database before the migration): the cat then keeps to its
 * built-in lines. Empty only when no saying suits the child.
 */
export async function nextSayings(supabase: Client, memberId: string, language: string, limit = 6): Promise<Saying[] | null> {
  const { data, error } = await supabase.rpc("companion_sayings_for", { p_member_id: memberId, p_limit: limit });
  if (error) return null;
  const sayings: Saying[] = [];
  for (const row of (data ?? []) as { id: string; kind: string; words: Record<string, unknown> }[]) {
    const text = sayingText(row.words ?? {}, language);
    if (text && (SAYING_KINDS as readonly string[]).includes(row.kind)) sayings.push({ id: row.id, kind: row.kind as SayingKind, text });
  }
  return sayings;
}

/** The cat showed this saying to this child: it goes to the back of their list, and when it was heard moves to now. */
export async function markSayingHeard(supabase: Client, input: { householdId: string; memberId: string; sayingId: string }): Promise<void> {
  const heardAt = new Date().toISOString();
  // Heard before (the list went round): move it to the back. Else record it.
  const { data: moved, error: moveError } = await supabase
    .from("companion_sayings_heard")
    .update({ heard_at: heardAt })
    .eq("member_id", input.memberId)
    .eq("saying_id", input.sayingId)
    .select("saying_id");
  // A database before 20261021031000 has no update right here: record it as before.
  if (moveError && moveError.code !== "42501") throw new Error(`markSayingHeard failed: ${moveError.code ?? "unknown"}`);
  if (!moveError && (moved ?? []).length > 0) return;
  const { error } = await supabase
    .from("companion_sayings_heard")
    .upsert({ household_id: input.householdId, member_id: input.memberId, saying_id: input.sayingId, heard_at: heardAt }, { onConflict: "member_id,saying_id", ignoreDuplicates: true });
  if (error) throw new Error(`markSayingHeard failed: ${error.code ?? "unknown"}`);
}
