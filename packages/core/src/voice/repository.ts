import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { createAdminClient } from "../db/admin";
import { googleProvider } from "./google";
import { platformSpeechKey, resolveSpeechKey, type SpeechKeySource } from "./platform-key";
import { browserProvider, type SpeechProvider } from "./provider";
import { DEFAULT_VOICE_SETTINGS, voiceSettingsSchema, type VoiceSettings } from "./settings";

/**
 * Where a household's voice lives (story 04-009).
 *
 * Note which client each function takes, because that is the design.
 * Settings are read and written through the caller's own session, so RLS
 * decides who may change them: any member may read the voice, because the
 * assistant needs it to speak at all, and an administrator changes it,
 * because a household hears one voice.
 *
 * The household's own key — the optional override on the deployment's, see
 * `voice/platform-key.ts` — is different. It is read only by
 * `resolveProvider`, on the admin client, because the credentials table
 * has no SELECT policy at all. It must never reach a response, a log or a
 * rendered page.
 */

type Row = Record<string, unknown>;

/** The household's voice, or the defaults. Never throws: a voice is not worth a broken page. */
export async function loadVoiceSettings(
  supabase: SupabaseClient,
  householdId: string,
): Promise<VoiceSettings> {
  const { data, error } = await supabase
    .from("household_voice_settings")
    .select("*")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error || !data) return DEFAULT_VOICE_SETTINGS;

  const parsed = voiceSettingsSchema.safeParse(fromRow(data as Row));
  return parsed.success ? parsed.data : DEFAULT_VOICE_SETTINGS;
}

export async function saveVoiceSettings(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; settings: VoiceSettings },
): Promise<void> {
  const { error } = await supabase.from("household_voice_settings").upsert(
    { household_id: input.householdId, updated_by_member_id: input.memberId, ...toRow(input.settings) },
    { onConflict: "household_id" },
  );

  if (error) {
    if (error.code === "42501") {
      throw ApiError.forbidden("Only the Head of Family or an administrator can change the voice.");
    }
    throw new Error(`saveVoiceSettings failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.memberId,
    eventType: "voice.settings_changed",
    targetTable: "household_voice_settings",
    targetId: input.householdId,
    metadata: { provider: input.settings.provider, language: input.settings.language, tier: input.settings.tier },
  });
}

export type VoiceCredentialStatus = { configured: boolean; updatedAt: Date | null };

/** Whether a household has its own speech key, and since when. Never the key itself. */
export async function voiceCredentialStatus(
  supabase: SupabaseClient,
  householdId: string,
): Promise<VoiceCredentialStatus> {
  const { data, error } = await supabase.rpc("voice_credential_status", { p_household_id: householdId });
  if (error) return { configured: false, updatedAt: null };

  const row = ((data as Row[] | null) ?? [])[0];
  if (!row) return { configured: false, updatedAt: null };
  return { configured: true, updatedAt: row.updated_at ? new Date(row.updated_at as string) : null };
}

export async function setVoiceKey(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; apiKey: string },
): Promise<void> {
  const apiKey = input.apiKey.trim();
  if (apiKey.length < 20) throw ApiError.badRequest("That does not look like a Google API key.");

  const { error } = await supabase.from("household_voice_credentials").upsert(
    { household_id: input.householdId, provider: "google", api_key: apiKey, set_by_member_id: input.memberId },
    { onConflict: "household_id" },
  );

  if (error) {
    if (error.code === "42501") {
      throw ApiError.forbidden("Only the Head of Family or an administrator can set the speech key.");
    }
    throw new Error(`setVoiceKey failed: ${error.code ?? "unknown"}`);
  }

  // Whose servers hear this household is worth a trail entry. The provider
  // name only — the key is the one thing here that must never appear
  // anywhere else, audit metadata included.
  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.memberId,
    eventType: "voice.key_set",
    targetTable: "household_voice_credentials",
    targetId: input.householdId,
    metadata: { provider: "google" },
  });
}

export async function clearVoiceKey(
  supabase: SupabaseClient,
  householdId: string,
  actorMemberId?: string,
): Promise<void> {
  const { error } = await supabase.from("household_voice_credentials").delete().eq("household_id", householdId);

  if (error) {
    if (error.code === "42501") {
      throw ApiError.forbidden("Only the Head of Family or an administrator can remove the speech key.");
    }
    throw new Error(`clearVoiceKey failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId,
    actorMemberId: actorMemberId ?? null,
    eventType: "voice.key_removed",
    targetTable: "household_voice_credentials",
    targetId: householdId,
  });
}

/** Whose key would answer for this household, without returning any of them. */
export async function speechKeySource(householdId: string): Promise<SpeechKeySource> {
  return resolveSpeechKey(await readVoiceKey(householdId), platformSpeechKey()).source;
}

/**
 * The provider that will actually answer for this household.
 *
 * The household's settings ask for one; the keys decide whether they can
 * have it, theirs before the deployment's. A household that chose Google
 * with no key anywhere behind it gets the browser back rather than an
 * error, because the browser still works and a quiet downgrade to
 * something that speaks beats a dead button (design rule 10). The screen
 * reads `live` to say which one it got.
 */
export async function resolveProvider(
  settings: VoiceSettings,
  householdId: string,
): Promise<SpeechProvider> {
  if (settings.provider !== "google") return browserProvider;

  const resolved = resolveSpeechKey(await readVoiceKey(householdId), platformSpeechKey());
  return resolved.key ? googleProvider(resolved.key) : browserProvider;
}

/**
 * The household's own speech key, for the server about to call Google.
 *
 * Deliberately the only reader, and deliberately on the admin client: the
 * table has no SELECT policy, so this is the single path by which the key
 * leaves the database, and it is a server one.
 */
async function readVoiceKey(householdId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("household_voice_credentials")
    .select("api_key")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error || !data) return null;
  return ((data as Row).api_key as string) ?? null;
}

function fromRow(row: Row): Record<string, unknown> {
  return {
    provider: row.provider,
    language: row.language,
    voiceName: row.voice_name ?? null,
    gender: row.gender,
    tier: row.tier,
    speakingRate: Number(row.speaking_rate),
    pitch: Number(row.pitch),
    volumeGainDb: Number(row.volume_gain_db),
    listeningDevice: row.listening_device,
    speakReplies: row.speak_replies,
    recognitionLanguage: row.recognition_language ?? null,
    alternativeLanguages: row.alternative_languages ?? [],
    recognitionModel: row.recognition_model,
    automaticPunctuation: row.automatic_punctuation,
    profanityFilter: row.profanity_filter,
    phraseHints: row.phrase_hints ?? [],
    enhancedRecognition: row.enhanced_recognition,
  };
}

function toRow(settings: VoiceSettings): Row {
  return {
    provider: settings.provider,
    language: settings.language,
    voice_name: settings.voiceName,
    gender: settings.gender,
    tier: settings.tier,
    speaking_rate: settings.speakingRate,
    pitch: settings.pitch,
    volume_gain_db: settings.volumeGainDb,
    listening_device: settings.listeningDevice,
    speak_replies: settings.speakReplies,
    recognition_language: settings.recognitionLanguage,
    alternative_languages: settings.alternativeLanguages,
    recognition_model: settings.recognitionModel,
    automatic_punctuation: settings.automaticPunctuation,
    profanity_filter: settings.profanityFilter,
    phrase_hints: settings.phraseHints,
    enhanced_recognition: settings.enhancedRecognition,
  };
}
