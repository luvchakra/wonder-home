import { CURRENCIES, currencyInfo, describeTimezone, LANGUAGES, languageInfo, REGIONS, regionInfo, type CurrencyCode, type LanguageCode, type RegionCode } from "./locales";

/**
 * The rows the language, region and currency pickers offer (story 22-003),
 * shared by the setup and by Settings so there is one list, never two.
 *
 * Region and currency names come from the platform's own `Intl.DisplayNames`
 * in the reader's language — "भारत", "Indian Rupee" in English, "भारतीय रुपया"
 * in Hindi — so no hand-kept list of translated country names can drift.
 * A language is always its own name, whatever language the page is in.
 */

export type PickerOption = { value: string; label: string; detail?: string; keywords?: string; lang?: string; dir?: "ltr" | "rtl" };

function displayName(language: string, type: "region" | "currency" | "language", code: string, fallback: string): string {
  try {
    return new Intl.DisplayNames([language, "en"], { type }).of(code) ?? fallback;
  } catch {
    return fallback;
  }
}

export function languageOptions(): PickerOption[] {
  return LANGUAGES.map((language) => ({
    value: language.code,
    label: language.nativeName,
    detail: language.greeting,
    keywords: `${language.englishName} ${language.code}`,
    lang: language.code,
    dir: language.dir,
  }));
}

export function regionName(code: RegionCode, language: string): string {
  return displayName(language, "region", code, regionInfo(code).name);
}

export function regionOptions(language: string): PickerOption[] {
  return REGIONS.map((region) => ({
    value: region.code,
    label: regionName(region.code, language),
    detail: region.timezone,
    keywords: `${region.name} ${region.code} ${region.currency}`,
  }));
}

export function currencyName(code: string, language: string): string {
  return displayName(language, "currency", code, currencyInfo(code).name);
}

/** "INR — Indian Rupee", the way the mockup writes it. */
export function currencyLabel(code: string, language: string): string {
  return `${code} — ${currencyName(code, language)}`;
}

export function currencyOptions(language: string, current?: string | null): PickerOption[] {
  const codes: string[] = CURRENCIES.map((currency) => currency.code);
  if (current && !codes.includes(current)) codes.push(current);
  return codes.map((code) => ({
    value: code,
    label: code,
    detail: currencyName(code, language),
    keywords: `${currencyInfo(code as CurrencyCode).name} ${code}`,
  }));
}

export function languageLabel(code: LanguageCode): string {
  return languageInfo(code).nativeName;
}

export { describeTimezone };
