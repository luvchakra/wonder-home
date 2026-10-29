import { ShoppingBasket } from "lucide-react";

import { instamartMode } from "@wonderhome/core/commerce/instamart/config";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";

import { ProviderCard } from "../../_components/provider-card";
import { providerCardLabels } from "../../_lib/connection-card-labels";
import { requireSession } from "../../_lib/session";
import { AccountsSection } from "./accounts-section";
import { CalendarSection } from "./calendar-section";
import { EmailSection } from "./email-section";
import { IntegrationsSections } from "./integrations-section";
import { SchoolSection } from "./school-section";
import { VoiceAssistantsSection } from "./voice-section";
import { WhatsAppSection } from "./whatsapp-section";

export const metadata = { title: "Connections" };
export const dynamic = "force-dynamic";

/**
 * Connections: everything WonderHome is linked to, on one page, and nothing but
 * per-connection chevron cards (owner, 2026-10-29; design/UI-SIMPLIFICATION-v1.md
 * M2). Each connection is one card: collapsed it shows its status; expanded it
 * shows that connection's whole detail. The ones a member owns (WhatsApp, voice,
 * school, the named connections, shopping, calendar, email) connect and
 * disconnect from their card; the deployment-level ones (weather, payments,
 * smart home) show honest status and no Connect button, because no provider is
 * offered a connect flow that isn't real. Each section keeps its own rules: a
 * person sees their own WhatsApp and voice links (an Admin everyone's), every
 * member sees the named connections (adults change them), and only someone who
 * may manage integrations sees school, calendar, email, the deployment providers
 * and partner keys. Swiggy Instamart is connected where it is used, on the order
 * page; this card says whether it is and leads there.
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

  const labels = providerCardLabels(t);
  // Grocery stores WonderHome can order from. A new store is one more entry; the
  // card's status rolls up from the list. Brand names are never translated.
  const groceryProviders = instamartReady
    ? [
        {
          id: "instamart",
          name: "Swiggy Instamart",
          connected: instamartConnected,
          note: instamartConnected ? t("settingsHome.instamart.connected") : t("settingsHome.instamart.meta"),
          action: (
            <PillLink href="/groceries/order" tone={instamartConnected ? "soft" : "primary"}>
              {t("nav.item.groceries")}
            </PillLink>
          ),
        },
      ]
    : [];

  return (
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/settings/connections"
      back={{ href: "/settings", label: t("settingsPage.backToSettings") }}
      title={t("connectionsPage.title")}
    >
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("connectionsPage.title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("connectionsPage.lede")}</p>
        </header>

        <div className="space-y-3">
          <WhatsAppSection session={session} connected={connected === "1"} />
          <VoiceAssistantsSection session={session} />
          {managesIntegrations ? <SchoolSection session={session} /> : null}

          {groceryProviders.length > 0 ? (
            <ProviderCard
              id="shopping"
              icon={ShoppingBasket}
              tone="care"
              name={t("nav.item.groceries")}
              purpose={t("manage.integrations.purpose.commerce")}
              status={groceryProviders.some((provider) => provider.connected) ? "connected" : "not_connected"}
              connectable={false}
              labels={labels}
            >
              <ul className="space-y-3">
                {groceryProviders.map((provider) => (
                  <li key={provider.id} className="space-y-1.5">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span className="break-words">{provider.name}</span>
                      <Badge tone={provider.connected ? "handled" : "neutral"}>
                        {provider.connected ? labels.connected : labels.notConnected}
                      </Badge>
                    </p>
                    <p className="text-sm text-[var(--wh-foreground-muted)]">{provider.note}</p>
                    {provider.action}
                  </li>
                ))}
              </ul>
            </ProviderCard>
          ) : null}

          {managesIntegrations ? <CalendarSection session={session} /> : null}
          {managesIntegrations ? <EmailSection session={session} /> : null}
          {managesIntegrations ? <IntegrationsSections session={session} /> : null}
          <AccountsSection session={session} />
        </div>

        <QuoteCard>{t("manage.integrations.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
