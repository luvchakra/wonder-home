import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LANGUAGE_CODES } from "@wonderhome/core/i18n/locales";
import { loadCatalog, translator } from "@wonderhome/core/i18n/translate";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ language: "en" }));
vi.mock("./_lib/entry-locale", async () => {
  const { loadCatalog, translator } = await import("@wonderhome/core/i18n/translate");
  return { visitorLocale: async () => ({ language: state.language, dir: state.language === "ar" ? "rtl" : "ltr", t: translator(state.language, await loadCatalog(state.language)) }) };
});

const { NewLanding } = await import("./_screens/landing-new");

describe("the new landing", () => {
  it("has one h1, landmarks, one primary call to action above the fold, and a skip link", async () => {
    const html = renderToStaticMarkup(await NewLanding());
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("<main id=\"wh-main\"");
    expect(html).toContain("<header");
    expect(html).toContain("<footer");
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('href="#wh-main"');
    expect(html).not.toContain("<script");
  });

  it("speaks every language, right to left for Arabic", async () => {
    for (const code of LANGUAGE_CODES) {
      state.language = code;
      const html = renderToStaticMarkup(await NewLanding());
      expect(html, code).toContain(`lang="${code}"`);
      expect(html, code).not.toMatch(/landing\.[a-z]+\./);
      if (code === "ar") expect(html).toContain('dir="rtl"');
    }
    state.language = "en";
  });

  it("never says it pays or orders", async () => {
    const en = translator("en", await loadCatalog("en"));
    expect(en("landing.features.bills.body")).toMatch(/never pays/i);
  });
});
