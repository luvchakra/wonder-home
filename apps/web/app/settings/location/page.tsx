import { MapPin, ShieldCheck } from "lucide-react";

import { agoText, loadLocations } from "@wonderhome/core/location/sharing";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { Badge } from "@wonderhome/core/ui/pill";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";

import { LocationAudienceChoice } from "../../_components/location-audience-choice";
import { LocationSharingToggle } from "../../_components/location-sharing-toggle";
import { requireSession } from "../../_lib/session";

export const metadata = { title: "Location sharing" };
export const dynamic = "force-dynamic";

/**
 * Location sharing, the one place a person turns their own on or off (rule
 * 23). An adult or a helper decides for themselves; a child sees whether a
 * grown-up has turned theirs on, and that a grown-up is who changes it (in
 * Family). The page says plainly what is kept and who sees it.
 */
export default async function LocationSettingsPage() {
  const session = await requireSession("/settings/location");
  const { supabase, membership, viewer, secondary } = session;
  const { t, preferences } = session.locale;
  const householdId = membership.household.id;
  const { sharing, locations } = await loadLocations(supabase, householdId).catch(() => ({ sharing: [], locations: [] }));
  const myShare = sharing.find((row) => row.memberId === membership.memberId) ?? null;
  const on = myShare?.enabled ?? false;
  const visibleToChildren = myShare?.visibleToChildren ?? false;
  const mine = locations.find((row) => row.memberId === membership.memberId) ?? null;
  const child = membership.memberType === "child";

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/settings/location" back={{ href: "/settings", label: t("settingsPage.backToSettings") }} title={t("location.title")}>
      <div className="space-y-6">
        <header className="wh-rise">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">{t("location.title")}</h1>
          <p className="mt-0.5 text-sm text-[var(--wh-foreground-muted)]">{t("location.lede")}</p>
        </header>

        <Card className="flex items-start gap-3">
          <IconTile icon={MapPin} tone={on ? "handled" : "neutral"} />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <Badge tone={on ? "handled" : "neutral"}>{on ? t("location.meta.on") : t("location.meta.off")}</Badge>
            {child ? (
              <p className="text-[var(--wh-foreground-muted)]">{on ? t("location.childOn") : t("location.childOff")}</p>
            ) : (
              <LocationSharingToggle
                householdId={householdId}
                memberId={membership.memberId}
                enabled={on}
                labels={{ turnOn: t("location.turnOn"), turnOff: t("location.turnOff"), turnedOn: t("location.turnedOn"), turnedOff: t("location.turnedOff") }}
              />
            )}
            {on ? (
              <LocationAudienceChoice
                householdId={householdId}
                memberId={membership.memberId}
                visibleToChildren={visibleToChildren}
                labels={{ legend: t("location.audience.legend"), adultsOnly: t("location.audience.adults"), alsoChildren: t("location.audience.children"), saved: t("location.audience.saved") }}
              />
            ) : null}
            {on ? (
              <p className="text-xs text-[var(--wh-foreground-subtle)]">
                {mine ? t("location.lastSent", { ago: agoText(preferences.language, mine.recordedAt) }) : t("location.notYet")}
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="flex items-start gap-3">
          <IconTile icon={ShieldCheck} tone="primary" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{t("location.how.title")}</p>
            <ul className="mt-1 list-disc space-y-1 ps-4 text-[var(--wh-foreground-muted)]">
              <li>{t("location.how1")}</li>
              <li>{t("location.how2")}</li>
              <li>{on && visibleToChildren ? t("location.how3.children") : t("location.how3")}</li>
            </ul>
          </div>
        </Card>

        <QuoteCard>{t("location.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
