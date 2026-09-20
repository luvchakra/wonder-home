import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { flags } from "@wonderhome/core/config/flags";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { resolveVoiceName } from "@wonderhome/core/voice/google";
import { VoiceError } from "@wonderhome/core/voice/provider";
import { loadVoiceSettings, resolveProvider, speechKeySource } from "@wonderhome/core/voice/repository";
import { describeVoice, listeningLanguage, voiceSettingsSchema } from "@wonderhome/core/voice/settings";

/**
 * Speaking and listening, on the server (story 04-009).
 *
 * The key — the deployment's, or the household's own where they set one —
 * is read on the server only, so the page cannot call Google directly. It
 * posts here instead: this route resolves the key, calls the provider, and
 * returns audio or a transcript. No key is ever in a response, a log or a
 * rendered page.
 *
 * Entitlement is checked here and not taken on trust from the page that
 * called — the same rule every other guarded path follows. Usage is
 * deliberately *not* metered again: the conversation turn these legs belong
 * to already consumed one `conversation.voice` unit, and charging a
 * household three times for one sentence would be wrong.
 */
type Params = { params: Promise<{ householdId: string }> };

const speakSchema = z.object({
  speak: z.string().trim().min(1).max(5000),
  /**
   * Settings to use instead of the saved ones, so the settings screen can
   * play a voice before committing to it. Preferences only — never a key,
   * never an entitlement — and validated by the same schema the database
   * enforces, so a preview cannot ask for anything a save could not.
   */
  preview: voiceSettingsSchema.partial().optional(),
});

const transcribeSchema = z.object({
  /** Base64 audio, capped near Google's own limit for a synchronous request. */
  audio: z.string().min(1).max(8_000_000),
  mimeType: z.string().trim().min(1).max(100),
});

const bodySchema = z.union([speakSchema, transcribeSchema]);

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const [settings, entitlement] = await Promise.all([
      loadVoiceSettings(supabase, householdId),
      may(supabase, householdId, "conversation.voice"),
    ]);
    const keySource = await speechKeySource(householdId);
    const configured = keySource !== "none";

    // Whether the browser should hand speech to this server at all. All
    // three have to be true, and the page asks rather than assuming, so a
    // setting changed in another tab stops being used on the next turn.
    const serverVoice = settings.provider === "google" && configured && entitlement.allowed;

    // The settings screen asks for one language's voices at a time, because
    // the full catalogue is several hundred entries in languages nobody on
    // this screen is choosing between.
    const asked = new URL(request.url).searchParams.get("language");
    const voices =
      asked && configured
        ? await (await resolveProvider({ ...settings, provider: "google" }, householdId)).voices(asked).catch(() => [])
        : [];

    return {
      settings,
      description: describeVoice(settings),
      listeningLanguage: listeningLanguage(settings),
      speechConfigured: configured,
      keySource,
      entitled: entitlement.allowed,
      voiceEnabled: flags().voice_conversation,
      serverVoice,
      voices,
    };
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: bodySchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "conversation.voice");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const saved = await loadVoiceSettings(supabase, householdId);
    // A preview overrides how it sounds, never whether it may speak: the
    // provider is still resolved from what the household has actually
    // configured, so an unsaved form cannot turn Google on by itself.
    const settings =
      "speak" in body && body.preview
        ? voiceSettingsSchema.parse({ ...saved, ...body.preview, provider: saved.provider })
        : saved;
    const provider = await resolveProvider(saved, householdId);

    if (!provider.live) {
      throw ApiError.badRequest(
        "No speech service is configured, so speaking and listening happen in the browser.",
      );
    }

    try {
      if ("speak" in body) {
        // Turning off spoken replies stops the assistant reading answers
        // aloud; it does not stop somebody auditioning a voice on the
        // settings screen, which is a deliberate act of its own.
        if (!settings.speakReplies && !body.preview) {
          throw ApiError.badRequest("This household has turned off spoken replies.");
        }

        // A named voice is resolved here rather than in the adapter, because
        // it needs the catalogue and the catalogue is a network call worth
        // making once per request at most.
        const voiceName =
          settings.voiceName ?? resolveVoiceName(settings, await provider.voices(settings.language).catch(() => []));

        const spoken = await provider.speak({ text: body.speak, settings: { ...settings, voiceName } });
        return {
          audio: spoken.base64,
          mimeType: spoken.mimeType,
          voiceName: spoken.voiceName,
          characters: spoken.characters,
        };
      }

      // Names are what a household assistant mishears. Sending the people
      // who actually live here as hints is the single biggest thing that
      // makes recognition usable for this kind of product.
      const heard = await provider.listen({
        clip: { base64: body.audio, mimeType: body.mimeType },
        settings,
        hints: await memberNames(supabase, householdId),
      });

      return { transcript: heard.text, confidence: heard.confidence, language: heard.language };
    } catch (thrown) {
      throw asApiError(thrown);
    }
  })(request);
}

/**
 * A provider failure, turned into the envelope every other endpoint uses.
 *
 * The distinction that matters to a household is whether they can fix it: a
 * refused key is theirs to correct in Settings, a spent allowance is theirs
 * to wait out, and neither should look like WonderHome being broken.
 */
function asApiError(thrown: unknown): unknown {
  if (!(thrown instanceof VoiceError)) return thrown;

  switch (thrown.code) {
    case "unauthorized":
    case "not_configured":
      return ApiError.badRequest(thrown.message);
    case "quota_exceeded":
      return ApiError.forbidden(thrown.message);
    case "too_long":
    case "unsupported":
    case "malformed":
      return ApiError.badRequest(thrown.message);
    default:
      return thrown;
  }
}

async function memberNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("household_members")
    .select("display_name")
    .eq("household_id", householdId)
    .eq("status", "active");

  // Both halves of a name: "Anaya Sharma" is worth hinting, and so is
  // "Anaya" on its own, which is what anybody actually says out loud.
  return [
    ...new Set(
      ((data as { display_name: string }[] | null) ?? []).flatMap((row) => [
        row.display_name,
        ...row.display_name.split(/\s+/),
      ]),
    ),
  ].filter((name) => name.length > 1);
}

export const dynamic = "force-dynamic";
