import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassifyFailure, IntakeContext, IntakeExtraction, IntakeSource } from "../../ai/classify-intake";
import type { AudioClip } from "../../voice/provider";
import { GEMINI_TRANSCRIPT_CONFIDENCE, geminiMayTranscribe } from "./audio";

/**
 * HomeBrain's readers for what HomeSend receives: the model that reads an
 * item, the stronger second reader, and the speech service that writes a
 * voice note down (owner, 2026-11-22: HomeBrain holds the understanding,
 * HomeSend only moves data in and out). HomeSend passes these in as its
 * `IngestDeps` defaults; tests pass stand-ins.
 */

/** A reading; nothing (an older stand-in's way of saying the provider failed); no provider at all; or why there is none (2026-11-21). */
export type ClassifyResult = IntakeExtraction | null | "no_provider" | ClassifyFailure;

export type TranscribeResult =
  | { status: "transcribed"; text: string; confidence: number }
  | { status: "unavailable" }
  | { status: "failed" };

export type IntakeClassifier = (householdId: string, source: IntakeSource, context: IntakeContext) => Promise<ClassifyResult>;
export type VoiceNoteTranscriber = (supabase: SupabaseClient, householdId: string, clip: AudioClip) => Promise<TranscribeResult>;

export const defaultClassify: IntakeClassifier = async (householdId, source, context) => {
  const { readHouseholdKey } = await import("../../ai/credentials");
  const { resolveModelKey, currentPlatformKey } = await import("../../ai/model-key");
  const { classifyIntakeDetailed } = await import("../../ai/classify-intake");
  const householdKey = await readHouseholdKey(householdId).catch(() => null);
  const key = resolveModelKey(householdKey, (await currentPlatformKey()));
  if (key.source === "none" || !key.provider || !key.key) return "no_provider";
  return classifyIntakeDetailed(key.provider, key.key, source, context);
};

/**
 * The stronger reader a second read uses before anything is set aside as
 * unreadable (the owner's 2026-11-20 review): a photo or PDF has its words
 * written down first (OCR), then read as text by the provider's most capable
 * model; text is read by that model directly. Through `ai/provider-clients.ts`
 * only, on the household's own key or WonderHome's.
 */
export const strongerClassify: IntakeClassifier = async (householdId, source, context) => {
  const { readHouseholdKey } = await import("../../ai/credentials");
  const { resolveModelKey, currentPlatformKey } = await import("../../ai/model-key");
  const { classifyIntake, classifyIntakeDetailed } = await import("../../ai/classify-intake");
  const householdKey = await readHouseholdKey(householdId).catch(() => null);
  const key = resolveModelKey(householdKey, (await currentPlatformKey()));
  if (key.source === "none" || !key.provider || !key.key) return "no_provider";
  if ("image" in source || "document" in source) {
    const { readWordsOff } = await import("../../ai/read-words");
    const words = await readWordsOff(key.provider, key.key, source);
    if (words) {
      const read = await classifyIntake(key.provider, key.key, { text: words }, { ...context, channel: `${context.channel ?? "a file sent to HomeSend"}, its words written down from the page first` }, { stronger: true });
      if (read?.readable) return read;
    }
  }
  return classifyIntakeDetailed(key.provider, key.key, source, context, { stronger: true });
};

export const defaultTranscribe: VoiceNoteTranscriber = async (supabase, householdId, clip) => {
  const { loadVoiceSettings, resolveProvider } = await import("../../voice/repository");
  const settings = await loadVoiceSettings(supabase, householdId);
  // A voice note needs a server-side speech service whatever the household
  // picked for live conversation — the browser cannot transcribe a file.
  const provider = await resolveProvider({ ...settings, provider: "google" }, householdId);
  if (provider.live) {
    try {
      const heard = await provider.listen({ clip, settings });
      return { status: "transcribed", text: heard.text, confidence: heard.confidence };
    } catch (error) {
      logTranscriptionFailure("cloud_speech", clip, error);
      return { status: "failed" };
    }
  }
  return transcribeWithGemini(supabase, householdId, clip, settings);
};

/**
 * No Cloud Speech key: the household's Gemini key writes the note down
 * instead (its Gemini voice key, else the assistant's key when that is
 * Google's), only where its data-use agreement lets content reach Google.
 */
async function transcribeWithGemini(
  supabase: SupabaseClient,
  householdId: string,
  clip: AudioClip,
  settings: Awaited<ReturnType<typeof import("../../voice/repository").loadVoiceSettings>>,
): Promise<TranscribeResult> {
  const [{ readGeminiVoiceKey, readHouseholdKey }, { currentPlatformKey, resolveModelKey }, { loadDataUse }, { listMembers }, { listeningLanguage }, live] = await Promise.all([
    import("../../ai/credentials"),
    import("../../ai/model-key"),
    import("../../ai/privacy-repository"),
    import("../../identity/households"),
    import("../../voice/settings"),
    import("../../voicelink/live-transcribe"),
  ]);
  const [voiceKey, householdKey, policy, members] = await Promise.all([
    readGeminiVoiceKey(householdId).catch(() => null),
    readHouseholdKey(householdId).catch(() => null),
    loadDataUse(supabase, householdId).catch(() => null),
    listMembers(supabase, householdId, null).catch(() => []),
  ]);
  const key = resolveModelKey(voiceKey ?? householdKey, (await currentPlatformKey()));
  if (!policy || !geminiMayTranscribe(key, policy) || !key.key) {
    logNotTranscribed("gemini", clip, !key.key ? "no_gemini_key" : !policy ? "no_data_use_policy" : "data_use_excludes_google");
    return { status: "unavailable" };
  }
  try {
    const text = await live.transcribeAudioFile(key.key, {
      base64: clip.base64,
      mimeType: clip.mimeType,
      languageCode: listeningLanguage(settings),
      vocabulary: live.transcriptionVocabulary(members.map((member) => member.displayName)),
    });
    if (!text) logTranscriptionFailure("gemini", clip, new Error("no words came back"));
    return { status: "transcribed", text: text ?? "", confidence: GEMINI_TRANSCRIPT_CONFIDENCE };
  } catch (error) {
    logTranscriptionFailure("gemini", clip, error);
    return { status: "failed" };
  }
}

/**
 * Why a voice note could not be written down (the owner, 2026-10-25: a
 * WhatsApp voice note failed and nothing said why). The error and the
 * audio's type and size only — never the audio or any words from it.
 */
export function logTranscriptionFailure(service: "cloud_speech" | "gemini" | "unknown", clip: AudioClip, error: unknown): void {
  // A key can ride in a request URL ("?key=…"); it never reaches a log.
  const reason = error instanceof Error ? `${error.name}: ${error.message}`.replace(/([?&]key=)[^&\s"']+/gi, "$1[redacted]").replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]").slice(0, 300) : "unknown error";
  logNotTranscribed(service, clip, reason);
}

/** Why a voice note was not written down, with no words, audio or key in it. */
function logNotTranscribed(service: "cloud_speech" | "gemini" | "unknown", clip: AudioClip, reason: string): void {
  console.warn("[homesend] voice note not transcribed", { service, mimeType: clip.mimeType, approxBytes: Math.round((clip.base64.length * 3) / 4), reason });
}
