import { describe, expect, it } from "vitest";

import { LANGUAGE_CODES } from "./locales";
import { en } from "./messages/en";
import { interpolate, loadCatalog, translator, translatorFor } from "./translate";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("the catalogs", () => {
  it("every language carries every English key, and no empty strings", async () => {
    for (const code of LANGUAGE_CODES) {
      const catalog = await loadCatalog(code);
      for (const key of Object.keys(en)) {
        expect(catalog[key as keyof typeof en], `${code}: ${key}`).toBeTruthy();
      }
    }
  });

  it("every translation keeps the same placeholders as English", async () => {
    for (const code of LANGUAGE_CODES) {
      const catalog = (await loadCatalog(code)) as Record<string, string>;
      for (const [key, english] of Object.entries(en)) {
        // A plural form may drop {count} when the word itself says the number ("عضو واحد").
        if (key.includes("#")) continue;
        expect(placeholders(catalog[key]!), `${code}: ${key}`).toEqual(placeholders(english));
      }
    }
  });

  it("product names are never translated", async () => {
    for (const code of LANGUAGE_CODES) {
      const catalog = await loadCatalog(code);
      expect(catalog["nav.ai"]).toBe("HomeTalk");
      expect(catalog["nav.item.homesend"]).toBe("HomeSend");
      expect(catalog["nav.item.certification"]).toContain("HomeBrain");
    }
  });
});

describe("t()", () => {
  it("translates, interpolates and chooses plurals by the language's own rules", async () => {
    const hi = await translatorFor("hi");
    expect(hi("nav.home")).toBe("होम");
    expect(hi("l10n.step", { current: 2, total: 6 })).toBe("चरण 2 / 6");
    const t = translator("en", en);
    expect(t("settings.members.count", { count: 1 })).toBe("1 member");
    expect(t("settings.members.count", { count: 4 })).toBe("4 members");
    const ar = await translatorFor("ar");
    expect(ar("settings.members.count", { count: 1 })).toBe("عضو واحد");
    expect(ar("settings.members.count", { count: 2 })).toBe("عضوان");
    expect(ar("settings.members.count", { count: 5 })).toBe("5 أعضاء");
  });

  it("falls back to English key by key, and never shows a key", () => {
    const partial = { "nav.home": "Casa" } as unknown as typeof en;
    const t = translator("es", partial);
    expect(t("nav.home")).toBe("Casa");
    expect(t("nav.today")).toBe("Today");
    // An unknown key (only reachable by a bug) is empty, never the key itself.
    expect(t("no.such.key" as never)).toBe("");
  });

  it("an unknown language is English", async () => {
    expect((await translatorFor("tlh"))("nav.home")).toBe("Home");
  });

  it("a parameter is text, never a key or another placeholder", () => {
    const t = translator("en", en);
    expect(t("l10n.step", { current: "{total}", total: "nav.home" })).toBe("Step {total} of nav.home");
    expect(interpolate("Hello {name}{missing}", { name: "<b>Priya</b>" })).toBe("Hello <b>Priya</b>");
  });
});
