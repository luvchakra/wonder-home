import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { ingestSchoolChannelMessage } from "@wonderhome/core/homesend/ingest";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { recordChannelPoll, listSchoolChannels } from "@wonderhome/core/school/channel-repository";
import { syncSchoolChannels, type ChannelMessageFetcher } from "@wonderhome/core/school/channel-sync";

/**
 * Poll the household's tracked school channels now (stories 08-029, 08-031).
 *
 * An administrator's action. For each active channel it asks the provider for
 * new messages and files each through HomeSend, awaiting a person. Nothing is
 * written back to the portal.
 *
 * No portal is live. Until a provider ships a channel adapter there is nothing
 * to fetch, so this reports that plainly rather than pretending to poll. The one
 * place a real fetcher plugs in is `fetcherFor`.
 */
type Params = { params: Promise<{ householdId: string }> };

/**
 * Channel-message fetchers by provider. Empty today: no school provider has a
 * live channel adapter yet (CLAUDE.md governs the flip). A provider's fetcher is
 * registered here with its adapter, its credentials and its integration tests.
 */
const CHANNEL_FETCHERS: Record<string, ChannelMessageFetcher> = {};

function fetcherFor(provider: string): ChannelMessageFetcher | null {
  return CHANNEL_FETCHERS[provider] ?? null;
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, householdId);

    const entitlement = await may(supabase, householdId, "school.connector");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const connections = (await listIntegrations(supabase, householdId))
      .filter((integration) => integration.kind === "school")
      .filter((integration) => fetcherFor(integration.provider));
    if (connections.length === 0) {
      return { ok: true, channelsPolled: 0, filed: 0, note: "No live school provider to poll yet." };
    }

    const channels = await listSchoolChannels(supabase, householdId, { activeOnly: true });
    let channelsPolled = 0;
    let filed = 0;
    for (const connection of connections) {
      const fetch = fetcherFor(connection.provider)!;
      const report = await syncSchoolChannels({
        householdId,
        channels: channels.filter((channel) => channel.integrationId === connection.id),
        ports: {
          fetch,
          fileMessage: async (actor, intake) => {
            await ingestSchoolChannelMessage(supabase, actor, intake);
          },
          recordPoll: async (id, lastMessageExternalId) => {
            await recordChannelPoll(supabase, { householdId, id, lastMessageExternalId });
          },
        },
      });
      channelsPolled += report.channelsPolled;
      filed += report.filed;
    }
    return { ok: true, channelsPolled, filed };
  })(request);
}

export const dynamic = "force-dynamic";
