import { CalendarDays, CloudSun, CreditCard, GraduationCap, Home, Mail, MessageCircle, Plug, ShieldCheck, ShoppingBasket } from "lucide-react";
import type { ComponentType } from "react";

import { may } from "@wonderhome/core/billing/repository";
import { weatherProviderFromEnv } from "@wonderhome/core/home/open-meteo";
import { describeHouseholdWeather, householdWeather } from "@wonderhome/core/home/weather-service";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { WeatherArea } from "../../_components/weather-area";
import { formatDate, formatTime, requireSession } from "../../_lib/session";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

const KINDS: { kind: string; label: string; icon: ComponentType<{ className?: string }>; tone: IconTone; purpose: string }[] = [
  { kind: "school", label: "School", icon: GraduationCap, tone: "school", purpose: "Homework, exams and notices from the school portal" },
  { kind: "calendar", label: "Calendar", icon: CalendarDays, tone: "people", purpose: "Free/busy from everyone's calendars — never the titles" },
  { kind: "email", label: "Email", icon: Mail, tone: "home", purpose: "Bills, receipts and school mail, summarised" },
  { kind: "commerce", label: "Shopping", icon: ShoppingBasket, tone: "care", purpose: "Groceries and pet supplies, priced before ordering" },
  { kind: "messaging", label: "WhatsApp", icon: MessageCircle, tone: "handled", purpose: "Notifications and replies on the channel you already use" },
  { kind: "weather", label: "Weather", icon: CloudSun, tone: "money", purpose: "Laundry, outings and school runs planned around it" },
  { kind: "payments", label: "Payments", icon: CreditCard, tone: "money", purpose: "Paying bills once you approve — with step-up each time" },
  { kind: "smart_home", label: "Smart home", icon: Home, tone: "ai", purpose: "Optional device signals for maintenance" },
];

/**
 * Integrations (requirements §21): what is connected, its health, and what
 * needs a person. No provider is live until credentials, consent and
 * integration tests exist, and this screen says so rather than offering a
 * "Connect" button that goes nowhere.
 */
export default async function IntegrationsPage() {
  const session = await requireSession("/household/integrations");
  const { supabase, membership, view, viewer, secondary } = session;
  const timezone = membership.household.timezone;
  const shell = { active: "more" as const, viewer, secondary, pathname: "/household/integrations", back: { href: "/household", label: "Back to manage household" }, title: "Integrations" };

  if (!view.permissions.includes("integrations.manage")) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ShieldCheck} title="For Admins" description="Connecting accounts is up to an Admin." />
      </AppShell>
    );
  }

  const householdId = membership.household.id;
  // Weather is the one provider a deployment can switch on without a
  // household credential (story 17-007), so its area is chosen right here.
  const weatherOn = weatherProviderFromEnv() !== null;
  const [integrations, weather, weatherEntitled] = await Promise.all([
    listIntegrations(supabase, householdId).catch(() => []),
    weatherOn ? householdWeather(supabase, householdId) : Promise.resolve(null),
    // Asked on its own: with no area chosen yet, the weather answer is "no
    // area" before the plan is ever consulted, and an Admin should not be
    // offered a search their plan will refuse to save.
    weatherOn ? may(supabase, householdId, "home.weather").then((decision) => decision.allowed, () => false) : Promise.resolve(false),
  ]);
  const attention = integrations.filter((integration) => integration.needsAttention);

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Integrations</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">Connected only with your consent, only for what they need, and never a credential on this screen.</p>
        </header>

        {attention.length > 0 ? (
          <section>
            <SectionHeader title="Needs you" count={attention.length} />
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {attention.map((integration) => {
                  const kind = KINDS.find((k) => k.kind === integration.kind);
                  return (
                    <li key={integration.id} className="flex items-center gap-3 px-2 py-3">
                      <IconTile icon={kind?.icon ?? Plug} tone={kind?.tone ?? "neutral"} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{kind?.label ?? integration.kind} · {integration.provider}</p>
                        <p className="text-xs text-[var(--wh-foreground-muted)]">{integration.statusLabel} — reconnecting means going through the provider’s own connect flow again, which isn’t live yet.</p>
                      </div>
                      <PillLink href="#providers" tone="soft">See provider</PillLink>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ) : null}

        <section id="providers">
          <SectionHeader title="Providers" />
          <div className="grid gap-3 sm:grid-cols-2">
            {KINDS.map((kind) => {
              const connected = integrations.filter((integration) => integration.kind === kind.kind);
              return (
                <Card key={kind.kind} className="flex gap-3 p-4">
                  <IconTile icon={kind.icon} tone={kind.tone} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{kind.label}</p>
                      {connected.length > 0 ? <Badge tone={connected.some((c) => c.needsAttention) ? "attention" : "handled"}>{connected.some((c) => c.status === "connected") ? "Connected" : connected[0]!.statusLabel}</Badge> : <Badge>Not connected</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{kind.purpose}</p>
                    {connected.map((integration) => (
                      <p key={integration.id} className="mt-1.5 text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                        {integration.provider}{integration.lastSuccessAt ? ` · last synced ${formatDate(timezone, integration.lastSuccessAt, "long")}` : " · never synced"}
                      </p>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {weatherOn ? (
          <section id="weather">
            <SectionHeader title="Weather" />
            <Card className="flex gap-3 p-4">
              <IconTile icon={CloudSun} tone="money" size="lg" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold">Plan around the weather</p>
                <p className="text-xs text-[var(--wh-foreground-muted)]">
                  {!weatherEntitled
                    ? "Weather-aware planning is not part of your plan. It comes with Pro and Max."
                    : "Laundry that won't dry and outdoor jobs in the rain get moved before they go wrong. Nothing changes on a fine day."}
                </p>
                {!weatherEntitled ? null : (
                  <div className="pt-3">
                    <WeatherArea
                      householdId={householdId}
                      area={
                        weather && weather.state !== "off"
                          ? {
                              label: weather.place,
                              summary: describeHouseholdWeather(weather),
                              checked: weather.state === "ready" ? `${formatDate(timezone, weather.fetchedAt, "long")}, ${formatTime(timezone, weather.fetchedAt)}` : null,
                            }
                          : null
                      }
                    />
                  </div>
                )}
              </div>
            </Card>
          </section>
        ) : null}

        <Card className="flex items-start gap-3 bg-[var(--wh-primary-soft)]/50 p-4">
          <Plug aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-primary)]" />
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Live providers are switched on one at a time, once their credentials, consent flow and integration tests are in place. Until then WonderHome works from what you tell it and never pretends a connection exists.
          </p>
        </Card>

        <QuoteCard>Connected on your terms.</QuoteCard>
      </div>
    </AppShell>
  );
}
