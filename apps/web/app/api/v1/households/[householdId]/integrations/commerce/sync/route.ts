import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { commerceSyncPorts, syncCommerce } from "@wonderhome/core/commerce/commerce-sync";
import type { CommerceConnector } from "@wonderhome/core/commerce/orders";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { getConnector } from "@wonderhome/core/integrations/registry";
import { loadConnection } from "@wonderhome/core/integrations/repository";

/**
 * Ask the merchant where the household's orders are (story 17-005).
 *
 * An administrator's action, since it runs a connector against a credential
 * the household granted. The response is counts and health — never a merchant
 * payload — plus the two things a count cannot carry: status changes the
 * lifecycle refused, and orders whose price no longer matches what was agreed.
 * Both are returned rather than absorbed, because a sync that looked clean
 * while a merchant quietly repriced an order would be worse than one that
 * failed.
 *
 * No merchant is live. Until one has credentials, consent flow, authentication
 * and integration tests, the registry has no connector for it and this
 * endpoint says so rather than pretending to sync.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);

    const entitlement = await may(supabase, householdId, "commerce.orders");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const provider = new URL(request.url).searchParams.get("provider") ?? undefined;
    const connection = await loadConnection(supabase, householdId, "commerce", provider);
    if (!connection) throw ApiError.notFound("No merchant is connected to this household.");

    const connector = getConnector("commerce", connection.provider) as CommerceConnector | null;
    if (!connector) {
      throw ApiError.conflict(
        "This merchant is not configured. A provider goes live only once its credentials, consent flow and integration tests are in place.",
        { provider: connection.provider },
      );
    }

    return await syncCommerce({ connector, connection, ports: commerceSyncPorts(supabase, connection) });
  })(request);
}

export const dynamic = "force-dynamic";
