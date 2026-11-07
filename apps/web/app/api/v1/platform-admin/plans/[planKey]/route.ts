import { z } from "zod";

import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { planEditSchema, savePlan } from "@wonderhome/core/billing/plan-edit";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient } from "@wonderhome/core/db/server";
import { platformCan, requirePlatformAdmin, type PlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * Edit a plan: its name, description, prices and what it includes.
 *
 * PATCH with `confirm: false` writes nothing and returns what saving would
 * change, in sentences; `confirm: true` saves it. Platform owner only
 * (`plans.edit`); other staff can read the page and nothing more. A plan's
 * burst and fair-use policies keep their own route (`./policies`).
 */
type Params = { params: Promise<{ planKey: string }> };

async function requirePlanEditor(): Promise<PlatformAdmin> {
  const actor = await requirePlatformAdmin(await createClient());
  if (!platformCan(actor, "plans.edit")) throw ApiError.forbidden("Only the platform owner can edit a plan.");
  return actor;
}

const bodySchema = z.object({ edit: planEditSchema, confirm: z.boolean() });

export async function PATCH(request: Request, { params }: Params) {
  const { planKey } = await params;

  return defineRoute({ input: bodySchema, authenticate: requirePlanEditor }, async ({ body, actor, requestId }) => {
    const admin = adminClientFor(adminGrant.platformAdmin(actor, "edit a plan as members see it"));
    const result = await savePlan(admin, actor, planKey, body.edit, { dryRun: !body.confirm, requestId });
    return { planKey, saved: result.changed, lines: result.changes.map((change) => change.line) };
  })(request);
}

export const dynamic = "force-dynamic";
