import { z } from "zod";

import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { requirePlatformAdmin } from "@wonderhome/core/platform/admin";
import { refusePrivacyRequest } from "@wonderhome/core/platform/privacy-requests";

/**
 * Refusing one privacy request (story 16-007). The schema has supported
 * `status: 'refused'`/`refusal_reason` since 15-007; nothing ever wrote
 * either until this route.
 */
type Params = { params: Promise<{ requestId: string }> };

const refuseSchema = z.object({
  reason: z.string().trim().min(10).max(300),
});

export async function PATCH(request: Request, { params }: Params) {
  const { requestId } = await params;

  return defineRoute(
    { input: refuseSchema, authenticate: async () => requirePlatformAdmin(await createClient()) },
    async ({ body, actor }) => {
      await refusePrivacyRequest(createAdminClient(), actor, { requestId, reason: body.reason });
      return { refused: true };
    },
  )(request);
}

export const dynamic = "force-dynamic";
