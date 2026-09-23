import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import type { DeviceConnector } from "@wonderhome/core/home/device-connector";
import { deviceSyncPorts } from "@wonderhome/core/home/device-repository";
import { syncDevices } from "@wonderhome/core/home/device-sync";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { getConnector } from "@wonderhome/core/integrations/registry";
import { loadConnection } from "@wonderhome/core/integrations/repository";

/**
 * Sync the household's connected smart-home provider now (story 17-008).
 *
 * An administrator's action, since it runs a connector against a credential
 * the household granted — and the only caller of the service role here, which
 * writes devices and readings a session never may. The response is counts and
 * the connection's health, never a reading.
 *
 * No device provider is live. Until one has credentials, a consent flow,
 * authentication and integration tests, the registry has no connector for it
 * and this endpoint says so rather than pretending to sync.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);

    const entitlement = await may(supabase, householdId, "integrations.deep");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const provider = new URL(request.url).searchParams.get("provider") ?? undefined;
    const connection = await loadConnection(supabase, householdId, "smart_home", provider);
    if (!connection) throw ApiError.notFound("No smart-home provider is connected to this household.");

    const connector = getConnector("smart_home", connection.provider) as DeviceConnector | null;
    if (!connector) {
      throw ApiError.conflict(
        "This device provider is not configured. A provider goes live only once its credentials, consent flow and integration tests are in place.",
        { provider: connection.provider },
      );
    }

    return await syncDevices({ connector, connection, ports: deviceSyncPorts(supabase, createAdminClient(), connection) });
  })(request);
}

export const dynamic = "force-dynamic";
