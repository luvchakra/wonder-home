import { z } from "zod";

import { supabaseIdempotencyStore } from "@wonderhome/core/api/idempotency";
import { defineRoute } from "@wonderhome/core/api/route";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { authenticatePartner, type PartnerActor } from "@wonderhome/core/developer/keys";
import { partnerAddGroceries, partnerGroceries } from "@wonderhome/core/developer/partner";

/**
 * The grocery list, for a partner key (story 18-008). GET needs
 * `groceries.read`; POST needs `groceries.write`, adds through the same
 * service the Groceries screen uses, never a second copy of something
 * already there, and honours an Idempotency-Key. A sandbox key reads
 * fixtures and writes nothing.
 */
export async function GET(request: Request) {
  return defineRoute({ authenticate: () => authenticatePartner(createAdminClient, request) }, async ({ actor }) => ({
    items: await partnerGroceries(createAdminClient(), actor),
  }))(request);
}

const addSchema = z.object({
  items: z.array(z.string().trim().min(1).max(80)).min(1).max(25),
});

export async function POST(request: Request) {
  let actor: Promise<PartnerActor> | null = null;
  const authenticate = () => (actor ??= authenticatePartner(createAdminClient, request));
  return defineRoute(
    {
      input: addSchema,
      authenticate,
      // Scoped to the key's own household, which authentication has already settled.
      idempotency: async () => supabaseIdempotencyStore(createAdminClient(), (await authenticate()).householdId),
    },
    async ({ actor: caller, body }) => ({ results: await partnerAddGroceries(createAdminClient(), caller, body.items) }),
  )(request);
}

export const dynamic = "force-dynamic";
