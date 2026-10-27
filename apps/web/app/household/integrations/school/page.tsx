import { ShieldCheck } from "lucide-react";

import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { listMembers } from "@wonderhome/core/identity/households";
import { listSchoolChannels } from "@wonderhome/core/school/channel-repository";
import { schoolPortalCredentialStatus } from "@wonderhome/core/school/portal-credentials";
import { schoolProviderCatalog } from "@wonderhome/core/school/providers";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { EmptyState } from "@wonderhome/core/ui/states";

import { SchoolConnect, type ChildOption, type PortalView } from "../../../_components/school-connect";
import { schoolConnectLabels } from "../../../_lib/school-connect-labels";
import { requireSession } from "../../../_lib/session";

export const metadata = { title: "Connect school" };
export const dynamic = "force-dynamic";

/**
 * Connect school (stories 08-029, 08-031).
 *
 * The screen the Integrations "School" card opens. It leads with the forward
 * path — which works for any school today — and lists the portals a deployment
 * can switch on, each honest about not being live yet. A connected portal that
 * has channels lets an Admin paste a class-group or notice-board link to track.
 *
 * Managing a connection is an Admin's, so a non-admin sees why they cannot.
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

  const [integrations, channels, members, portalSignins] = await Promise.all([
    listIntegrations(supabase, householdId).catch(() => []),
    listSchoolChannels(supabase, householdId).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
    schoolPortalCredentialStatus(supabase, householdId).catch(() => []),
  ]);

  const schoolIntegrations = integrations.filter((integration) => integration.kind === "school");
  // Which connection is signed in, and as whom (never the password).
  const signedInAs = new Map(portalSignins.map((signin) => [signin.integrationId, signin.username]));
  const children: ChildOption[] = members
    .filter((member) => member.memberType === "child")
    .map((member) => ({ id: member.id, name: member.displayName }));
  const childName = new Map(children.map((child) => [child.id, child.name]));

  const portals: PortalView[] = schoolProviderCatalog()
    .filter((entry) => entry.auth !== "manual")
    .map((entry) => {
      const connection = schoolIntegrations.find((integration) => integration.provider === entry.id) ?? null;
      const ours = connection ? channels.filter((channel) => channel.integrationId === connection.id) : [];
      return {
        id: entry.id,
        label: entry.label,
        blurb: entry.blurb,
        auth: entry.auth,
        connected: Boolean(connection),
        connectedAs: connection ? signedInAs.get(connection.id) ?? null : null,
        adapterReady: entry.adapterReady,
        integrationId: connection?.id ?? null,
        statusLabel: connection?.statusLabel ?? null,
        hasChannels: Boolean(entry.channel),
        channelExample: entry.channel?.example ?? null,
        portalUrl: entry.portalUrl ?? null,
        channels: ours.map((channel) => ({
          id: channel.id,
          url: channel.url,
          childName: channel.childMemberId ? childName.get(channel.childMemberId) ?? null : null,
          active: channel.active,
        })),
      };
    });

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("school.connect.title")}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("school.connect.lede")}</p>
        </header>
        <SchoolConnect householdId={householdId} portals={portals} childOptions={children} labels={schoolConnectLabels(t)} forwardHref="/school" />
      </div>
    </AppShell>
  );
}
