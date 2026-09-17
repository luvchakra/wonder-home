import { requireUser } from "@wonderhome/core/api/auth";
import { defineRoute } from "@wonderhome/core/api/route";
import { createClient } from "@wonderhome/core/db/server";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * The household's provider connections and their health (story 17-001).
 *
 * Deliberately says nothing a provider told us and nothing about where a
 * credential lives — a connection's name, what it is for, whether it is working
 * and whether anybody needs to do something about it.
 */
type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    return { integrations: await listIntegrations(supabase, householdId) };
  })(request);
}

export const dynamic = "force-dynamic";
