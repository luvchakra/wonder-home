import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { financeAgenda, prepareIntent } from "@wonderhome/core/finance/repository";
import { requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";

/**
 * Bills: what is due, and preparing a payment for one.
 *
 * POST creates an intent awaiting approval and nothing else. It does not reach
 * a payment provider — none is configured, and per CLAUDE.md none is live until
 * credentials, authentication and integration tests exist. Approving an intent
 * and the step-up that requires are separate, deliberate acts.
 */
const prepareSchema = z.object({
  obligationId: z.uuid(),
  amountMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "finance.bills");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    // Who may see what is enforced again by RLS: a child reading this route
    // gets an empty agenda rather than a filtered one.
    return await financeAgenda(supabase, householdId);
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: prepareSchema }, async ({ body }) => {
    await requireUser();
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);

    const entitlement = await may(supabase, householdId, "finance.bills");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const intent = await prepareIntent(supabase, { householdId, ...body });

    return new Response(JSON.stringify(intent), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
