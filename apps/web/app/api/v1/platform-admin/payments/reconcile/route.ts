import { defineRoute } from "@wonderhome/core/api/route";
import { ApiError } from "@wonderhome/core/api/errors";
import { reconcileAllProviders } from "@wonderhome/core/billing/reconcile";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { platformCan, requirePlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * Run reconciliation now (story 20-011), rather than waiting for the nightly
 * sweep. A provider that is not configured is skipped and says so. Requires
 * `payments.read`: it only reads providers and records differences.
 */
export async function POST(request: Request) {
  return defineRoute({ authenticate: async () => requirePlatformAdmin(await createClient()) }, async ({ actor }) => {
    if (!platformCan(actor, "payments.read")) throw ApiError.forbidden("Your platform role cannot see payments.");
    return { runs: await reconcileAllProviders(createAdminClient()) };
  })(request);
}

export const dynamic = "force-dynamic";
