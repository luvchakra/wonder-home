import { z } from "zod";

import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { linkProviderPlan } from "@wonderhome/core/billing/provider-plans";
import { billingProviderNamed } from "@wonderhome/core/billing/router";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient } from "@wonderhome/core/db/server";
import { platformCan, requirePlatformAdmin, type PlatformAdmin } from "@wonderhome/core/platform/admin";

/**
 * Creates or links the payment provider's plan for one of our prices
 * (Platform admin → Plans & billing → Payment provider plans). Without `ref`
 * the plan is created at the provider from our price; with `ref` that plan is
 * read back and linked only when it bills exactly our price. Platform owner
 * only. The provider's id never reaches a household's browser.
 */
type Params = { params: Promise<{ priceId: string }> };

async function requireOwner(): Promise<PlatformAdmin> {
  const actor = await requirePlatformAdmin(await createClient());
  if (!platformCan(actor, "plans.edit")) throw ApiError.forbidden("Only the platform owner can link a price to a payment provider.");
  return actor;
}

const bodySchema = z.object({
  provider: z.enum(["razorpay"]),
  ref: z.string().trim().regex(/^plan_[A-Za-z0-9]{6,40}$/, "A Razorpay plan id starts with plan_").optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { priceId } = await params;

  return defineRoute({ input: bodySchema, authenticate: requireOwner }, async ({ body, actor, requestId }) => {
    if (!z.uuid().safeParse(priceId).success) throw ApiError.notFound("No such active price.");
    const admin = adminClientFor(adminGrant.platformAdmin(actor, "link a price to the payment provider's plan"));
    const linked = await linkProviderPlan(admin, actor, billingProviderNamed(body.provider), { priceId, ref: body.ref ?? null, requestId });
    return { priceId, provider: body.provider, ref: linked.ref, created: linked.created };
  })(request);
}

export const dynamic = "force-dynamic";
