import { ShieldCheck } from "lucide-react";

import { listConnections } from "@wonderhome/core/connections/repository";
import { connectionSessionStatus } from "@wonderhome/core/portals/session-repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { EmptyState } from "@wonderhome/core/ui/states";

import { SchoolConnect, type SchoolConnectionView } from "../../../_components/school-connect";
import { schoolConnectLabels } from "../../../_lib/school-connect-labels";
import { requireSession } from "../../../_lib/session";

export const metadata = { title: "Connect school" };
export const dynamic = "force-dynamic";

/**
 * Connect school (stories 08-029, 08-031; redesigned around Connections, 2026-10-28).
 *
 * Two honest paths and nothing more. Forward a circular or photo into HomeSend —
 * works for any school, no setup. Or connect the school's website as a
 * browser-automation *connection*, created and tested on the Connections page and
 * reusable anywhere; this screen only points there and lists the ones that exist.
 * No demo portal, no inline sign-in — that lived here before the framework did.
 */
export default async function ConnectSchoolPage() {
  const session = await requireSession("/household/integrations/school");
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const shell = {
    active: "more" as const,
    viewer,
    secondary,
    pathname: "/household/integrations/school",
    back: { href: "/household/integrations", label: t("manage.section.integrations") },
    title: t("school.connect.title"),
  };

  if (!view.permissions.includes("integrations.manage")) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ShieldCheck} title={t("manage.forAdmins")} description={t("school.connect.adminOnly")} />
      </AppShell>
    );
  }

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
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("school.connect.title")}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("school.connect.lede")}</p>
        </header>
        <SchoolConnect householdId={householdId} connections={connections} connectionsHref="/household/connections" forwardHref="/school" labels={schoolConnectLabels(t)} />
      </div>
    </AppShell>
  );
}
