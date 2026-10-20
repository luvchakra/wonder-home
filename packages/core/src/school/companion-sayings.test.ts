import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import sayings from "./companion-sayings.json";
import { SAYING_KINDS, sayingText } from "./sayings";

const LANGUAGES = ["en", "hi", "mr", "es", "fr", "de", "ar", "zh"];
const MIGRATION = readFileSync(new URL("../../../../supabase/migrations/20261020231000_companion_sayings.sql", import.meta.url), "utf8");

describe("the cat's sayings list", () => {
  it("is long, with every saying tagged and in every language", () => {
    expect(sayings.length).toBeGreaterThanOrEqual(150);
    expect(new Set(sayings.map((saying) => saying.id)).size).toBe(sayings.length);
    for (const saying of sayings) {
      expect(saying.id).toMatch(/^[a-z0-9-]{3,40}$/);
      expect(SAYING_KINDS).toContain(saying.kind);
      expect(saying.minAge).toBeGreaterThanOrEqual(3);
      expect(saying.maxAge).toBeGreaterThanOrEqual(saying.minAge);
      expect(saying.maxAge).toBeLessThanOrEqual(18);
      expect(["any", "girl", "boy"]).toContain(saying.gender);
      expect(saying.tags.length).toBeGreaterThan(0);
      for (const language of LANGUAGES) expect((saying.words as Record<string, string>)[language]?.trim(), `${saying.id} ${language}`).toBeTruthy();
    }
  });

  it("has something for every age band", () => {
    for (const age of [4, 6, 8, 10, 12, 13, 15, 17]) {
      expect(sayings.filter((saying) => saying.minAge <= age && saying.maxAge >= age).length, `age ${age}`).toBeGreaterThanOrEqual(40);
    }
  });

  it("is what the migration seeds, word for word", () => {
    const seeded = JSON.parse(MIGRATION.split("$sayings$")[1]!) as typeof sayings;
    expect(seeded).toEqual(sayings);
  });
});

describe("a saying is read in the child's language", () => {
  it("falls back to English, and never to nothing", () => {
    expect(sayingText({ en: "Hello", hi: "नमस्ते" }, "hi")).toBe("नमस्ते");
    expect(sayingText({ en: "Hello" }, "fr")).toBe("Hello");
    expect(sayingText({}, "fr")).toBeNull();
  });
});
