import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";

/**
 * What a pet likes (the owner, 2026-10-20: "add like, dislikes, favourite
 * food, favourite places etc for pets").
 *
 * Each is one thing of one kind. The kinds below are offered in a picker, and
 * a household can name its own (rule 20), so `kind` is any short text; the
 * known ones read in each language and in the order below.
 */
export const PET_PREFERENCE_KINDS = ["like", "dislike", "favourite_food", "favourite_treat", "favourite_place", "favourite_toy", "fear", "allergy"] as const;
export type KnownPetPreferenceKind = (typeof PET_PREFERENCE_KINDS)[number];

export type PetPreference = {
  id: string;
  petId: string;
  kind: string;
  subject: string;
  note: string | null;
};

const ORDER = new Map<string, number>(PET_PREFERENCE_KINDS.map((kind, index) => [kind, index]));

/** The known kinds first, in their order, then any the household named, then by what they are. */
export function sortPetPreferences<T extends Pick<PetPreference, "kind" | "subject">>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => (ORDER.get(a.kind) ?? 99) - (ORDER.get(b.kind) ?? 99) || a.kind.localeCompare(b.kind) || a.subject.localeCompare(b.subject));
}

/** What the English record says of a kind ("favourite_place" → "favourite place"); a named kind as it was written. */
export function petPreferenceKindWords(kind: string): string {
  return kind.replace(/_/g, " ");
}

/**
 * One English sentence about a pet's likes, for HomeBrain's facts:
 * "Bruno likes chicken and belly rubs; favourite place: the park; dislikes baths."
 */
export function petPreferenceSentence(name: string, entries: readonly Pick<PetPreference, "kind" | "subject" | "note">[]): string | null {
  if (entries.length === 0) return null;
  const groups = new Map<string, string[]>();
  for (const entry of sortPetPreferences(entries)) {
    const said = entry.note ? `${entry.subject} (${entry.note})` : entry.subject;
    groups.set(entry.kind, [...(groups.get(entry.kind) ?? []), said]);
  }
  const join = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
  const parts = [...groups.entries()].map(([kind, items]) =>
    kind === "like" ? `likes ${join(items)}` : kind === "dislike" ? `dislikes ${join(items)}` : kind === "fear" ? `is afraid of ${join(items)}` : kind === "allergy" ? `is allergic to ${join(items)}` : `${petPreferenceKindWords(kind)}: ${join(items)}`,
  );
  return `${name} ${parts.join("; ")}.`;
}

type Row = Record<string, unknown>;

/** Every pet's likes in the household, bounded. Empty, never an error, before the table exists. */
export async function listPetPreferences(supabase: SupabaseClient, householdId: string): Promise<PetPreference[]> {
  const { data, error } = await supabase.from("pet_preferences").select("id, pet_id, kind, subject, note").eq("household_id", householdId).order("created_at").limit(500);
  if (error) return [];
  return sortPetPreferences(
    ((data ?? []) as Row[]).map((row) => ({ id: row.id as string, petId: row.pet_id as string, kind: row.kind as string, subject: row.subject as string, note: (row.note as string | null) ?? null })),
  );
}

const clean = (value: string | null | undefined, max: number): string | null => {
  const text = (value ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return text.length > 0 ? text : null;
};

/** Adds one, or changes one already there (`id`). An Admin's to write (RLS). */
async function savePetPreferenceImpl(
  supabase: SupabaseClient,
  input: { householdId: string; petId: string; id?: string | null; kind: string; subject: string; note?: string | null; createdBy: string },
): Promise<{ id: string }> {
  const kind = clean(input.kind, 40)?.toLowerCase().replace(/\s+/g, "_");
  const subject = clean(input.subject, 120);
  if (!kind || !subject) throw new ApiError("unprocessable", "Say what kind it is and what it is.");
  const row = { kind, subject, note: clean(input.note, 300) };
  const { data, error } = input.id
    ? await supabase.from("pet_preferences").update(row).eq("id", input.id).eq("household_id", input.householdId).eq("pet_id", input.petId).select("id").single()
    : await supabase.from("pet_preferences").insert({ ...row, household_id: input.householdId, pet_id: input.petId, created_by: input.createdBy }).select("id").single();
  if (error || !data) {
    if (error?.code === "42501") throw new ApiError("forbidden", "Only an Admin can change a pet's likes.");
    throw new Error(`savePetPreference failed: ${error?.code ?? "unknown"}`);
  }
  return { id: data.id as string };
}

/** Takes one away. A pet's likes are its own; nothing else refers to them. */
async function removePetPreferenceImpl(supabase: SupabaseClient, input: { householdId: string; id: string }): Promise<void> {
  const { data, error } = await supabase.from("pet_preferences").delete().eq("id", input.id).eq("household_id", input.householdId).select("id");
  if (error) throw new Error(`removePetPreference failed: ${error.code ?? "unknown"}`);
  if (!data || data.length === 0) throw new ApiError("forbidden", "Only an Admin can change a pet's likes.");
}

export const savePetPreference = invalidatesContext(savePetPreferenceImpl, (_s, input) => input.householdId);
export const removePetPreference = invalidatesContext(removePetPreferenceImpl, (_s, input) => input.householdId);
