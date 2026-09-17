import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { createChildMember, listChildren } from "@wonderhome/core/identity/children";
import { requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";

const createChildSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD." })
    .optional(),
  guardianMemberIds: z.array(z.uuid()).max(8).optional(),
});

type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;
  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);
    return { children: await listChildren(supabase, householdId) };
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;
  return defineRoute({ input: createChildSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);

    const created = await createChildMember(supabase, { householdId, ...body });

    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
