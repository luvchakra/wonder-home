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
    const raw = Number(new URL(request.url).searchParams.get("days") ?? 30);
    const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.round(raw))) : 30;
    return { overview: await paymentsOverview(createAdminClient(), actor, days) };
  })(request);
}

export const dynamic = "force-dynamic";
