import { z } from "zod";

import { parseQuery } from "@wonderhome/core/api/query";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { requirePlatformAdmin } from "@wonderhome/core/platform/admin";
import { listPlatformPrivacyRequests, type ListPrivacyRequestsFilter } from "@wonderhome/core/platform/privacy-requests";

/**
 * Privacy request visibility, platform-wide (story 16-007). Gated on
 * `privacy_requests.manage` — operator/owner, the same boundary
 * `feature_flags.manage` already draws for a household-affecting action
 * support has no standing need for.
 */
export async function GET(request: Request) {
  return defineRoute({ authenticate: async () => requirePlatformAdmin(await createClient()) }, async ({ actor }) => {
    const { status, kind, householdId } = parseQuery(
      request,
      z
        .object({
          status: z.enum(["pending", "ready", "completed", "cancelled", "refused"]).optional(),
          kind: z.enum(["export", "deletion"]).optional(),
          householdId: z.uuid().optional(),
        })
        .strict(),
    );
    const filter: ListPrivacyRequestsFilter = {};
    if (status) filter.status = status;
    if (kind) filter.kind = kind;
    if (householdId) filter.householdId = householdId;

    const requests = await listPlatformPrivacyRequests(createAdminClient(), actor, filter);
    return { requests };
  })(request);
}

export const dynamic = "force-dynamic";
