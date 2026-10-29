import { GraduationCap } from "lucide-react";

import { listConnections } from "@wonderhome/core/connections/repository";
import { connectionSessionStatus } from "@wonderhome/core/portals/session-repository";
import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";

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
    <CollapsibleSection id="school" icon={GraduationCap} tone="school" title={t("school.connect.title")} intro={t("school.connect.lede")}>
      <SchoolConnect householdId={householdId} connections={connections} connectionsHref="#accounts" forwardHref="/school" labels={schoolConnectLabels(t)} />
    </CollapsibleSection>
  );
}
