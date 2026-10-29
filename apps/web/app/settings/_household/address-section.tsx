
import { loadHouseholdAddress } from "@wonderhome/core/household/address";
import { mapsLink } from "@wonderhome/core/places/provider";
import { Card } from "@wonderhome/core/ui/card";
import { PrivacyNote } from "@wonderhome/core/ui/privacy-note";

import { HomeAddressEditor } from "../../_components/home-address-editor";
import { placeSearchLabels } from "../../_lib/place-labels";
import { homeMapImage, placeSearchAvailable } from "../../_lib/places";
import type { Session } from "../../_lib/session";

/**
 * The household's home address, for Admins (Settings → Household). The same
 * write path setup uses: picked from Google Maps when the deployment has a
 * key, typed when it does not. Who can see it is said on the page. Rendered as
 * the body of the "Home address" fold on `/settings`; the heading and lede live
 * on that fold's summary, so this returns the card only.
 */
export async function AddressSection({ session }: { session: Session }) {
  const { supabase, membership, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;

  const address = await loadHouseholdAddress(supabase, householdId).catch(() => null);
  const map = await homeMapImage(address?.location ?? null);
  const available = placeSearchAvailable();

  return (
        <Card className="space-y-4 p-4">
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
  );
}
