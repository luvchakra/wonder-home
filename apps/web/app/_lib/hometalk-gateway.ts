import { supabaseIdempotencyStore } from "@wonderhome/core/api/idempotency";
import type { HomeTalkRequest, HomeTalkResponse } from "@wonderhome/core/hometalk/contract";
import { runHomeTalkGateway } from "@wonderhome/core/hometalk/gateway";
import { requireMembership } from "@wonderhome/core/identity/households";
import type { ChannelLimits } from "@wonderhome/core/voicelink/scopes";

import { homeTalkTurn, type Supabase } from "@/app/_lib/hometalk-turn";

/**
 * HomeTalk for an external channel, under the linked member's own session.
 * The gateway itself (`@wonderhome/core/hometalk/gateway`) decides; this
 * only hands it that session's membership, the web's own turn, and the
 * household's idempotency store.
 */
export function handleHomeTalkRequest(
  request: HomeTalkRequest,
  session: { supabase: Supabase },
  /** What the channel may reach — a linked assistant's scopes, a provider-voiced channel's content classes. Absent only for the household's own app. */
  limits?: ChannelLimits,
): Promise<HomeTalkResponse> {
  return runHomeTalkGateway(request, {
    membership: (householdId) => requireMembership(session.supabase, householdId),
    turn: (body) => homeTalkTurn({ supabase: session.supabase, householdId: request.householdId, body, source: request.channel, ...(limits ? { limits } : {}) }),
    idempotency: supabaseIdempotencyStore(session.supabase, request.householdId),
  });
}
