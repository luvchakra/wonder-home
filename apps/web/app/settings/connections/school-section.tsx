import { listConnections } from "@wonderhome/core/connections/repository";
import { connectionSessionStatus } from "@wonderhome/core/portals/session-repository";

import { SchoolConnect, type SchoolConnectionView } from "../../_components/school-connect";
import { schoolConnectLabels } from "../../_lib/school-connect-labels";
import type { Session } from "../../_lib/session";

/**
 * Connect school (stories 08-029, 08-031; redesigned around Connections, 2026-10-28).
 *
 * Two honest paths and nothing more. Forward a circular or photo into HomeSend —
 * works for any school, no setup. Or connect the school's website as a
 * browser-automation *connection*, created and tested on the Connections page and
 * reusable anywhere; this section only points there and lists the ones that exist.
 * Rendered on Connections for whoever may manage integrations.
 * No demo portal, no inline sign-in — that lived here before the framework did.
 */
export async function SchoolSection({ session }: { session: Session }) {
  const { supabase, membership, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;

  const [connectionRows, sessionStates] = await Promise.all([
    listConnections(supabase, householdId, { connectorType: "browser-automation" }).catch(() => []),
    connectionSessionStatus(supabase, householdId).catch(() => []),
  ]);
  const stateBy = new Map(sessionStates.map((s) => [s.connectionId, s.state]));
  const connections: SchoolConnectionView[] = connectionRows.map((connection) => ({
    id: connection.id,
    name: connection.name,
    url: typeof connection.params.url === "string" ? connection.params.url : null,
    connectionState: stateBy.get(connection.id) ?? null,
  }));

  return (
    <section id="school" className="scroll-mt-20 space-y-4">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">{t("school.connect.title")}</h2>
        <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("school.connect.lede")}</p>
      </header>
      <SchoolConnect householdId={householdId} connections={connections} connectionsHref="#accounts" forwardHref="/school" labels={schoolConnectLabels(t)} />
    </section>
  );
}
