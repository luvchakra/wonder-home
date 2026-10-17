import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";

/**
 * The languages each member speaks, and how well (`member_languages`).
 *
 * Not the language a person reads WonderHome in (that is
 * `household_members.language`): everything they can talk in. HomeTalk is
 * told it, so it knows that Nani understands Marathi best and the driver
 * speaks Kannada and some Hindi. A member edits their own, an Admin anyone's
 * (RLS); every member can read the household's list.
 */

/** Languages offered as ticks, as ISO 639-1 codes: the app's own eight, then the languages families here most often speak. Anything else is typed. */
export const SPOKEN_LANGUAGES = ["en", "hi", "mr", "bn", "ta", "te", "kn", "ml", "gu", "pa", "ur", "or", "as", "ne", "zh", "ar", "fr", "de", "es", "pt", "it", "ru", "ja", "ko"] as const;

/** Four plain levels, lowest first: what the meter shows. */
export const FLUENCY_LEVELS = ["basic", "conversational", "fluent", "native"] as const;
export type Fluency = (typeof FLUENCY_LEVELS)[number];

export type SpokenLanguage = { language: string; fluency: Fluency };

const CODE = /^[a-z]{2,3}$/;

/** A language's name in the reader's language: from the browser's own data for a code, as written for a language the household typed. */
export function languageName(language: string, displayLocale = "en"): string {
  if (!CODE.test(language)) return language;
  try {
    return new Intl.DisplayNames([displayLocale], { type: "language" }).of(language) ?? language;
  } catch {
    return language;
  }
}

/** A typed language, tidied: trimmed, one space between words, and turned into its code when it is one we offer by name ("hindi" → "hi"). */
export function normalizeLanguage(raw: string): string | null {
  const said = raw.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!said) return null;
  const lower = said.toLowerCase();
  if ((SPOKEN_LANGUAGES as readonly string[]).includes(lower)) return lower;
  const byName = SPOKEN_LANGUAGES.find((code) => languageName(code, "en").toLowerCase() === lower);
  return byName ?? said;
}

export function isFluency(value: unknown): value is Fluency {
  return typeof value === "string" && (FLUENCY_LEVELS as readonly string[]).includes(value);
}

/** "Hindi (native), English (fluent)": strongest first, in English, for the assistant's facts. */
export function spokenSummary(languages: readonly SpokenLanguage[]): string {
  return [...languages]
    .sort((a, b) => FLUENCY_LEVELS.indexOf(b.fluency) - FLUENCY_LEVELS.indexOf(a.fluency))
    .map((entry) => `${languageName(entry.language, "en")} (${entry.fluency})`)
    .join(", ");
}

/** Every member's languages in the household, by member id. */
export async function listMemberLanguages(supabase: SupabaseClient, householdId: string): Promise<Map<string, SpokenLanguage[]>> {
  const { data, error } = await supabase.from("member_languages").select("member_id, language, fluency").eq("household_id", householdId);
  if (error) throw new Error(`listMemberLanguages failed: ${error.code ?? "unknown"}`);
  const byMember = new Map<string, SpokenLanguage[]>();
  for (const row of (data ?? []) as { member_id: string; language: string; fluency: string }[]) {
    if (!isFluency(row.fluency)) continue;
    const list = byMember.get(row.member_id) ?? [];
    list.push({ language: row.language, fluency: row.fluency });
    byMember.set(row.member_id, list);
  }
  return byMember;
}

/**
 * One member's languages, replaced by what the form says: new ones added,
 * changed levels updated, unticked ones removed. Nothing else about the
 * member changes.
 */
async function replaceMemberLanguagesImpl(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; languages: readonly SpokenLanguage[] },
): Promise<{ changed: boolean }> {
  const wanted = new Map<string, Fluency>();
  for (const entry of input.languages) {
    const language = normalizeLanguage(entry.language);
    if (language && isFluency(entry.fluency)) wanted.set(language, entry.fluency);
  }
  if (wanted.size > 30) throw ApiError.badRequest("That is more languages than we can keep for one person.");

  const { data, error } = await supabase.from("member_languages").select("language, fluency").eq("household_id", input.householdId).eq("member_id", input.memberId);
  if (error) throw new Error(`replaceMemberLanguages failed: ${error.code ?? "unknown"}`);
  const current = new Map(((data ?? []) as { language: string; fluency: string }[]).map((row) => [row.language, row.fluency]));

  const gone = [...current.keys()].filter((language) => !wanted.has(language));
  const upserts = [...wanted].filter(([language, fluency]) => current.get(language) !== fluency);
  if (gone.length === 0 && upserts.length === 0) return { changed: false };

  if (gone.length > 0) {
    const { error: deleteError } = await supabase.from("member_languages").delete().eq("household_id", input.householdId).eq("member_id", input.memberId).in("language", gone);
    if (deleteError) throw refusal(deleteError);
  }
  if (upserts.length > 0) {
    const { error: upsertError } = await supabase
      .from("member_languages")
      .upsert(upserts.map(([language, fluency]) => ({ household_id: input.householdId, member_id: input.memberId, language, fluency })), { onConflict: "member_id,language" });
    if (upsertError) throw refusal(upsertError);
  }
  return { changed: true };
}

function refusal(error: { code?: string }): Error {
  if (error.code === "42501") return ApiError.forbidden("You can change your own languages, or an Admin can change anyone's.");
  return new Error(`replaceMemberLanguages failed: ${error.code ?? "unknown"}`);
}

export const replaceMemberLanguages = invalidatesContext(replaceMemberLanguagesImpl, (_supabase, input) => input.householdId);
