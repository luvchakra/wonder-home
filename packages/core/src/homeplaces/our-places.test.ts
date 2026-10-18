import { describe, expect, it } from "vitest";

import { ourPlaces } from "./our-places";

const names = new Map([
  ["anya", "Anya"],
  ["manan", "Manan"],
  ["kunal", "Kunal"],
  ["upasana", "Upasana"],
]);
const enrolment = (child: string, schoolName: string, placeId: string | null, schoolAddress: string | null = null) => ({
  childMemberId: child, schoolName, grade: null, placeId, schoolAddress, location: null, hours: null,
});
const office = (memberId: string, placeId: string, name: string) => ({
  memberId, placeId, name, address: `${name} Road`, location: { latitude: 12.9, longitude: 77.6 },
});

describe("ourPlaces", () => {
  it("lists the home, then schools, then offices, each with a Google Maps link", () => {
    const places = ourPlaces({
      address: { formattedAddress: "12 MG Road, Bengaluru", placeId: "home-1", location: { latitude: 12.97, longitude: 77.6 } },
      enrolments: [enrolment("anya", "Greenwood High", "school-1", "Sarjapur Road")],
      workPlaces: [office("kunal", "office-1", "Embassy Tech Village")],
      names,
    });
    expect(places.map((place) => [place.kind, place.name, place.people])).toEqual([
      ["home", "12 MG Road, Bengaluru", []],
      ["school", "Greenwood High", ["Anya"]],
      ["office", "Embassy Tech Village", ["Kunal"]],
    ]);
    expect(places[0]!.mapsUri).toContain("query_place_id=home-1");
    expect(places.every((place) => place.pinned)).toBe(true);
  });

  it("shows siblings at one school, and two adults at one office, as one place", () => {
    const places = ourPlaces({
      address: null,
      enrolments: [enrolment("anya", "Greenwood High", "school-1"), enrolment("manan", "Greenwood High", "school-1")],
      workPlaces: [office("kunal", "office-1", "Embassy Tech Village"), office("upasana", "office-1", "Embassy Tech Village")],
      names,
    });
    expect(places.map((place) => [place.name, place.people, place.memberIds])).toEqual([
      ["Greenwood High", ["Anya", "Manan"], ["anya", "manan"]],
      ["Embassy Tech Village", ["Kunal", "Upasana"], ["kunal", "upasana"]],
    ]);
  });

  it("keeps a typed home or school, marked as not picked from Maps", () => {
    const places = ourPlaces({
      address: { formattedAddress: "Flat 4, Lake View", placeId: null, location: null },
      enrolments: [enrolment("anya", "Little Feet", null)],
      workPlaces: [],
      names,
    });
    expect(places.map((place) => [place.kind, place.pinned])).toEqual([
      ["home", false],
      ["school", false],
    ]);
  });

  it("is empty when nothing is on record, or nothing this viewer may see", () => {
    expect(ourPlaces({ address: null, enrolments: [], workPlaces: [], names })).toEqual([]);
  });
});
