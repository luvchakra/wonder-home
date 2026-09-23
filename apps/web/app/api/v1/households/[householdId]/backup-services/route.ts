import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { createBackupService, createBackupServiceSchema, listBackupServices, loadBackupCoverage } from "@wonderhome/core/household/backup-services";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

/**
 * Backup services (story 07-008). GET is the household's services and the
 * coming fortnight's cover — which absences leave an outcome uncovered, and
 * who could step in. POST adds a service. Admin only, as RLS also insists.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);
    const [services, coverage] = await Promise.all([listBackupServices(supabase, householdId), loadBackupCoverage(supabase, householdId)]);
    return { services, coverage };
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: createBackupServiceSchema, authenticate: requireUser }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId);
    const created = await createBackupService(supabase, {
      householdId,
      createdByMemberId: membership.memberId,
      name: body.name,
      contact: body.contact ?? null,
      covers: body.covers,
      notes: body.notes ?? null,
    });
    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
