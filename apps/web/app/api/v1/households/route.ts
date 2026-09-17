import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { createHousehold, listMemberships } from "@wonderhome/core/identity/households";
import { createHouseholdSchema } from "@wonderhome/core/identity/schemas";

/** Every household the caller belongs to, with their identity and roles in each. */
export const GET = defineRoute({}, async () => {
  await requireUser();
  const supabase = await createClient();
  return { memberships: await listMemberships(supabase) };
});

/** Creates a household and makes the caller its Head of Family. */
export const POST = defineRoute({ input: createHouseholdSchema }, async ({ body }) => {
  await requireUser();
  const supabase = await createClient();
  const created = await createHousehold(supabase, body);

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
});

export const dynamic = "force-dynamic";
