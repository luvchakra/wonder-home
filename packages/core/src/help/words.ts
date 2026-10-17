/**
 * The user guide's words, in every language WonderHome speaks — kept out of
 * the app's general message catalogs on purpose.
 *
 * The guide is for signed-in members only. The general catalogs are bundled
 * into client JavaScript (HomeTalk and HomeSend import English as their
 * fallback), and everything under `/_next/static` can be downloaded without
 * signing in. So the guide's words live here instead, read only by the help
 * page, its search action and `help/guide.ts` / `help/search.ts`, all of
 * which run on the server. `scripts/check-client-bundle.mjs` fails the build
 * in CI if any of it ever reaches a client chunk again.
 */
import { DEFAULT_LANGUAGE, isLanguage, type LanguageCode } from "../i18n/locales";
import { helpAr } from "../i18n/messages/areas/help/ar";
import { helpDe } from "../i18n/messages/areas/help/de";
import { helpEn } from "../i18n/messages/areas/help/en";
import { helpEs } from "../i18n/messages/areas/help/es";
import { helpFr } from "../i18n/messages/areas/help/fr";
import { helpHi } from "../i18n/messages/areas/help/hi";
import { helpMr } from "../i18n/messages/areas/help/mr";
import { helpZh } from "../i18n/messages/areas/help/zh";
import { interpolate, type TranslationParams } from "../i18n/translate";

export type HelpKey = keyof typeof helpEn;

/** Reads one of the guide's words in one language, English where a translation is missing. */
export type HelpWords = (key: HelpKey, params?: TranslationParams) => string;

const CATALOGS: Record<LanguageCode, Partial<Record<HelpKey, string>>> = {
  en: helpEn,
  hi: helpHi,
  mr: helpMr,
  es: helpEs,
  fr: helpFr,
  de: helpDe,
  ar: helpAr,
  zh: helpZh,
};

export function helpWords(language: string = DEFAULT_LANGUAGE): HelpWords {
  const catalog = CATALOGS[isLanguage(language) ? language : DEFAULT_LANGUAGE];
  return (key, params) => interpolate(catalog[key] ?? helpEn[key], params);
}

/** English, the source every other language carries the same keys as. */
export const englishHelp: HelpWords = helpWords("en");

export { helpEn };
