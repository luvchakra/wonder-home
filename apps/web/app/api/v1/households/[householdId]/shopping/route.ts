import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { prepareOrder, shoppingAgenda } from "@wonderhome/core/commerce/repository";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * Shopping: what the household is running out of, and what an order would cost.
 *
 * POST deliberately does not buy anything. It prices the basket and returns the
 * policy decision, because the acceptance criterion is that cost and quantity
 * are shown "before any purchase side effect occurs". Placing the order is a
 * separate, approved step.
 */
const prepareSchema = z.object({
  provider: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(40),
  currency: z.string().regex(/^[A-Z]{3}$/),
  forDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lineItems: z
    .array(
      z.object({
        consumableId: z.uuid().nullish(),
        description: z.string().trim().min(1).max(200),
        quantity: z.number().positive().max(1000),
        unitPriceMinor: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(100),
});

type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "commerce.orders");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    return await shoppingAgenda(supabase, householdId);
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: prepareSchema }, async ({ body }) => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "commerce.orders");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    return await prepareOrder(supabase, {
      householdId,
      provider: body.provider,
      category: body.category,
      currency: body.currency,
      forDate: body.forDate,
      lineItems: body.lineItems.map((item) => ({
        consumableId: item.consumableId ?? null,
        description: item.description,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
      })),
    });
  })(request);
}

export const dynamic = "force-dynamic";
