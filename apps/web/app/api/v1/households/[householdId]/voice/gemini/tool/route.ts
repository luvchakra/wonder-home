import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { recordChannelEvent } from "@wonderhome/core/hometalk/channel-events";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";
import { requireMembership } from "@wonderhome/core/identity/households";
import { inAppVoiceScopes, refusedToolResult, toolResultFrom, utteranceForToolCall } from "@wonderhome/core/voicelink/gemini-live";

import { geminiLiveGate } from "@/app/_lib/gemini-live";
import { handleHomeTalkRequest } from "@/app/_lib/hometalk-gateway";

/**
 * One Gemini voice tool call, answered by HomeTalk (voice integration
 * phase 3).
 *
 * Gemini asked for one of the allowlisted tools; the page relays the call
 * here, under the member's own session. The call becomes the words a member
 * could have said to HomeTalk themselves and runs through the same gateway,
 * the same gates and the same executors as every other channel — narrowed
 * to what this household agreed may reach Google, because Gemini hears
 * every answer it speaks. What comes back is HomeTalk's decision: success
 * is the executor's, never the model's.
 *
 * A Gemini call id is only unique within its session, so the session id the
 * token route issued is part of the retry key: a redelivered call replays,
 * a call from another session never collides with it.
 */
type Params = { params: Promise<{ householdId: string }> };

const bodySchema = z.object({
  sessionId: z.uuid(),
  callId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(64),
  args: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;
  return defineRoute({ input: bodySchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    // The household may have turned Gemini voice off since the session
    // opened: the next thing said stops here, not when the token runs out.
    const { availability, policy } = await geminiLiveGate(supabase, householdId);
    if (!availability.available) return refusedToolResult(`${availability.reason} Nothing was changed.`);

    // One Live session is a conversation, not a loop: past a generous number
    // of tool calls it is paused, and says so (voice phase 6 cost control).
    const admin = createAdminClient();
    if (!(await hitRateLimit(admin, "voice.tool", body.sessionId))) {
      await recordChannelEvent(admin, { channel: "gemini_voice", householdId, outcome: "rate_limited" });
      return refusedToolResult(rateLimitMessage("voice.tool"));
    }

    const call = utteranceForToolCall(body.name, body.args ?? {});
    if ("refused" in call) return refusedToolResult(call.refused);

    const answer = await handleHomeTalkRequest(
      {
        channel: "gemini_voice",
        householdId,
        memberId: membership.memberId,
        requestId: `gl-${body.sessionId}-${body.callId}`,
        input: { text: call.text, modality: "voice" },
        device: { provider: "gemini" },
      },
      { supabase },
      { scopes: inAppVoiceScopes(policy.allowedClasses), classes: policy.allowedClasses },
      { rulesFirst: call.structured },
    );
    return toolResultFrom(answer);
  })(request);
}

export const dynamic = "force-dynamic";
