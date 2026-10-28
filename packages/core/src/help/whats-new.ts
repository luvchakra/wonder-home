/**
 * What's new: the features a person has not seen yet, shown for a while at
 * the top of Home.
 *
 * Each entry is something that actually shipped, dated by when it reached
 * production (its merge to `main`), and opens the place it lives. Nothing
 * planned is ever listed (help rule: never describe a planned feature as
 * available). An entry stops showing by itself `WHATS_NEW_DAYS` after its
 * date, so the section is temporary by construction; add an entry in the
 * same pull request as the feature, with its words as `whatsNew.<id>.*` in
 * every catalog.
 */

export const WHATS_NEW_DAYS = 30;

export type WhatsNewIcon = "calendar" | "lock" | "holiday" | "places" | "clock" | "groceries" | "talk" | "pets" | "event" | "languages" | "home" | "invite";

export type WhatsNewEntry = {
  id: string;
  /** When it reached production, as an instant. */
  at: string;
  icon: WhatsNewIcon;
  href: string;
  /** Shown only to Admins, when the place it opens is theirs alone. */
  audience?: "admin";
};

/** Newest first. An entry is never shown before its `at`. */
export const WHATS_NEW: readonly WhatsNewEntry[] = [
  // Dated a little after its expected merge: an entry stays hidden until its time, so it can be late but never missed.
  { id: "mealShortfall", at: "2026-10-18T08:30:00Z", icon: "groceries", href: "/meals" },
  { id: "officePlaces", at: "2026-10-18T06:30:00Z", icon: "places", href: "/places" },
  { id: "memberSignIn", at: "2026-10-18T05:30:00Z", icon: "invite", href: "/family", audience: "admin" },
  { id: "calendarAnswers", at: "2026-10-18T02:30:00Z", icon: "talk", href: "/ai" },
  { id: "calendar", at: "2026-10-18T01:15:49Z", icon: "calendar", href: "/calendar" },
  { id: "eventPrivacy", at: "2026-10-18T01:15:49Z", icon: "lock", href: "/calendar" },
  { id: "holidays", at: "2026-10-18T01:15:49Z", icon: "holiday", href: "/calendar?view=year" },
  { id: "placeBook", at: "2026-10-17T23:48:27Z", icon: "places", href: "/places" },
  { id: "dayHours", at: "2026-10-17T23:48:27Z", icon: "clock", href: "/settings" },
  { id: "groceryTalk", at: "2026-10-17T23:14:03Z", icon: "talk", href: "/ai" },
  { id: "petsHome", at: "2026-10-17T22:51:54Z", icon: "pets", href: "/family" },
  { id: "groceries", at: "2026-10-17T16:07:45Z", icon: "groceries", href: "/groceries" },
  { id: "eventPage", at: "2026-10-17T15:24:35Z", icon: "event", href: "/family" },
  { id: "homePlaces", at: "2026-10-17T11:01:51Z", icon: "places", href: "/ai" },
  { id: "memberLanguages", at: "2026-10-17T06:20:41Z", icon: "languages", href: "/settings/language-region" },
  { id: "homeOnMap", at: "2026-10-17T05:48:27Z", icon: "home", href: "/settings?tab=household#address", audience: "admin" },
];

/** Entries still recent enough to show at all (within `WHATS_NEW_DAYS` of `now`), for this reader. */
export function recentEntries(entries: readonly WhatsNewEntry[], now: Date, options: { isAdmin: boolean; days?: number }): WhatsNewEntry[] {
  const since = now.getTime() - (options.days ?? WHATS_NEW_DAYS) * 86_400_000;
  return entries.filter(
    (entry) => Date.parse(entry.at) > since && Date.parse(entry.at) <= now.getTime() && (entry.audience !== "admin" || options.isAdmin),
  );
}

/**
 * What a person has not seen: entries that reached production after they
 * last opened the app. Never opened before (no record): everything recent.
 */
export function unseenEntries<T extends Pick<WhatsNewEntry, "at">>(entries: readonly T[], lastOpenedAt: string | null): T[] {
  const since = lastOpenedAt ? Date.parse(lastOpenedAt) : Number.NaN;
  if (Number.isNaN(since)) return [...entries];
  return entries.filter((entry) => Date.parse(entry.at) > since);
}
