import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { agentRunDetail } from "@wonderhome/core/platform/ai-operations";
import { requirePlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * One agent run, for the "why did this fail" drill-down from the AI
 * operations overview (story 16-006).
 */
type Params = { params: Promise<{ runId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { runId } = await params;

  return defineRoute({ authenticate: async () => requirePlatformAdmin(await createClient()) }, async ({ actor }) => {
    const run = await agentRunDetail(createAdminClient(), actor, runId);
    if (!run) throw ApiError.notFound("No such run.");
    return { run };
  })(request);
}

export const dynamic = "force-dynamic";
