import { Briefcase, ExternalLink, House, MapPin, Pencil, School, Trees, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

import { ourPlaces, type OurPlace } from "@wonderhome/core/homeplaces/our-places";
import { listHouseholdPlaces, type HouseholdPlace } from "@wonderhome/core/homeplaces/repository";
import { loadHouseholdAddress } from "@wonderhome/core/household/address";
import { listWorkPlaces } from "@wonderhome/core/household/work-place";
import { listMembers } from "@wonderhome/core/identity/households";
import { listEnrolments } from "@wonderhome/core/school/enrolments";
import { mapsLink } from "@wonderhome/core/places/provider";
import { rateLimitMessage } from "@wonderhome/core/security/rate-limit";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { ActionRow } from "@wonderhome/core/ui/action-row";
import { Card } from "@wonderhome/core/ui/card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";
import { EmptyState, ErrorState } from "@wonderhome/core/ui/states";

import { placeSearchLabels } from "../_lib/place-labels";
import { placeSearchAvailable } from "../_lib/places";
import { requireSession } from "../_lib/session";
import { AddPlaceForm } from "./add-place-form";
import { PlaceBookActions, type PlaceBookLabels } from "./place-book-actions";

export const metadata = { title: "HomePlaces" };
export const dynamic = "force-dynamic";

/** A place's tile: somewhere to eat, somewhere outdoors, or anywhere else. */
function tileFor(kind: string | null) {
  if (/restaurant|cafe|café|coffee|food|bakery|dessert|ice cream|pizza|diner|bar|eatery|kitchen/i.test(kind ?? "")) return { icon: UtensilsCrossed, tone: "meals" as const };
  if (/park|garden|playground|play area|zoo/i.test(kind ?? "")) return { icon: Trees, tone: "handled" as const };
  return { icon: MapPin, tone: "people" as const };
}

const ICON_LINK =
  "grid size-9 place-items-center rounded-full text-[var(--wh-foreground-muted)] transition-colors hover:bg-[var(--wh-surface-muted)] hover:text-[var(--wh-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-primary)]";

/**
 * HomePlaces: first the household's own places — the home address, each
 * child's school, each adult's office, every place picked from Google Maps
 * anywhere in the app (story 24-010), each with a link to the one screen that
 * changes it (Manage Household, Kids & School, Family) — then the place book: what the family saved from a
 * HomeTalk answer, and what they said is "not for us". Every member reads
 * it; an adult changes it — keeps a note, removes a saved place, or lets a
 * turned-down place be suggested again. Places come from HomeTalk's answers,
 * or an adult adds one here by picking it from a search (24-006).
 */
export default async function PlacesPage() {
  const session = await requireSession("/places");
  const { supabase, membership, view, viewer, secondary, locale } = session;
  const { t } = locale;
  const householdId = membership.household.id;
  const shell = { active: "more" as const, viewer, secondary, pathname: "/places", back: { href: "/more", label: t("common.back") }, title: t("nav.item.places") };

  let places: HouseholdPlace[];
  // The household's own places, each read as this viewer's session may read it (RLS keeps the rest out).
  const [address, enrolments, workPlaces, members] = await Promise.all([
    loadHouseholdAddress(supabase, householdId).catch(() => null),
    listEnrolments(supabase, householdId).catch(() => []),
    listWorkPlaces(supabase, householdId).catch(() => []),
    listMembers(supabase, householdId, membership.household.ownerMemberId).catch(() => []),
  ]);
  const ours = ourPlaces({ address, enrolments, workPlaces, names: new Map(members.map((member) => [member.id, member.displayName])) });
  const isAdmin = view.permissions.includes("household.manage");
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
  // Places a person added by hand come first, apart from those saved from a HomeTalk suggestion (the owner, 2026-10-21).
  const added = places.filter((place) => place.status === "saved" && place.origin === "added");
  const saved = places.filter((place) => place.status === "saved" && place.origin !== "added");
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

  const ourRow = (place: OurPlace) => {
    const look =
      place.kind === "home"
        ? { icon: House, tone: "home" as const, title: t("placeBook.ours.home"), editHref: isAdmin ? "/settings?tab=household#address" : null }
        : place.kind === "school"
          ? { icon: School, tone: "school" as const, title: place.name, editHref: canChange && place.memberIds[0] ? `/school?child=${place.memberIds[0]}` : null }
          : { icon: Briefcase, tone: "primary" as const, title: place.name, editHref: canChange ? "/family" : null };
    const who = place.people.join(", ");
    const what =
      place.kind === "home"
        ? place.name
        : place.kind === "school"
          ? who
            ? t("placeBook.ours.school", { names: who })
            : t("placeBook.ours.schoolNone")
          : t("placeBook.ours.office", { names: who });
    const meta = [what, place.address, place.pinned ? null : t("placeBook.ours.typed")].filter(Boolean).join(" · ");
    return (
      <ActionRow
        key={place.key}
        icon={look.icon}
        tone={look.tone}
        title={look.title}
        meta={meta}
        action={
          <div className="flex items-center gap-1">
            <a href={place.mapsUri} target="_blank" rel="noopener noreferrer" aria-label={t("hometalk.places.open", { name: look.title })} title={t("hometalk.places.open", { name: look.title })} className={ICON_LINK}>
              <ExternalLink aria-hidden className="size-4" />
            </a>
            {look.editHref ? (
              <Link href={look.editHref} aria-label={t("placeBook.ours.change", { name: look.title })} title={t("placeBook.ours.change", { name: look.title })} className={ICON_LINK}>
                <Pencil aria-hidden className="size-4" />
              </Link>
            ) : null}
          </div>
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

        {ours.length > 0 || (isAdmin && !address) ? (
          <section className="space-y-2">
            <SectionHeader title={t("placeBook.ours.title")} />
            <Card className="px-3">
              <ul className="divide-y divide-[var(--wh-border)]">
                {isAdmin && !address ? (
                  <ActionRow
                    icon={House}
                    tone="home"
                    title={t("placeBook.ours.addHome")}
                    meta={t("placeBook.ours.addHomeLede")}
                    action={
                      <Link href="/settings?tab=household#address" aria-label={t("placeBook.ours.addHome")} title={t("placeBook.ours.addHome")} className={ICON_LINK}>
                        <Pencil aria-hidden className="size-4" />
                      </Link>
                    }
                  />
                ) : null}
                {ours.map(ourRow)}
              </ul>
            </Card>
          </section>
        ) : null}

        {canChange && placeSearchAvailable() ? (
          <section className="space-y-2">
            <SectionHeader title={t("placeBook.add.title")} />
            <Card className="space-y-3 p-4">
              <p className="text-sm text-[var(--wh-foreground-muted)]">{t("placeBook.add.lede")}</p>
              <AddPlaceForm
                householdId={householdId}
                labels={{
                  label: t("placeBook.add.label"),
                  note: t("placeBook.add.note"),
                  save: t("placeBook.add.save"),
                  saving: t("common.saving"),
                  saved: t("placeBook.add.saved"),
                  pick: t("placeBook.add.pick"),
                  failed: t("placeBook.add.failed"),
                  busy: rateLimitMessage("places.find"),
                  search: placeSearchLabels(t, "place"),
                }}
              />
            </Card>
          </section>
        ) : null}

        {places.length === 0 && ours.length === 0 ? (
          <EmptyState icon={MapPin} tone="home" title={t("placeBook.emptyTitle")} description={t("placeBook.emptyLede")} />
        ) : (
          <>
            {added.length > 0 ? (
              <section className="space-y-2">
                <SectionHeader title={t("placeBook.added")} count={added.length} />
                <Card className="px-3">
                  <ul className="divide-y divide-[var(--wh-border)]">{added.map(row)}</ul>
                </Card>
              </section>
            ) : null}
            {saved.length > 0 ? (
              <section className="space-y-2">
                <SectionHeader title={t("placeBook.suggested")} count={saved.length} />
                <Card className="px-3">
                  <ul className="divide-y divide-[var(--wh-border)]">{saved.map(row)}</ul>
                </Card>
              </section>
            ) : null}
            {turnedDown.length > 0 ? (
              <section className="space-y-2">
                <SectionHeader title={t("placeBook.notForUs")} count={turnedDown.length} />
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
