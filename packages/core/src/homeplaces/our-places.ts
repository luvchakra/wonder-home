import type { HouseholdAddress } from "../household/address";
import type { WorkPlace } from "../household/work-place";
import { mapsLink } from "../places/provider";
import type { Enrolment } from "../school/enrolments";

/**
 * The places the household itself is anchored to, for HomePlaces (story
 * 24-010): the home address, each child's school and each adult's office —
 * every place picked from Google Maps anywhere in the app, beside the place
 * book's saved places. Each keeps its one editor (rule 23): the home in
 * Manage Household, a child's school on Kids & School, an adult's office
 * in their details in Family. This only reads what the viewer's own session already returned,
 * so whatever RLS keeps from them stays out.
 */
export type OurPlace = {
  key: string;
  kind: "home" | "school" | "office";
  /** The school's or office's name; the address itself for the home. */
  name: string;
  /** The address under the name; null for the home (its name is the address) or when none was kept. */
  address: string | null;
  /** Whose it is: the children at that school, the adults at that office. Empty for the home. */
  people: string[];
  /** The members those are, in the same order: where a school's or office's editor opens. */
  memberIds: string[];
  mapsUri: string;
  /** Picked from Google Maps (a point HomeTalk can search near), not only typed. */
  pinned: boolean;
};

export function ourPlaces(input: {
  address: HouseholdAddress | null;
  enrolments: readonly Enrolment[];
  workPlaces: readonly WorkPlace[];
  /** Member id → name, for whose school or office it is. */
  names: ReadonlyMap<string, string>;
}): OurPlace[] {
  const places: OurPlace[] = [];
  if (input.address?.formattedAddress) {
    places.push({
      key: "home",
      kind: "home",
      name: input.address.formattedAddress,
      address: null,
      people: [],
      memberIds: [],
      mapsUri: mapsLink({ formattedAddress: input.address.formattedAddress, placeId: input.address.placeId }),
      pinned: Boolean(input.address.placeId),
    });
  }

  // Siblings at one school are one place: by the picked place, else by name.
  const schools = new Map<string, OurPlace>();
  for (const enrolment of input.enrolments) {
    const name = enrolment.schoolName.trim();
    if (!name) continue;
    const key = `school:${enrolment.placeId ?? name.toLocaleLowerCase()}`;
    const who = input.names.get(enrolment.childMemberId);
    const existing = schools.get(key);
    if (existing) {
      if (who && !existing.people.includes(who)) existing.people.push(who);
      if (!existing.memberIds.includes(enrolment.childMemberId)) existing.memberIds.push(enrolment.childMemberId);
      continue;
    }
    schools.set(key, {
      key,
      kind: "school",
      name,
      address: enrolment.schoolAddress?.trim() || null,
      people: who ? [who] : [],
      memberIds: [enrolment.childMemberId],
      mapsUri: mapsLink({ name, formattedAddress: enrolment.schoolAddress ?? "", placeId: enrolment.placeId }),
      pinned: Boolean(enrolment.placeId),
    });
  }

  const offices = new Map<string, OurPlace>();
  for (const office of input.workPlaces) {
    const key = `office:${office.placeId}`;
    const who = input.names.get(office.memberId);
    const existing = offices.get(key);
    if (existing) {
      if (who && !existing.people.includes(who)) existing.people.push(who);
      if (!existing.memberIds.includes(office.memberId)) existing.memberIds.push(office.memberId);
      continue;
    }
    offices.set(key, {
      key,
      kind: "office",
      name: office.name,
      address: office.address?.trim() || null,
      people: who ? [who] : [],
      memberIds: [office.memberId],
      mapsUri: mapsLink({ name: office.name, formattedAddress: office.address ?? "", placeId: office.placeId }),
      pinned: true,
    });
  }

  const byName = (a: OurPlace, b: OurPlace) => a.name.localeCompare(b.name);
  return [...places, ...[...schools.values()].sort(byName), ...[...offices.values()].sort(byName)];
}
