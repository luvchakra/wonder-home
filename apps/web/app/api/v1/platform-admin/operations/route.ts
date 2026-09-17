import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { operationsSummary, requirePlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * Operations overview (story 16-003).
 *
 * Aggregates only, and behind the platform boundary. A caller who is not staff
 * gets a 404: confirming that this endpoint exists would tell them where to
 * point the next attempt.
 */
export const GET = defineRoute({}, async () => {
  const supabase = await createClient();
  await requirePlatformAdmin(supabase);

  return { summary: await operationsSummary(createAdminClient()) };
});

export const dynamic = "force-dynamic";
