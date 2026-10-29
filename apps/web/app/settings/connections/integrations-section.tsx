import { CloudSun, Cpu, CreditCard, Home, KeyRound } from "lucide-react";

import { may } from "@wonderhome/core/billing/repository";
import { listDevices } from "@wonderhome/core/home/device-repository";
import { weatherProviderFromEnv } from "@wonderhome/core/home/open-meteo";
import { listAssets } from "@wonderhome/core/home/repository";
import { describeHouseholdWeather, householdWeather } from "@wonderhome/core/home/weather-service";
import { listIntegrations } from "@wonderhome/core/integrations/repository";
import { Card } from "@wonderhome/core/ui/card";
import { CollapsibleSection } from "@wonderhome/core/ui/collapsible-section";
import { IconTile } from "@wonderhome/core/ui/icon-tile";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { developerApiEnabled, listDeveloperKeys, PARTNER_SCOPES } from "@wonderhome/core/developer/keys";

import { DeveloperKeys } from "../../_components/developer-keys";
import { DeviceLinkControls } from "../../_components/device-link-controls";
import { ProviderCard } from "../../_components/provider-card";
import { WeatherArea } from "../../_components/weather-area";
import { providerCardLabels } from "../../_lib/connection-card-labels";
import { connectionCardShape } from "../../_lib/connection-cards";
import { developerKeyLabels, deviceLinkLabels, weatherAreaLabels } from "../../_lib/manage-labels";
import { formatDate, formatTime, type Session } from "../../_lib/session";

/**
 * The deployment-level connections and developer access — the Admin's part of
 * Connections; the page checks `integrations.manage` before rendering it.
 *
 * Weather, Payments and smart home are switched on by whoever runs this
 * WonderHome, not by a member, so each is an honest-status chevron card with no
 * Connect button (requirements §21, docs/external-providers.md: never offer a
 * connect flow that isn't real). A provider becomes user-connectable only if
 * and when it genuinely is. Developer access keeps its own manager card.
 */
export async function IntegrationsSections({ session }: { session: Session }) {
  const { supabase, membership, locale } = session;
  const { t } = locale;
  const timezone = membership.household.timezone;
  const labels = providerCardLabels(t);

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
    // "could not be read", which the card says, rather than an empty list.
    listDevices(supabase, householdId).catch(() => null),
    listAssets(supabase, householdId).catch(() => []),
  ]);
  const smartHome = integrations.filter((integration) => integration.kind === "smart_home");
  const smartHomeConfigured = smartHome.length > 0 || (devices !== null && devices.length > 0);
  const deviceLabels = deviceLinkLabels(t);

  const weatherShape = connectionCardShape({ deploymentLevel: true, configured: weatherOn, connectionStatus: null });
  // Paying is never live today, and never connected by a member (CLAUDE.md).
  const paymentsShape = connectionCardShape({ deploymentLevel: true, configured: false, connectionStatus: null });
  const smartHomeShape = connectionCardShape({ deploymentLevel: true, configured: smartHomeConfigured, connectionStatus: null });

  return (
    <>
      {/* Weather — deployment-level: the operator switches it on; no Connect button. */}
      <ProviderCard
        id="weather"
        icon={CloudSun}
        tone="money"
        name={t("manage.integrations.kind.weather")}
        purpose={t("manage.integrations.purpose.weather")}
        status={weatherShape.status}
        connectable={false}
        labels={labels}
      >
        {!weatherOn ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.integrations.deploymentManaged")}</p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-semibold">{t("manage.integrations.weatherTitle")}</p>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              {!weatherEntitled ? t("manage.integrations.weatherNotInPlan") : t("manage.integrations.weatherLede")}
            </p>
            {weatherEntitled ? (
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
            ) : null}
          </div>
        )}
      </ProviderCard>

      {/* Payments — deployment-level and never live today; no Connect button. */}
      <ProviderCard
        id="payments"
        icon={CreditCard}
        tone="money"
        name={t("manage.integrations.kind.payments")}
        purpose={t("manage.integrations.purpose.payments")}
        status={paymentsShape.status}
        connectable={false}
        labels={labels}
      >
        <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.integrations.deploymentManaged")}</p>
      </ProviderCard>

      {/* Smart home — deployment-level device signals; shows what has reported. */}
      <ProviderCard
        id="smart-home"
        icon={Home}
        tone="ai"
        name={t("manage.integrations.kind.smart_home")}
        purpose={t("manage.integrations.purpose.smart_home")}
        status={smartHomeShape.status}
        connectable={false}
        labels={labels}
        count={devices?.length || undefined}
      >
        {devices === null ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">{t("manage.integrations.devicesFailed")}</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {smartHomeConfigured ? t("manage.integrations.devicesNone") : t("manage.integrations.deploymentManaged")}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--wh-border)]">
            {devices.map((device) => (
              <li key={device.id} className="flex items-start gap-3 py-3">
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
      </ProviderCard>

      {developerOn ? (
        <CollapsibleSection id="developer" icon={KeyRound} tone="neutral" title={t("manage.integrations.developer")}>
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
        </CollapsibleSection>
      ) : null}
    </>
  );
}
