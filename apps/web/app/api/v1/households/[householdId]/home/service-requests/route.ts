import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { createServiceRequest, listServiceRequests } from "@wonderhome/core/home/repository";
import { createServiceRequestSchema } from "@wonderhome/core/home/schemas";
import { requireMembership } from "@wonderhome/core/identity/households";

type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);
    return { requests: await listServiceRequests(supabase, householdId) };
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: createServiceRequestSchema }, async ({ body }) => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const created = await createServiceRequest(supabase, { householdId, ...body });

    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
