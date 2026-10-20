import { describe, expect, it } from "vitest";

import { agoText, mapLink, metresBetween, placeAt, type KnownPlace } from "./sharing";

const places: KnownPlace[] = [
  { name: "Home", kind: "home", latitude: 19.2183, longitude: 72.9781 },
  { name: "Podar International Thane", kind: "school", latitude: 19.2306, longitude: 72.9719 },
];

describe("where a member is, said as a place", () => {
  it("names the saved place they are at", () => {
    expect(placeAt({ latitude: 19.2184, longitude: 72.9782 }, places)?.name).toBe("Home");
    expect(placeAt({ latitude: 19.2305, longitude: 72.972 }, places)?.name).toBe("Podar International Thane");
  });

  it("names nothing when they are away from every saved place", () => {
    expect(placeAt({ latitude: 19.25, longitude: 72.99 }, places)).toBeNull();
  });

  it("allows for a reading's accuracy, up to a limit", () => {
    // About 250 m from home: not there on a sharp reading, there on a 120 m one.
    expect(placeAt({ latitude: 19.2205, longitude: 72.9781 }, places)).toBeNull();
    expect(placeAt({ latitude: 19.2205, longitude: 72.9781, accuracyM: 120 }, places)?.name).toBe("Home");
  });

  it("measures distance and links a map", () => {
    expect(Math.round(metresBetween(places[0]!, places[1]!) / 100) * 100).toBe(1500);
    expect(mapLink({ latitude: 19.21834, longitude: 72.97811 })).toBe("https://www.google.com/maps/search/?api=1&query=19.2183,72.9781");
  });
});

describe("agoText", () => {
  it("says how long ago in the reader's language", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(agoText("en", new Date("2026-10-20T11:56:00Z"), now)).toBe("4 minutes ago");
    expect(agoText("en", new Date("2026-10-20T10:00:00Z"), now)).toBe("2 hours ago");
    expect(agoText("en", new Date("2026-10-19T12:00:00Z"), now)).toBe("yesterday");
    expect(agoText("en", now, now)).toBe("this minute");
  });
});
