import type { SupabaseClient } from "@supabase/supabase-js";

import { loadHouseholdAddress } from "../household/address";
import { isOpenFor, metresBetween, PlacesUnavailableError, type LatLng, type PlaceResult, type PlacesProvider } from "../places/provider";
import { clock, type PlaceRequest } from "./request";
import { listHouseholdPlaces, type HouseholdPlace } from "./repository";

/**
 * HomePlaces: real places for a household's question, found and ranked by
 * rules.
 *
 * 1. **Where.** The anchor is home, a child's school, or someone's office,
 *    taken from what the household saved: never guessed. Two children at
 *    different schools and no name is one question back; an office nobody
 *    picked is said, with where to pick it.
 * 1b. **When.** "After school" starts when that school's day ends, and
 *    "after work" when the speaker's office hours end, both as recorded.
 *    With nothing on record the usual time is assumed and said aloud.
 * 2. **What.** The provider (Google Places) is asked near that point, then
 *    every place is checked against its weekly hours for the whole window
 *    the family asked about. Unknown hours rank lower; closed is dropped.
 * 3. **Learned.** Places the family saved come first, places marked "not for
 *    us" never return, and kinds of place they saved are preferred. That is
 *    the whole of the learning, and it is the family's own doing.
 *
 * Nothing here writes, and nothing here is a model's opinion.
 */

/** "After school" with no school hours on record: said back as an assumption, never hidden. */
export const ASSUMED_SCHOOL_END_MINUTE = 15 * 60 + 30;
/** "After work" with no office hours on record: the same, said back. */
export const ASSUMED_WORK_END_MINUTE = 18 * 60;
export const MAX_SUGGESTIONS = 5;

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  address: string;
  kind: string | null;
  distanceMeters: number;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: number | null;
  /** Open for the whole window asked about: true, or null when its hours are not known. */
  openForWindow: boolean | null;
  mapsUri: string | null;
  location: LatLng;
  /** The family saved it before. */
  saved: boolean;
};

export type PlacesOutcome =
  | {
      kind: "found";
      places: PlaceSuggestion[];
      /** "home", or "Anya's school". */
      near: string;
      /** "now", "from 7:30 pm", "after school (from 3:30 pm)". */
      window: string;
      /** Said back when a time was assumed rather than known. */
      assumption: string | null;
    }
  | { kind: "none"; near: string; window: string }
  | { kind: "needs_home" }
  | { kind: "needs_school"; childName: string | null }
  | { kind: "which_child"; names: string[] }
  /** The office asked about has not been picked: the speaker's own when `personName` is null. */
  | { kind: "needs_work"; personName: string | null }
  | { kind: "off" }
  | { kind: "unavailable" };

export type PlacesContext = {
  householdId: string;
  /** The household's own clock: weekday (0 is Sunday) and minute past midnight now. */
  now: { day: number; minute: number };
  children: readonly { id: string; name: string }[];
  /** `endsMinute`: when that school's day ends, minutes past midnight, when recorded. */
  schools: readonly { childMemberId: string; schoolName: string; location: LatLng | null; endsMinute?: number | null }[];
  /** When the speaker's working day ends, minutes past midnight, when recorded. */
  workEndsMinute?: number | null;
  /** Who is asking, so "my office" is theirs. */
  speakerMemberId?: string | null;
  /** The offices this speaker may see (their own, or every adult's for an adult), each by its person. */
  workPlaces?: readonly { memberId: string; personName: string; location: LatLng }[];
  languageCode?: string | null;
  regionCode?: string | null;
};

/** `schoolEnds`: when the school it is anchored at finishes, when that is recorded. */
type Anchor = { point: LatLng; near: string; schoolEnds?: number | null };

export async function suggestPlaces(
  supabase: SupabaseClient,
  provider: PlacesProvider | null,
  request: PlaceRequest,
  context: PlacesContext,
): Promise<PlacesOutcome> {
  if (!provider?.findNearby) return { kind: "off" };

  const anchor = await anchorFor(supabase, request, context);
  if ("kind" in anchor) return anchor;

  const window = windowFor(request, context, anchor);
  let found: PlaceResult[];
  try {
    found = await provider.findNearby({
      text: request.query,
      near: anchor.point,
      radiusMeters: request.radiusMeters,
      openNow: request.when.kind === "now",
      max: 15,
      languageCode: context.languageCode,
      regionCode: context.regionCode,
    });
  } catch (error) {
    if (error instanceof PlacesUnavailableError) return { kind: "unavailable" };
    throw error;
  }

  const known = await listHouseholdPlaces(supabase, context.householdId).catch(() => [] as HouseholdPlace[]);
  const places = rankPlaces(found, { anchor: anchor.point, window, known, radiusMeters: request.radiusMeters });
  if (places.length === 0) return { kind: "none", near: anchor.near, window: window.label };
  return { kind: "found", places, near: anchor.near, window: window.label, assumption: window.assumption };
}

async function anchorFor(supabase: SupabaseClient, request: PlaceRequest, context: PlacesContext): Promise<Anchor | Exclude<PlacesOutcome, { kind: "found" | "none" }>> {
  if (request.anchor.kind === "home") {
    const home = await loadHouseholdAddress(supabase, context.householdId).catch(() => null);
    return home?.location ? { point: home.location, near: "home" } : { kind: "needs_home" };
  }
  if (request.anchor.kind === "work") return workAnchor(request.anchor.personName, context);

  const named = request.anchor.childName?.toLocaleLowerCase();
  const children = named ? context.children.filter((child) => child.name.toLocaleLowerCase().split(/\s+/)[0] === named || child.name.toLocaleLowerCase() === named) : context.children;
  const withSchool = children.flatMap((child) => {
    const school = context.schools.find((entry) => entry.childMemberId === child.id);
    return school ? [{ child, school }] : [];
  });
  const distinctSchools = new Set(withSchool.map((entry) => entry.school.schoolName));
  if (withSchool.length === 0) return { kind: "needs_school", childName: request.anchor.childName };
  if (distinctSchools.size > 1) return { kind: "which_child", names: withSchool.map((entry) => entry.child.name) };
  const { child, school } = withSchool[0]!;
  if (!school.location) return { kind: "needs_school", childName: child.name };
  const firstName = child.name.split(/\s+/)[0] ?? child.name;
  return { point: school.location, near: withSchool.length > 1 ? school.schoolName : `${firstName}'s school`, schoolEnds: school.endsMinute ?? null };
}

/** "Near my office" is the speaker's; "near Kunal's office" is the adult of that first name, if this speaker may see it. */
function workAnchor(personName: string | null, context: PlacesContext): Anchor | { kind: "needs_work"; personName: string | null } {
  const offices = context.workPlaces ?? [];
  if (!personName) {
    const own = offices.find((office) => office.memberId === context.speakerMemberId);
    return own ? { point: own.location, near: "your office" } : { kind: "needs_work", personName: null };
  }
  const named = personName.toLocaleLowerCase();
  const theirs = offices.find((office) => {
    const name = office.personName.toLocaleLowerCase();
    return name === named || name.split(/\s+/)[0] === named;
  });
  if (!theirs) return { kind: "needs_work", personName };
  const firstName = theirs.personName.split(/\s+/)[0] ?? theirs.personName;
  return { point: theirs.location, near: theirs.memberId === context.speakerMemberId ? "your office" : `${firstName}'s office` };
}

type Window = { day: number; minute: number; forMinutes: number; label: string; assumption: string | null; now: boolean };

/**
 * When "after school" starts. Anchored at a school: that school's own end.
 * Anchored at home: the last of the children's recorded ends, since that is
 * when everyone is out. Null when nothing is recorded.
 */
function schoolEndFor(anchor: Anchor, context: PlacesContext): number | null {
  if (anchor.schoolEnds !== undefined) return anchor.schoolEnds ?? null;
  const ends = context.schools.map((school) => school.endsMinute).filter((end): end is number => typeof end === "number");
  return ends.length ? Math.max(...ends) : null;
}

function windowFor(request: PlaceRequest, context: PlacesContext, anchor: Anchor): Window {
  const { day, minute } = context.now;
  switch (request.when.kind) {
    case "now":
      return { day, minute, forMinutes: 60, label: "now", assumption: null, now: true };
    case "today": {
      // A time already gone today ("dinner" asked at 10 pm) means from now.
      const start = Math.max(request.when.minute, minute);
      return { day, minute: start, forMinutes: request.when.forMinutes, label: start === minute ? "now" : `from ${clock(start)}`, assumption: null, now: start === minute };
    }
    case "after_school": {
      const known = schoolEndFor(anchor, context);
      const start = Math.max(known ?? ASSUMED_SCHOOL_END_MINUTE, minute);
      return {
        day,
        minute: start,
        forMinutes: request.when.forMinutes,
        label: `after school, from ${clock(start)}`,
        assumption: known === null ? `I've taken school as finishing around ${clock(ASSUMED_SCHOOL_END_MINUTE)}. Add school hours to the child's details in Family to make this exact.` : null,
        now: false,
      };
    }
    case "after_work": {
      const known = context.workEndsMinute ?? null;
      const start = Math.max(known ?? ASSUMED_WORK_END_MINUTE, minute);
      return {
        day,
        minute: start,
        forMinutes: request.when.forMinutes,
        label: `after work, from ${clock(start)}`,
        assumption: known === null ? `I've taken work as finishing around ${clock(ASSUMED_WORK_END_MINUTE)}. Add your office hours to your details in Settings to make this exact.` : null,
        now: false,
      };
    }
  }
}

/** Best first: the family's own saves, then open-and-good, then near. Never a place they turned down. */
export function rankPlaces(
  found: readonly PlaceResult[],
  options: { anchor: LatLng; window: Pick<Window, "day" | "minute" | "forMinutes" | "now">; known: readonly HouseholdPlace[]; radiusMeters: number },
): PlaceSuggestion[] {
  const rejected = new Set(options.known.filter((place) => place.status === "not_for_us").map((place) => place.placeId));
  const saved = new Set(options.known.filter((place) => place.status === "saved").map((place) => place.placeId));
  const likedKinds = new Set(options.known.filter((place) => place.status === "saved" && place.kind).map((place) => place.kind!.toLowerCase()));

  const scored: { place: PlaceSuggestion; score: number }[] = [];
  for (const place of found) {
    if (rejected.has(place.placeId)) continue;
    const distanceMeters = metresBetween(options.anchor, place.location);
    if (distanceMeters > options.radiusMeters * 1.5) continue;
    const open = options.window.now && place.openNow !== null ? place.openNow : isOpenFor(place.periods, options.window.day, options.window.minute, options.window.forMinutes);
    if (open === false) continue;

    let score = place.rating ?? 3.6;
    score += Math.min(Math.log10((place.ratingCount ?? 0) + 1), 4) * 0.15;
    score -= (distanceMeters / 1000) * 0.12;
    if (open === null) score -= 0.4;
    if (saved.has(place.placeId)) score += 1.5;
    if (place.kind && likedKinds.has(place.kind.toLowerCase())) score += 0.3;

    scored.push({
      score,
      place: {
        placeId: place.placeId,
        name: place.name,
        address: place.address,
        kind: place.kind,
        distanceMeters,
        rating: place.rating,
        ratingCount: place.ratingCount,
        priceLevel: place.priceLevel,
        openForWindow: open,
        mapsUri: place.mapsUri,
        location: place.location,
        saved: saved.has(place.placeId),
      },
    });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.place);
}

/**
 * The places a HomeTalk reply offered, read back from its stored metadata so
 * the cards survive a reload, and so a Save is checked against what was
 * actually offered rather than whatever a browser sends. Anything malformed
 * is dropped.
 */
export function placesFrom(metadata: unknown): PlaceSuggestion[] {
  const raw = (metadata as { places?: unknown } | null)?.places;
  if (!Array.isArray(raw)) return [];
  const found: PlaceSuggestion[] = [];
  for (const entry of raw.slice(0, MAX_SUGGESTIONS)) {
    const place = entry as Partial<PlaceSuggestion> | null;
    if (!place || typeof place.placeId !== "string" || typeof place.name !== "string") continue;
    const location = place.location;
    if (!location || typeof location.latitude !== "number" || typeof location.longitude !== "number") continue;
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    found.push({
      placeId: place.placeId,
      name: place.name,
      address: typeof place.address === "string" ? place.address : "",
      kind: typeof place.kind === "string" ? place.kind : null,
      distanceMeters: number(place.distanceMeters) ?? 0,
      rating: number(place.rating),
      ratingCount: number(place.ratingCount),
      priceLevel: number(place.priceLevel),
      openForWindow: typeof place.openForWindow === "boolean" ? place.openForWindow : null,
      mapsUri: typeof place.mapsUri === "string" && place.mapsUri.startsWith("https://") ? place.mapsUri : null,
      location: { latitude: location.latitude, longitude: location.longitude },
      saved: place.saved === true,
    });
  }
  return found;
}

/** The household's weekday and minute right now, on its own clock. */
export function householdNow(now: Date, timezone: string): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day: day < 0 ? now.getUTCDay() : day, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}
