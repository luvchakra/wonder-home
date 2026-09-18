import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import type { CalendarConnector } from "@wonderhome/core/family/calendar-connector";
import { calendarSyncPorts, syncCalendar } from "@wonderhome/core/family/calendar-sync";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { getConnector } from "@wonderhome/core/integrations/registry";
import { listIdentities, loadConnection } from "@wonderhome/core/integrations/repository";

/**
 * Sync the household's connected calendar now (story 17-002).
 *
 * An administrator's action, because it runs a connector against a credential
 * the household granted. The response is counts and the connection's health —
 * never a provider payload, and never where the credential lives.
 *
 * No calendar provider is live. Until one has credentials, consent flow,
 * authentication and integration tests, the registry has no connector for it
 * and this endpoint says so rather than pretending to sync.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);

    const entitlement = await may(supabase, householdId, "family.events");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const provider = new URL(request.url).searchParams.get("provider") ?? undefined;
    const connection = await loadConnection(supabase, householdId, "calendar", provider);
    if (!connection) throw ApiError.notFound("No calendar is connected to this household.");

    const connector = getConnector("calendar", connection.provider) as CalendarConnector | null;
    if (!connector) {
      throw ApiError.conflict(
        "This calendar provider is not configured. A provider goes live only once its credentials, consent flow and integration tests are in place.",
        { provider: connection.provider },
      );
    }

    const mappings = await listIdentities(supabase, connection.id);
    return await syncCalendar({ connector, connection, mappings, ports: calendarSyncPorts(supabase, connection) });
  })(request);
}

export const dynamic = "force-dynamic";
