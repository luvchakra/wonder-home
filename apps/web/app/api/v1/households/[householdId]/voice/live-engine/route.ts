import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { saveMemberLiveEngine } from "@wonderhome/core/voice/repository";
import { LIVE_ENGINES } from "@wonderhome/core/voice/settings";

/**
 * This member's own live-conversation engine (voice phase 3 follow-up).
 *
 * The HomeTalk composer's engine picker writes here so the choice is the one
 * server-side value that Settings -> Voice reads too — they can no longer
 * drift, and it survives a change of device. It is a personal preference:
 * `saveMemberLiveEngine` resolves the caller's own membership and RLS lets a
 * member set only their own engine, so one person's switch never changes
 * anyone else's.
 */
type Params = { params: Promise<{ householdId: string }> };

const bodySchema = z.object({ engine: z.enum(LIVE_ENGINES) });

export async function PUT(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: bodySchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    await saveMemberLiveEngine(supabase, {
      householdId,
      memberId: membership.memberId,
      actorMemberId: membership.memberId,
      engine: body.engine,
    });

    return { engine: body.engine };
  })(request);
}

export const dynamic = "force-dynamic";
