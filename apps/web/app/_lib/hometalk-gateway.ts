import { supabaseIdempotencyStore } from "@wonderhome/core/api/idempotency";
import type { HomeTalkRequest, HomeTalkResponse } from "@wonderhome/core/hometalk/contract";
import { runHomeTalkGateway } from "@wonderhome/core/hometalk/gateway";
import { requireMembership } from "@wonderhome/core/identity/households";
import type { VoiceScope } from "@wonderhome/core/voicelink/scopes";

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
  /** A linked voice assistant's scopes; absent only for the household's own app. */
  limits?: { scopes: readonly VoiceScope[] },
): Promise<HomeTalkResponse> {
  return runHomeTalkGateway(request, {
    membership: (householdId) => requireMembership(session.supabase, householdId),
    turn: (body) => homeTalkTurn({ supabase: session.supabase, householdId: request.householdId, body, ...(limits ? { limits } : {}) }),
    idempotency: supabaseIdempotencyStore(session.supabase, request.householdId),
  });
}
