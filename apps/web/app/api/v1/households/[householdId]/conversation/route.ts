import { requireUser } from "@wonderhome/core/api/auth";
import { supabaseIdempotencyStore } from "@wonderhome/core/api/idempotency";
import { defineRoute } from "@wonderhome/core/api/route";
import { currentSessionId, listMessages } from "@wonderhome/core/conversation/repository";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { recordChannelEvent } from "@wonderhome/core/hometalk/channel-events";
import { toHomeTalkResponse, type TurnReply } from "@wonderhome/core/hometalk/contract";
import { requireMembership } from "@wonderhome/core/identity/households";

import { bodySchema, homeTalkTurn } from "@/app/_lib/hometalk-turn";

/**
 * The conversation route: the web and PWA door into HomeTalk. The turn
 * itself lives in `@/app/_lib/hometalk-turn` — the one gateway every channel
 * goes through — and this route only authenticates the session and keeps a
 * retried request from running twice.
 */

type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const sessionId = await currentSessionId(supabase, householdId, membership.memberId);
    if (!sessionId) return { sessionId: null, messages: [] };

    return { sessionId, messages: await listMessages(supabase, householdId, sessionId) };
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({
    input: bodySchema,
    authenticate: requireUser,
    // A turn writes messages, may record a proposal and consumes usage, so a
    // retry that reran it would leave the household with two of each. The
    // composer resends the same key, and the recorded response comes back
    // (story 15-005: retry without duplicating the underlying action).
    idempotency: async () => supabaseIdempotencyStore(await createClient(), householdId),
  }, async ({ body }) => {
    const startedAt = Date.now();
    try {
      const result = await homeTalkTurn({ supabase: await createClient(), householdId, body });
      // The web and PWA are channels too (voice phase 6 observability): one
      // closed-word row per turn, read through the same contract every other
      // channel's answer is. Never what was said.
      const reply = (result as { reply?: TurnReply } | null)?.reply;
      if (reply && "utterance" in body) {
        void recordChannelEvent(createAdminClient(), { channel: "web", householdId, outcome: toHomeTalkResponse("web", reply).status, latencyMs: Date.now() - startedAt });
      }
      return result;
    } catch (thrown) {
      if ("utterance" in body) void recordChannelEvent(createAdminClient(), { channel: "web", householdId, outcome: "failed", latencyMs: Date.now() - startedAt });
      throw thrown;
    }
  })(request);
}

export const dynamic = "force-dynamic";
