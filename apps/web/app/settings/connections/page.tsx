import { Store } from "lucide-react";

import { instamartMode } from "@wonderhome/core/commerce/instamart/config";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Card } from "@wonderhome/core/ui/card";
import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";
import { PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";

import { requireSession } from "../../_lib/session";
import { AccountsSection } from "./accounts-section";
import { IntegrationsSections } from "./integrations-section";
import { SchoolSection } from "./school-section";
import { VoiceAssistantsSection } from "./voice-section";
import { WhatsAppSection } from "./whatsapp-section";

export const metadata = { title: "Connections" };
export const dynamic = "force-dynamic";

/**
 * Connections: everything WonderHome is linked to, on one page
 * (design/UI-SIMPLIFICATION-v1.md M2). It replaces five: WhatsApp, Voice
 * assistants, the household's named connections, Integrations and Connect
 * school, each now a section here with its old address redirecting to its
 * anchor. Each section keeps its own rules: a person sees their own WhatsApp
 * and voice links (an Admin everyone's), every member sees the named
 * connections (adults change them), and only someone who may manage
 * integrations sees school, providers, devices, weather and partner keys.
 * Swiggy Instamart is connected where it is used, on the order page; this page
 * says whether it is and leads there.
 */
export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ connected?: string }> }) {
  const [{ connected }, session] = await Promise.all([searchParams, requireSession("/settings/connections")]);
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const managesIntegrations = view.permissions.includes("integrations.manage");
  const instamartReady = instamartMode() !== "off" && membership.memberType === "adult";
  const instamartConnected = instamartReady
    ? await supabase
        .from("instamart_connections")
        .select("status")
        .eq("member_id", membership.memberId)
        .maybeSingle()
        .then((result) => (result.data as { status?: string } | null)?.status === "connected", () => false)
    : false;

  return (
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/settings/connections"
      back={{ href: "/settings", label: t("settingsPage.backToSettings") }}
      title={t("connectionsPage.title")}
    >
      <div className="space-y-8">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("connectionsPage.title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("connectionsPage.lede")}</p>
        </header>

        <WhatsAppSection session={session} connected={connected === "1"} />
        <VoiceAssistantsSection session={session} />
        {managesIntegrations ? <SchoolSection session={session} /> : null}
        <AccountsSection session={session} />

        {instamartReady ? (
          <CollapsibleSection id="shopping" icon={Store} tone="home" title={t("connectionsPage.shopping")}>
            <Card className="p-2">
              <ul>
                <ActionRow
                  icon={Store}
                  tone="home"
                  title="Swiggy Instamart"
                  meta={instamartConnected ? t("settingsHome.instamart.connected") : t("settingsHome.instamart.meta")}
                  action={<PillLink href="/groceries/order" tone="soft">{t("nav.item.groceries")}</PillLink>}
                />
              </ul>
            </Card>
          </CollapsibleSection>
        ) : null}

        {managesIntegrations ? <IntegrationsSections session={session} /> : null}

        <QuoteCard>{t("manage.integrations.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
