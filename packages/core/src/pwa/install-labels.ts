import { languageInfo, isLanguage } from "../i18n/locales";
import { en } from "../i18n/messages/en";
import { translator, type Translate } from "../i18n/translate";

/**
 * The install banner's words in one language (story 00-011), built on the
 * server from the catalog and handed to the banner as props, the way every
 * other client component here gets its words. `step1` keeps the `{share}`
 * placeholder: the banner draws the Share glyph wherever the language puts it.
 */
export type InstallBannerLabels = {
  language: string;
  dir: "ltr" | "rtl";
  label: string;
  benefit: string;
  install: string;
  howTo: string;
  dismiss: string;
  step1: string;
  step2: string;
  done: string;
};

export function installBannerLabels(t: Translate, language: string): InstallBannerLabels {
  return {
    language,
    dir: isLanguage(language) ? languageInfo(language).dir : "ltr",
    label: t("install.banner.label"),
    benefit: t("install.banner.benefit"),
    install: t("install.banner.install"),
    howTo: t("install.banner.howTo"),
    dismiss: t("install.banner.dismiss"),
    // Kept as a template: `{share}` is where the glyph goes, never text.
    step1: t("install.banner.step1", { share: "{share}" }),
    step2: t("install.banner.step2"),
    done: t("install.banner.done"),
  };
}

/** English, for a frame that has no reader's language (the landing page, the legal page). */
export function englishInstallBannerLabels(): InstallBannerLabels {
  return installBannerLabels(translator("en", en), "en");
}
