import { MapPin, Trees, UtensilsCrossed } from "lucide-react";

import { listHouseholdPlaces, type HouseholdPlace } from "@wonderhome/core/homeplaces/repository";
import { mapsLink } from "@wonderhome/core/places/provider";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Card } from "@wonderhome/core/ui/card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState, ErrorState } from "@wonderhome/core/ui/states";

import { requireSession } from "../_lib/session";
import { PlaceBookActions, type PlaceBookLabels } from "./place-book-actions";

export const metadata = { title: "Places" };
export const dynamic = "force-dynamic";

/** A place's tile: somewhere to eat, somewhere outdoors, or anywhere else. */
function tileFor(kind: string | null) {
  if (/restaurant|cafe|café|coffee|food|bakery|dessert|ice cream|pizza|diner|bar|eatery|kitchen/i.test(kind ?? "")) return { icon: UtensilsCrossed, tone: "meals" as const };
  if (/park|garden|playground|play area|zoo/i.test(kind ?? "")) return { icon: Trees, tone: "handled" as const };
  return { icon: MapPin, tone: "people" as const };
}

/**
 * The household's place book (HomePlaces): what the family saved from a
 * HomeTalk answer, and what they said is "not for us". Every member reads
 * it; an adult changes it — keeps a note, removes a saved place, or lets a
 * turned-down place be suggested again. Places are added from HomeTalk's
 * answers, where they were found; this screen never searches on its own.
 */
export default async function PlacesPage() {
  const session = await requireSession("/places");
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const shell = { active: "more" as const, viewer, secondary, pathname: "/places", back: { href: "/more", label: t("common.back") }, title: t("nav.item.places") };

  let places: HouseholdPlace[];
  try {
    places = await listHouseholdPlaces(supabase, householdId);
  } catch {
    return (
      <AppShell {...shell}>
        <ErrorState title={t("placeBook.loadError")} description={t("placeBook.loadErrorBody")} retryHref="/places" />
      </AppShell>
    );
  }

  const canChange = view.tone === "adult";
  const labels: PlaceBookLabels = {
    open: t("hometalk.places.open", { name: "{name}" }),
    remove: t("hometalk.places.unsave", { name: "{name}" }),
    bringBack: t("placeBook.bringBack", { name: "{name}" }),
    editNote: t("placeBook.editNote", { name: "{name}" }),
    note: t("placeBook.note"),
    notePlaceholder: t("placeBook.notePlaceholder"),
    saveNote: t("placeBook.saveNote"),
    saving: t("common.saving"),
    failed: t("hometalk.places.failed"),
  };
  const saved = places.filter((place) => place.status === "saved");
  const turnedDown = places.filter((place) => place.status === "not_for_us");
  const firstName = view.displayName.split(/\s+/)[0] ?? view.displayName;

  const row = (place: HouseholdPlace) => {
    const tile = tileFor(place.kind);
    const meta = [place.kind, place.address || null].filter(Boolean).join(" · ");
    return (
      <ActionRow
        key={place.id}
        icon={tile.icon}
        tone={tile.tone}
        title={place.name}
        meta={place.note ? `${meta}${meta ? " — " : ""}“${place.note}”` : meta}
        action={
          <PlaceBookActions
            householdId={householdId}
            place={{
              id: place.id,
              name: place.name,
              mapsUri: place.mapsUri ?? mapsLink({ name: place.name, formattedAddress: place.address, placeId: place.placeId }),
              status: place.status,
              note: place.note,
            }}
            canChange={canChange}
            labels={labels}
          />
        }
      />
    );
  };

  return (
    <AppShell {...shell}>
      <div className="space-y-6">
        <header className="wh-rise space-y-1">
          <h1 className="hidden text-[1.625rem] font-bold tracking-tight sm:text-3xl lg:block">{t("nav.item.places")}</h1>
          <p className="text-[0.9375rem] text-[var(--wh-foreground-muted)]">{t("placeBook.lede", { name: firstName })}</p>
          {!canChange ? <p className="text-xs text-[var(--wh-foreground-subtle)]">{t("placeBook.readOnly")}</p> : null}
        </header>

        {places.length === 0 ? (
          <EmptyState icon={MapPin} tone="home" title={t("placeBook.emptyTitle")} description={t("placeBook.emptyLede")} />
        ) : (
          <>
            {saved.length > 0 ? (
              <section className="space-y-2">
                <SectionHeader title={t("placeBook.saved")} />
                <Card className="px-3">
                  <ul className="divide-y divide-[var(--wh-border)]">{saved.map(row)}</ul>
                </Card>
              </section>
            ) : null}
            {turnedDown.length > 0 ? (
              <section className="space-y-2">
                <SectionHeader title={t("placeBook.notForUs")} />
                <Card className="px-3">
                  <ul className="divide-y divide-[var(--wh-border)]">{turnedDown.map(row)}</ul>
                </Card>
              </section>
            ) : null}
          </>
        )}

        <QuoteCard>{t("placeBook.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
