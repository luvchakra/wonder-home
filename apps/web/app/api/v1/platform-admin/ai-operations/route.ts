import { openPlatformKeyAlert } from "@wonderhome/core/ai/platform-key-alert";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { aiOperationsSummary, listFailedAgentRuns } from "@wonderhome/core/platform/ai-operations";
import { requirePlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * AI operations overview (story 16-006): platform-wide counts and the recent
 * failures behind them. Gated on `ai_operations.read`, which every platform
 * role holds — this is what WonderHome's own governance did, not household
 * content, so it needs no support-access grant.
 */
export const GET = defineRoute(
  { authenticate: async () => requirePlatformAdmin(await createClient()) },
  async ({ actor }) => {
    const adminClient = createAdminClient();
    const [summary, failedRuns, platformKeyAlert] = await Promise.all([
      aiOperationsSummary(adminClient, actor),
      listFailedAgentRuns(adminClient, actor),
      // WonderHome's own key refused by its provider (14-048); null while it works.
      openPlatformKeyAlert(adminClient).catch(() => null),
    ]);

    return { summary, failedRuns, platformKeyAlert };
  },
);

export const dynamic = "force-dynamic";
