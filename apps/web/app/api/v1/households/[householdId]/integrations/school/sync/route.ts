import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { getConnector } from "@wonderhome/core/integrations/registry";
import { listIdentities, loadConnection } from "@wonderhome/core/integrations/repository";
import type { SchoolConnector } from "@wonderhome/core/school/connector";
import { syncSchool } from "@wonderhome/core/school/school-sync";
import { schoolSyncPorts } from "@wonderhome/core/school/sync-ports";

/**
 * Sync the household's connected school portal now (story 17-004).
 *
 * An administrator's action, since it runs a connector against a credential
 * the household granted. The response is counts and the connection's health —
 * never a provider payload, and never a child's work.
 *
 * No school provider is live. Until one has credentials, consent flow,
 * authentication and integration tests, the registry has no connector for it
 * and this endpoint says so rather than pretending to sync.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);

    const entitlement = await may(supabase, householdId, "school.connector");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const provider = new URL(request.url).searchParams.get("provider") ?? undefined;
    const connection = await loadConnection(supabase, householdId, "school", provider);
    if (!connection) throw ApiError.notFound("No school portal is connected to this household.");

    const connector = getConnector("school", connection.provider) as SchoolConnector | null;
    if (!connector) {
      throw ApiError.conflict(
        "This school provider is not configured. A provider goes live only once its credentials, consent flow and integration tests are in place.",
        { provider: connection.provider },
      );
    }

    const mappings = await listIdentities(supabase, connection.id);
    return await syncSchool({ connector, connection, mappings, ports: schoolSyncPorts(supabase, connection) });
  })(request);
}

export const dynamic = "force-dynamic";
