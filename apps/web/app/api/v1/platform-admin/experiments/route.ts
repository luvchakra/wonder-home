import { z } from "zod";

import { defineRoute } from "@wonderhome/core/api/route";
import { EXPERIMENT_REASON_CODES, createExperiment, listExperiments } from "@wonderhome/core/billing/experiments";
import { createAdminClient } from "@wonderhome/core/db/admin";

import { requireExperimentManager } from "@/app/_lib/experiment-guard";

/**
 * Entitlement experiments (story 20-008).
 *
 * GET lists every experiment with, for any that has started, how many
 * households are in each group and what each group used of the feature this
 * period — counts only. POST creates a draft; nothing changes for any
 * household until it is started. Both need `subscription.manage`.
 */
export async function GET(request: Request) {
  return defineRoute({ authenticate: requireExperimentManager }, async () => ({ experiments: await listExperiments(createAdminClient()) }))(request);
}

const draftSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/),
  featureKey: z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/),
  description: z.string().min(10).max(300),
  planKeys: z.array(z.string().min(1).max(40)).min(1).max(10),
  treatmentPercent: z.number().int().min(1).max(100),
  treatmentEnabled: z.boolean(),
  treatmentLimit: z.number().int().min(0).nullable(),
  treatmentPeriod: z.enum(["day", "month", "year", "forever"]),
  reasonCode: z.enum(EXPERIMENT_REASON_CODES),
});

export async function POST(request: Request) {
  return defineRoute({ input: draftSchema, authenticate: requireExperimentManager }, async ({ body, actor }) => {
    const { reasonCode, ...draft } = body;
    return { experiment: await createExperiment(createAdminClient(), { actorProfileId: actor.profileId, reasonCode, draft }) };
  })(request);
}

export const dynamic = "force-dynamic";
