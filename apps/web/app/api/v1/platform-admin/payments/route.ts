import { z } from "zod";

import { parseQuery } from "@wonderhome/core/api/query";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { requirePlatformAdmin } from "@wonderhome/core/platform/admin";
import { paymentsOverview } from "@wonderhome/core/platform/payments";

/**
 * Payments across every household (story 20-011): counts first, then
 * failures, refunds and what reconciliation found. Requires `payments.read`.
 */
export async function GET(request: Request) {
  return defineRoute({ authenticate: async () => requirePlatformAdmin(await createClient()) }, async ({ actor }) => {
    const { days } = parseQuery(request, z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).strict());
    return { overview: await paymentsOverview(createAdminClient(), actor, days) };
  })(request);
}

export const dynamic = "force-dynamic";
