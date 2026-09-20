import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { googleProvider } from "./google";
import { platformSpeechKey } from "./platform-key";
import { browserProvider, type SpeechProvider } from "./provider";
import { DEFAULT_VOICE_SETTINGS, voiceSettingsSchema, type VoiceSettings } from "./settings";

/**
 * Where a household's voice lives (story 04-009).
 *
 * Only preferences live here. The key that makes speech work belongs to
 * the deployment, not to a family (`voice/platform-key.ts`), so there is
 * no credential table to read and nothing here that must never be
 * rendered.
 *
 * Settings are read and written through the caller's own session, so RLS
 * decides who may change them: any member may read the voice, because the
 * assistant needs it to speak at all, and an administrator changes it,
 * because a household hears one voice.
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

/**
 * The provider that will actually answer for this household.
 *
 * The household's settings ask for one; the deployment decides whether
 * they can have it. A household that chose Google on a deployment with no
 * speech key configured gets the browser back rather than an error,
 * because the browser still works and a quiet downgrade to something that
 * speaks beats a dead button (design rule 10). The screen reads `live` to
 * say which one it got.
 */
export function resolveProvider(settings: VoiceSettings): SpeechProvider {
  if (settings.provider !== "google") return browserProvider;

  const platform = platformSpeechKey();
  return platform ? googleProvider(platform.key) : browserProvider;
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
