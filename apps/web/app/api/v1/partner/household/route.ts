import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { authenticatePartner } from "@wonderhome/core/developer/keys";
import { partnerHousehold } from "@wonderhome/core/developer/partner";

/**
 * The household a partner key belongs to (story 18-008): its name, time zone
 * and how many people are in it — never who. Needs `household.read`. Off (every
 * key refused) unless the deployment sets `WONDERHOME_DEVELOPER_API=on`.
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  return defineRoute({ authenticate: () => authenticatePartner(admin, request) }, async ({ actor }) => ({
    household: await partnerHousehold(admin, actor),
  }))(request);
}

export const dynamic = "force-dynamic";
