import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { ApiError } from "@wonderhome/core/api/errors";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { createSchoolItem, schoolAgenda } from "@wonderhome/core/school/repository";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";

/**
 * School work that needs the household (module 08).
 *
 * The entitlement check runs here, on the server, before anything is read —
 * the acceptance criterion is that a direct API call cannot bypass it even when
 * the UI does not render the feature. Guardianship is enforced underneath by
 * RLS, so this route never has to decide which children the caller may see.
 */
const createItemSchema = z.object({
  childMemberId: z.uuid(),
  kind: z.enum(SCHOOL_ITEM_KINDS),
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(80).nullish(),
  detail: z.string().trim().max(2000).nullish(),
  dueAt: z.iso.datetime({ offset: true }).nullish(),
  estimatedMinutes: z.number().int().min(1).max(600).nullish(),
});

type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "school.connector");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    return await schoolAgenda(supabase, householdId);
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: createItemSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "school.connector");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const created = await createSchoolItem(supabase, { householdId, ...body });

    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
