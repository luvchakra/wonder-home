import { describe, expect, it } from "vitest";

import { LANGUAGE_CODES } from "../i18n/locales";
import { localizedReleaseNotes, RELEASE_NOTES } from "./release-notes";
import { helpWords } from "./words";

describe("release notes", () => {
  it("lists entries newest first, each covering the pull requests after the one before it", () => {
    RELEASE_NOTES.forEach((entry, index) => {
      expect(entry.date, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.fromPr, entry.id).toBeLessThanOrEqual(entry.throughPr);
      const older = RELEASE_NOTES[index + 1];
      if (older) {
        expect(entry.date > older.date || entry.date === older.date, entry.id).toBe(true);
        expect(entry.fromPr, entry.id).toBe(older.throughPr + 1);
      }
    });
    expect(new Set(RELEASE_NOTES.map((entry) => entry.id)).size).toBe(RELEASE_NOTES.length);
  });

  it("has a title and at least one item for every entry in English", () => {
    for (const entry of localizedReleaseNotes()) {
      expect(entry.title, entry.id).not.toMatch(/^help\.release\./);
      expect(entry.items.length, entry.id).toBeGreaterThan(0);
    }
  });

  it.each(LANGUAGE_CODES.filter((code) => code !== "en"))("says every entry in %s, item for item", (language) => {
    const english = localizedReleaseNotes();
    const localized = localizedReleaseNotes(helpWords(language));
    localized.forEach((entry, index) => {
      expect(entry.title, entry.id).not.toBe(english[index]!.title);
      expect(entry.items.length, entry.id).toBe(english[index]!.items.length);
      entry.items.forEach((item, n) => expect(item, `${entry.id} item ${n + 1}`).not.toBe(english[index]!.items[n]));
    });
    const t = helpWords(language);
    expect(t("help.release.title")).not.toBe(helpWords("en")("help.release.title"));
  });
});
