import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { recordChannelEvent } from "@wonderhome/core/hometalk/channel-events";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";
import { mintGeminiLiveToken } from "@wonderhome/core/voicelink/gemini-live";

import { geminiLiveGate } from "@/app/_lib/gemini-live";

/**
 * Opening a Gemini voice session (voice integration phase 3).
 *
 * GET says whether one may be opened, and if not, why — in the household's
 * own terms. POST mints a short-lived, single-use Live API token for the
 * signed-in member: locked to WonderHome's instructions and allowlisted
 * tools, usable to open one session within a minute, for fifteen minutes.
 * The key it is minted with — the household's own, else the platform's —
 * never leaves this server. Gemini itself can then do nothing but call those
 * tools, and every call comes back through `/voice/gemini/tool` to HomeTalk.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    await requireMembership(supabase, householdId);
    const { availability } = await geminiLiveGate(supabase, householdId);
    return availability;
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;
  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const { availability, key } = await geminiLiveGate(supabase, householdId);
    if (!availability.available) throw ApiError.forbidden(availability.reason);
    const admin = createAdminClient();
    const event = (outcome: "session_opened" | "provider_error" | "rate_limited", latencyMs?: number) =>
      recordChannelEvent(admin, { channel: "gemini_voice", householdId, outcome, ...(latencyMs !== undefined ? { latencyMs } : {}) });
    if (!(await hitRateLimit(admin, "voice.session", membership.memberId))) {
      await event("rate_limited");
      throw new ApiError("rate_limited", rateLimitMessage("voice.session"));
    }

    const startedAt = Date.now();
    try {
      const minted = await mintGeminiLiveToken(key.key!);
      await event("session_opened", Date.now() - startedAt);
      return { token: minted.token, model: minted.model, expiresAt: minted.expiresAt, newSessionBy: minted.newSessionBy, sessionId: crypto.randomUUID() };
    } catch (thrown) {
      await event("provider_error", Date.now() - startedAt);
      log.warn("gemini live: token not minted", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
      throw new ApiError("unprocessable", "Gemini voice is not answering just now. You can still type or use the microphone.");
    }
  })(request);
}

export const dynamic = "force-dynamic";
