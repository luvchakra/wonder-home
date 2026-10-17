import { MapPin, ShieldCheck } from "lucide-react";

import { loadHouseholdAddress } from "@wonderhome/core/household/address";
import { mapsLink } from "@wonderhome/core/places/provider";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card } from "@wonderhome/core/ui/card";
import { IconTile } from "@wonderhome/core/ui/icon-tile";
import { PrivacyNote } from "@wonderhome/core/ui/privacy-note";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { EmptyState } from "@wonderhome/core/ui/states";

import { HomeAddressEditor } from "../../_components/home-address-editor";
import { placeSearchLabels } from "../../_lib/place-labels";
import { homeMapImage, placeSearchAvailable } from "../../_lib/places";
import { requireSession } from "../../_lib/session";

export const metadata = { title: "Home address" };
export const dynamic = "force-dynamic";

/**
 * The household's home address, for Admins (Manage Household). The same
 * write path setup uses: picked from Google Maps when the deployment has a
 * key, typed when it does not. Who can see it is said on the page.
 */
export default async function HomeAddressPage() {
  const session = await requireSession("/household/address");
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const shell = { active: "more" as const, viewer, secondary, pathname: "/household", back: { href: "/household", label: t("common.back") }, title: t("manage.section.address") };

  if (!view.permissions.includes("household.manage")) {
    return (
      <AppShell {...shell}>
        <EmptyState icon={ShieldCheck} title={t("manage.forAdmins")} description={t("manage.forAdminsLede")} />
      </AppShell>
    );
  }

  const address = await loadHouseholdAddress(supabase, householdId).catch(() => null);
  const map = await homeMapImage(address?.location ?? null);
  const available = placeSearchAvailable();

  return (
    <AppShell {...shell}>
      <div className="space-y-6">
        <header className="wh-rise space-y-1">
          <h1 className="hidden text-[1.625rem] font-bold tracking-tight sm:text-3xl lg:block">{t("manage.section.address")}</h1>
          <p className="text-[0.9375rem] text-[var(--wh-foreground-muted)]">{t("address.lede", { household: membership.household.name })}</p>
        </header>

        <Card className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <IconTile icon={MapPin} tone="home" />
            <p className="min-w-0 text-sm text-[var(--wh-foreground-muted)]">{t("address.uses")}</p>
          </div>
          {map && address ? (
            // eslint-disable-next-line @next/next/no-img-element -- an inline data URL the server fetched; nothing for the image optimizer to do
            <img src={map} alt={t("places.mapAlt", { address: address.formattedAddress })} className="h-auto w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)]" />
          ) : null}
          {address && !address.placeId ? (
            <a href={mapsLink({ formattedAddress: address.formattedAddress })} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-[var(--wh-primary)] underline-offset-2 hover:underline">
              {t("places.openInMaps")}
            </a>
          ) : null}
          <HomeAddressEditor
            householdId={householdId}
            initial={address ? { text: address.formattedAddress, placeId: address.placeId, detail: null } : null}
            available={available}
            labels={{
              field: available ? t("setupWizard.basics.addressField") : t("manage.section.address"),
              save: t("address.save"),
              saving: t("common.saving"),
              remove: t("address.remove"),
              removing: t("address.removing"),
              search: placeSearchLabels(t, "address"),
            }}
          />
          <PrivacyNote line={t("privacyNote.line")} more={t("privacyNote.more")} />
        </Card>

        <QuoteCard>{t("address.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
