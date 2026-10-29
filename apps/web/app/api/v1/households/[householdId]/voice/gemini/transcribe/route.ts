import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient } from "@wonderhome/core/db/server";
import { listMembers, requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";
import { loadVoiceSettings } from "@wonderhome/core/voice/repository";
import { listeningLanguage } from "@wonderhome/core/voice/settings";
import { LIVE_TRANSCRIBE_MAX_BYTES, transcribeLiveTurn, transcriptionVocabulary } from "@wonderhome/core/voicelink/live-transcribe";

import { geminiLiveGate } from "@/app/_lib/gemini-live";

/**
 * One Gemini Live turn, written down word for word for the chat (the owner's
 * report: Gemini heard them clearly, the chat showed different words). The
 * audio is the turn the session already sent to Google, under the same gate
 * as the session itself: the rollout flag, the plan, the Google key and the
 * household's data-use agreement. The words go back to the page and nowhere
 * else; nothing is stored, and nothing HomeTalk did changes.
 */
type Params = { params: Promise<{ householdId: string }> };

const bodySchema = z.object({
  // Base64 16-bit mono PCM at 16 kHz: at most a minute (base64 is 4/3 the bytes).
  audio: z.string().min(1).max(Math.ceil((LIVE_TRANSCRIBE_MAX_BYTES * 4) / 3) + 8),
});

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;
  return defineRoute({ authenticate: requireUser, input: bodySchema }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const { availability, key } = await geminiLiveGate(supabase, householdId);
    if (!availability.available) throw ApiError.forbidden(availability.reason);
    if (!(await hitRateLimit(adminClientFor(adminGrant.member(membership, "count voice transcriptions")), "voice.transcribe", membership.memberId))) throw new ApiError("rate_limited", rateLimitMessage("voice.transcribe"));

    const pcm = new Uint8Array(Buffer.from(body.audio, "base64"));
    const [settings, members] = await Promise.all([
      loadVoiceSettings(supabase, householdId).catch(() => null),
      listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    ]);
    try {
      const transcript = await transcribeLiveTurn(key.key!, {
        pcm,
        languageCode: settings ? listeningLanguage(settings) : "en-IN",
        vocabulary: transcriptionVocabulary(members.map((member) => member.displayName)),
      });
      return { transcript };
    } catch (thrown) {
      log.warn("gemini live: turn not transcribed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
      // The page keeps Gemini's own line: nothing is lost.
      return { transcript: null };
    }
  })(request);
}

export const dynamic = "force-dynamic";
