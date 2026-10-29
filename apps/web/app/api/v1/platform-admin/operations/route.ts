import { defineRoute } from "@wonderhome/core/api/route";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
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
  const actor = await requirePlatformAdmin(supabase);

  return { summary: await operationsSummary(adminClientFor(adminGrant.platformAdmin(actor, "read the operations summary"))) };
});

export const dynamic = "force-dynamic";
