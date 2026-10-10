import { describe, expect, it } from "vitest";

import { LANGUAGE_CODES } from "../i18n/locales";
import { translatorFor } from "../i18n/translate";
import { englishInstallBannerLabels, installBannerLabels } from "./install-labels";

describe("installBannerLabels", () => {
  it("every language has the banner's words, with the Share glyph's place kept for the banner to fill", async () => {
    for (const language of LANGUAGE_CODES) {
      const labels = installBannerLabels(await translatorFor(language), language);
      for (const [field, value] of Object.entries(labels)) expect(value, `${language}: ${field}`).toBeTruthy();
      expect(labels.step1.split("{share}"), language).toHaveLength(2);
      // The browser's own button is quoted, so nobody hunts for a paraphrase.
      expect(labels.step2, language).toMatch(/[“«„"]/);
    }
  });

  it("Arabic lays the banner out right to left; the others left to right", async () => {
    expect(installBannerLabels(await translatorFor("ar"), "ar").dir).toBe("rtl");
    expect(installBannerLabels(await translatorFor("hi"), "hi").dir).toBe("ltr");
    expect(englishInstallBannerLabels()).toMatchObject({ language: "en", dir: "ltr", install: "Install" });
  });

  it("promises only what installing really gives", () => {
    expect(englishInstallBannerLabels().benefit).not.toMatch(/offline|notification/i);
  });
});
