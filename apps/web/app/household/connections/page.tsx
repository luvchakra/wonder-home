import { listConnections } from "@wonderhome/core/connections/repository";
import { connectorCatalog } from "@wonderhome/core/connectors/registry";
import { listMembers } from "@wonderhome/core/identity/households";
import { connectionSessionStatus } from "@wonderhome/core/portals/session-repository";
import { listConnectionScrapeUrls } from "@wonderhome/core/portals/scrape-url-repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";

import { ConnectionsManager, type ChildOption, type ConnectionView } from "../../_components/connections-manager";
import { connectionsLabels } from "../../_lib/connections-labels";
import { requireSession } from "../../_lib/session";

export const metadata = { title: "Connections" };
export const dynamic = "force-dynamic";

/** Where a link-flow connector is connected (it owns its own connect UI). */
const LINK_HREFS: Record<string, string> = { whatsapp: "/settings/whatsapp" };

/**
 * Connections (Connections framework). A household's named connections, each of
 * a connector type the product defines. Every member sees them (to pick in
 * features); any adult creates and changes them. A created connection is then
 * selectable wherever a feature needs one of its capabilities.
 */
export default async function ConnectionsPage() {
  const session = await requireSession("/household/connections");
  const { supabase, membership, viewer, secondary, locale } = session;
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
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/household/connections"
      back={{ href: "/household", label: t("manage.backToManage") }}
      title={t("manage.connections.title")}
    >
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("manage.connections.title")}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.connections.lede")}</p>
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

        <QuoteCard>{t("manage.connections.lede")}</QuoteCard>
      </div>
    </AppShell>
  );
}
