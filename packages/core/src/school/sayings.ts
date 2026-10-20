/**
 * What the cat tells a child, from WonderHome's own list (the owner,
 * 2026-10-20: "store a long list of such quotes in a table, tag with age,
 * gender etc. use that to display, never repeat these for a child").
 *
 * `companion_sayings` holds facts, sayings, ideas, jokes and riddles, each
 * tagged with the ages it suits, a gender when it was chosen for one, and its
 * topics, in every app language. `companion_sayings_for` picks the next few
 * this child has not heard, for their age and gender as on record; a saying
 * the cat actually shows is recorded in `companion_sayings_heard`, so it is
 * never shown to them again.
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
 * The next sayings this child has not heard yet, in their language. `null`
 * when the list is not there (a database before the migration): the cat then
 * keeps to its built-in lines. An empty list means they have heard them all.
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

/** The cat showed this saying to this child: it is never picked for them again. Saying it twice is not an error. */
export async function markSayingHeard(supabase: Client, input: { householdId: string; memberId: string; sayingId: string }): Promise<void> {
  const { error } = await supabase
    .from("companion_sayings_heard")
    .upsert({ household_id: input.householdId, member_id: input.memberId, saying_id: input.sayingId }, { onConflict: "member_id,saying_id", ignoreDuplicates: true });
  if (error) throw new Error(`markSayingHeard failed: ${error.code ?? "unknown"}`);
}
