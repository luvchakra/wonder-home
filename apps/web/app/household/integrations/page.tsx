import { CalendarDays, CloudSun, Cpu, CreditCard, GraduationCap, Home, Mail, MessageCircle, Plug, ShieldCheck, ShoppingBasket } from "lucide-react";
import type { ComponentType } from "react";

import { may } from "@wonderhome/core/billing/repository";
import { listDevices } from "@wonderhome/core/home/device-repository";
import { weatherProviderFromEnv } from "@wonderhome/core/home/open-meteo";
import { listAssets } from "@wonderhome/core/home/repository";
import { describeHouseholdWeather, householdWeather } from "@wonderhome/core/home/weather-service";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile, type IconTone } from "@wonderhome/core/ui/icon-tile";
import { Badge, PillLink } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState } from "@wonderhome/core/ui/states";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { developerApiEnabled, listDeveloperKeys, PARTNER_SCOPES } from "@wonderhome/core/developer/keys";
import type { ConnectorStatus } from "@wonderhome/core/integrations/connector";
import type { Translate } from "@wonderhome/core/i18n/translate";

import { DeveloperKeys } from "../../_components/developer-keys";
import { DeviceLinkControls } from "../../_components/device-link-controls";
import { WeatherArea } from "../../_components/weather-area";
import { developerKeyLabels, deviceLinkLabels, weatherAreaLabels } from "../../_lib/manage-labels";
import { formatDate, formatTime, requireSession } from "../../_lib/session";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

type KindKey = "school" | "calendar" | "email" | "commerce" | "messaging" | "weather" | "payments" | "smart_home";

const KIND_PRESENTATION: { kind: KindKey; icon: ComponentType<{ className?: string }>; tone: IconTone }[] = [
  { kind: "school", icon: GraduationCap, tone: "school" },
  { kind: "calendar", icon: CalendarDays, tone: "people" },
  { kind: "email", icon: Mail, tone: "home" },
  { kind: "commerce", icon: ShoppingBasket, tone: "care" },
  { kind: "messaging", icon: MessageCircle, tone: "handled" },
  { kind: "weather", icon: CloudSun, tone: "money" },
  { kind: "payments", icon: CreditCard, tone: "money" },
  { kind: "smart_home", icon: Home, tone: "ai" },
];

/** Each kind of connection with its name and purpose in the reader's words. WhatsApp is a name, never translated. */
function kindsFor(t: Translate) {
  return KIND_PRESENTATION.map((entry) => ({
    ...entry,
    label: entry.kind === "messaging" ? "WhatsApp" : t(`manage.integrations.kind.${entry.kind}`),
    purpose: t(`manage.integrations.purpose.${entry.kind}`),
  }));
}

/**
 * Integrations (requirements §21): what is connected, its health, and what
 * needs a person. No provider is live until credentials, consent and
 * integration tests exist, and this screen says so rather than offering a
 * "Connect" button that goes nowhere.
 */
export default async function IntegrationsPage() {
  const session = await requireSession("/household/integrations");
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const timezone = membership.household.timezone;
  const shell = { active: "more" as const, viewer, secondary, pathname: "/household/integrations", back: { href: "/household", label: t("manage.backToManage") }, title: t("manage.section.integrations") };
  const KINDS = kindsFor(t);
  // A connection's state in the reader's words (the domain's `statusLabel` is the English record).
  const statusWords = (status: ConnectorStatus) => t(`manage.integrations.status.${status}`);

  if (!view.permissions.includes("integrations.manage")) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ShieldCheck} title={t("manage.forAdmins")} description={t("manage.integrations.adminOnlyLede")} />
      </AppShell>
    );
  }

  const householdId = membership.household.id;
  // Weather is the one provider a deployment can switch on without a
  // household credential (story 17-007), so its area is chosen right here.
  const weatherOn = weatherProviderFromEnv() !== null;
  // Partner keys (story 18-008): shown only where the deployment has switched the API on.
  const developerOn = developerApiEnabled();
  const developerKeys = developerOn ? await listDeveloperKeys(createAdminClient(), householdId).catch(() => []) : [];
  const [integrations, weather, weatherEntitled, devices, assets] = await Promise.all([
    listIntegrations(supabase, householdId).catch(() => []),
    weatherOn ? householdWeather(supabase, householdId) : Promise.resolve(null),
    // Asked on its own: with no area chosen yet, the weather answer is "no
    // area" before the plan is ever consulted, and an Admin should not be
    // offered a search their plan will refuse to save.
    weatherOn ? may(supabase, householdId, "home.weather").then((decision) => decision.allowed, () => false) : Promise.resolve(false),
    // Story 17-008: what a connected device provider has reported. `null` is
    // "could not be read", which the section says, rather than an empty list.
    listDevices(supabase, householdId).catch(() => null),
    listAssets(supabase, householdId).catch(() => []),
  ]);
  const smartHome = integrations.filter((integration) => integration.kind === "smart_home");
  const deviceLabels = deviceLinkLabels(t);
  const attention = integrations.filter((integration) => integration.needsAttention);

  return (
    <AppShell {...shell}>
      <div className="space-y-5">
        <header className="wh-rise hidden lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("manage.section.integrations")}</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.integrations.lede")}</p>
        </header>

        {attention.length > 0 ? (
          <section>
            <SectionHeader title={t("manage.integrations.needsYou")} count={attention.length} />
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {attention.map((integration) => {
                  const kind = KINDS.find((k) => k.kind === integration.kind);
                  return (
                    <li key={integration.id} className="flex items-center gap-3 px-2 py-3">
                      <IconTile icon={kind?.icon ?? Plug} tone={kind?.tone ?? "neutral"} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{kind?.label ?? integration.kind} · {integration.provider}</p>
                        <p className="text-xs text-[var(--wh-foreground-muted)]">{t("manage.integrations.reconnect", { status: statusWords(integration.status) })}</p>
                      </div>
                      <PillLink href="#providers" tone="soft">{t("manage.integrations.seeProvider")}</PillLink>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ) : null}

        <section id="providers">
          <SectionHeader title={t("manage.integrations.providers")} />
          <div className="grid gap-3 sm:grid-cols-2">
            {KINDS.map((kind) => {
              const connected = integrations.filter((integration) => integration.kind === kind.kind);
              return (
                <Card key={kind.kind} className="flex gap-3 p-4">
                  <IconTile icon={kind.icon} tone={kind.tone} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{kind.label}</p>
                      {connected.length > 0 ? <Badge tone={connected.some((c) => c.needsAttention) ? "attention" : "handled"}>{connected.some((c) => c.status === "connected") ? t("manage.integrations.connected") : statusWords(connected[0]!.status)}</Badge> : <Badge>{t("manage.integrations.notConnected")}</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--wh-foreground-muted)]">{kind.purpose}</p>
                    {connected.map((integration) => (
                      <p key={integration.id} className="mt-1.5 text-[0.6875rem] text-[var(--wh-foreground-subtle)]">
                        {integration.provider} · {integration.lastSuccessAt ? t("manage.integrations.lastSynced", { date: formatDate(timezone, integration.lastSuccessAt, "long") }) : t("manage.integrations.neverSynced")}
                      </p>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {smartHome.length > 0 || (devices && devices.length > 0) ? (
          <section id="devices">
            <SectionHeader title={t("manage.integrations.devices")} count={devices?.length || undefined} />
            <Card className="p-2">
              {devices === null ? (
                <p className="px-2 py-3 text-sm text-[var(--wh-foreground-muted)]">{t("manage.integrations.devicesFailed")}</p>
              ) : devices.length === 0 ? (
                <p className="px-2 py-3 text-sm text-[var(--wh-foreground-muted)]">{t("manage.integrations.devicesNone")}</p>
              ) : (
                <ul className="divide-y divide-[var(--wh-border)]">
                  {devices.map((device) => (
                    <li key={device.id} className="flex items-start gap-3 px-2 py-3">
                      <IconTile icon={Cpu} tone={device.ignored ? "neutral" : "ai"} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium break-words">{device.label}</p>
                        <p className="text-xs text-[var(--wh-foreground-muted)]">
                          {device.status}
                          {device.lastReadingAt ? ` ${t("manage.integrations.lastReported", { date: formatDate(timezone, device.lastReadingAt, "long"), time: formatTime(timezone, device.lastReadingAt) })}` : ""}
                        </p>
                      </div>
                      <DeviceLinkControls
                        householdId={householdId}
                        device={{ id: device.id, label: device.label, assetId: device.assetId, ignored: device.ignored }}
                        assets={assets.filter((asset) => asset.status !== "retired").map((asset) => ({ id: asset.id, name: asset.name }))}
                        labels={deviceLabels}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        ) : null}

        {weatherOn ? (
          <section id="weather">
            <SectionHeader title={t("manage.integrations.kind.weather")} />
            <Card className="flex gap-3 p-4">
              <IconTile icon={CloudSun} tone="money" size="lg" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold">{t("manage.integrations.weatherTitle")}</p>
                <p className="text-xs text-[var(--wh-foreground-muted)]">
                  {!weatherEntitled ? t("manage.integrations.weatherNotInPlan") : t("manage.integrations.weatherLede")}
                </p>
                {!weatherEntitled ? null : (
                  <div className="pt-3">
                    <WeatherArea
                      householdId={householdId}
                      labels={weatherAreaLabels(t)}
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

        {developerOn ? (
          <section id="developer">
            <SectionHeader title={t("manage.integrations.developer")} />
            <Card className="p-4">
              <DeveloperKeys
                householdId={householdId}
                labels={developerKeyLabels(t)}
                scopes={PARTNER_SCOPES.map((scope) => ({ value: scope, label: t(`manage.scope.${scope}`) }))}
                keys={developerKeys.map((key) => ({
                  id: key.id,
                  name: key.name,
                  environment: key.environment,
                  prefix: key.prefix,
                  scopes: key.scopes.map((scope) => t(`manage.scope.${scope}`)),
                  lastUsed: key.lastUsedAt
                    ? t("manage.integrations.usedAt", { date: formatDate(timezone, new Date(key.lastUsedAt), "long"), time: formatTime(timezone, new Date(key.lastUsedAt)) })
                    : t("manage.integrations.notUsed"),
                  expires: key.revokedAt ? null : key.expiresAt ? t("manage.integrations.stopsWorking", { date: formatDate(timezone, new Date(key.expiresAt), "long") }) : t("manage.integrations.untilRevoked"),
                  revoked: Boolean(key.revokedAt),
                }))}
              />
            </Card>
          </section>
        ) : null}

        <Card className="flex items-start gap-3 bg-[var(--wh-primary-soft)]/50 p-4">
          <Plug aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--wh-primary)]" />
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.integrations.footer")}</p>
        </Card>

        <QuoteCard>{t("manage.integrations.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
