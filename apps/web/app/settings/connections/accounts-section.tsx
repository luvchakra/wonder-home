import { listConnections } from "@wonderhome/core/connections/repository";
import { connectorCatalog } from "@wonderhome/core/connectors/registry";
import { listMembers } from "@wonderhome/core/identity/households";
import { connectionSessionStatus } from "@wonderhome/core/portals/session-repository";
import { listConnectionScrapeUrls } from "@wonderhome/core/portals/scrape-url-repository";

import { ConnectionsManager, type ChildOption, type ConnectionView } from "../../_components/connections-manager";
import { connectionsLabels } from "../../_lib/connections-labels";
import type { Session } from "../../_lib/session";

/** Where a link-flow connector is connected (it owns its own connect UI). */
const LINK_HREFS: Record<string, string> = { whatsapp: "#whatsapp" };

/**
 * Connections (Connections framework). A household's named connections, each of
 * a connector type the product defines. Every member sees them (to pick in
 * features); any adult creates and changes them. A created connection is then
 * selectable wherever a feature needs one of its capabilities.
 */
export async function AccountsSection({ session }: { session: Session }) {
  const { supabase, membership, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const canCreate = membership.memberType === "adult";

  const [connections, sessionStates, members] = await Promise.all([
    listConnections(supabase, householdId).catch(() => []),
    connectionSessionStatus(supabase, householdId).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
  ]);
  const stateBy = new Map(sessionStates.map((s) => [s.connectionId, s]));
  const children: ChildOption[] = members.filter((m) => m.memberType === "child").map((m) => ({ id: m.id, name: m.displayName }));
  const childName = new Map(children.map((c) => [c.id, c.name]));

  // The pages each browser-automation connection reads (only those need them).
  const scrapeByConnection = new Map<string, Awaited<ReturnType<typeof listConnectionScrapeUrls>>>();
  await Promise.all(
    connections
      .filter((c) => c.connectorType === "browser-automation")
      .map(async (c) => {
        scrapeByConnection.set(c.id, await listConnectionScrapeUrls(supabase, c.id).catch(() => []));
      }),
  );

  const connectors = [...connectorCatalog()];
  const view: ConnectionView[] = connections.map((c) => ({
    id: c.id,
    name: c.name,
    connectorType: c.connectorType,
    status: c.status,
    params: c.params,
    connectionState: stateBy.get(c.id)?.state ?? null,
    scrapeUrls: (scrapeByConnection.get(c.id) ?? []).map((p) => ({
      id: p.id,
      url: p.url,
      kind: p.kind,
      childName: p.childMemberId ? childName.get(p.childMemberId) ?? null : null,
      enabled: p.enabled,
    })),
  }));

  return (
    <section id="accounts" className="scroll-mt-20 space-y-4">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">{t("connectionsPage.accounts")}</h2>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("manage.connections.lede")}</p>
      </header>
      <ConnectionsManager
        householdId={householdId}
        canCreate={canCreate}
        connectors={connectors}
        connections={view}
        childOptions={children}
        labels={connectionsLabels(t)}
        linkHrefs={LINK_HREFS}
      />
    </section>
  );
}
