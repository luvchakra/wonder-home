import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import type { EmailConnector } from "@wonderhome/core/finance/email-connector";
import { emailSyncPorts, syncEmail } from "@wonderhome/core/finance/email-sync";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { getConnector } from "@wonderhome/core/integrations/registry";
import { loadConnection } from "@wonderhome/core/integrations/repository";

/**
 * Sync the household's connected mailbox now (story 17-003).
 *
 * An administrator's action, since it runs a connector against a credential
 * the household granted. The response is counts and the connection's health —
 * never a provider payload, and never a message's contents.
 *
 * No mail provider is live. Until one has credentials, consent flow,
 * authentication and integration tests, the registry has no connector for it
 * and this endpoint says so rather than pretending to sync.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);

    const entitlement = await may(supabase, householdId, "finance.bills");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const provider = new URL(request.url).searchParams.get("provider") ?? undefined;
    const connection = await loadConnection(supabase, householdId, "email", provider);
    if (!connection) throw ApiError.notFound("No mailbox is connected to this household.");

    const connector = getConnector("email", connection.provider) as EmailConnector | null;
    if (!connector) {
      throw ApiError.conflict(
        "This mail provider is not configured. A provider goes live only once its credentials, consent flow and integration tests are in place.",
        { provider: connection.provider },
      );
    }

    return await syncEmail({ connector, connection, ports: emailSyncPorts(supabase, connection) });
  })(request);
}

export const dynamic = "force-dynamic";
