import { z } from "zod";

import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { EXPERIMENT_REASON_CODES, listExperiments, moveExperiment } from "@wonderhome/core/billing/experiments";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";

import { requireExperimentManager } from "@/app/_lib/experiment-guard";

/**
 * One entitlement experiment (story 20-008): read it, start it, or stop it.
 * Its terms never change once it starts; stopping returns every household
 * to its plan as sold and removes nothing anyone made meanwhile.
 */
type Params = { params: Promise<{ experimentKey: string }> };

export async function GET(request: Request, { params }: Params) {
  const { experimentKey } = await params;
  return defineRoute({ authenticate: requireExperimentManager }, async ({ actor }) => {
    const experiment = (await listExperiments(adminClientFor(adminGrant.platformAdmin(actor, "read an entitlement experiment")))).find((entry) => entry.key === experimentKey);
    if (!experiment) throw ApiError.notFound("There is no such experiment.");
    return { experiment };
  })(request);
}

const moveSchema = z.object({
  to: z.enum(["running", "stopped"]),
  reasonCode: z.enum(EXPERIMENT_REASON_CODES),
});

export async function PATCH(request: Request, { params }: Params) {
  const { experimentKey } = await params;
  return defineRoute({ input: moveSchema, authenticate: requireExperimentManager }, async ({ body, actor }) => ({
    experiment: await moveExperiment(adminClientFor(adminGrant.platformAdmin(actor, "move an entitlement experiment")), { key: experimentKey, to: body.to, actorProfileId: actor.profileId, reasonCode: body.reasonCode }),
  }))(request);
}

export const dynamic = "force-dynamic";
