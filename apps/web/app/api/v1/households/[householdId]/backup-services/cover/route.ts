import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { arrangeCover, arrangeCoverSchema } from "@wonderhome/core/household/backup-services";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

/**
 * Arranges a backup service to cover one outcome on one day (story 07-008):
 * a service request with the service's name and contact and the household's
 * move next. Asking again for the same outcome and day returns the first.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: arrangeCoverSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);
    const result = await arrangeCover(supabase, { householdId, ...body });
    return new Response(JSON.stringify(result), {
      status: result.created ? 201 : 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
