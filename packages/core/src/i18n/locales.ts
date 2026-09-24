/**
 * The languages, regions, currencies and conventions WonderHome can present
 * itself in (story 22-001).
 *
 * Five separate things, never folded into one setting:
 *   language            → which words (`en`, `hi`, `mr`, …)
 *   region              → which conventions and suggestions (`IN`, `US`, …)
 *   currency            → which unit money is in (`INR`, `USD`, …)
 *   time zone           → when things happen (`Asia/Kolkata`)
 *   measurement system  → metric or imperial
 *
 * A language is never identified by a flag: a flag is a country, and Hindi is
 * not India any more than English is England. Every language is shown in its
 * own name. Adding a language or a region is adding a row here (and, for a
 * language, a message catalog) — no application logic changes.
 */

export const LANGUAGE_CODES = ["en", "hi", "mr", "es", "fr", "de", "ar"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];
export const DEFAULT_LANGUAGE: LanguageCode = "en";

export type LanguageInfo = {
  code: LanguageCode;
  /** The language in its own words — what a speaker looks for. */
  nativeName: string;
  englishName: string;
  /** A short greeting in the language, so the row reads as itself. */
  greeting: string;
  dir: "ltr" | "rtl";
};

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: "en", nativeName: "English", englishName: "English", greeting: "Hello, welcome", dir: "ltr" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", greeting: "नमस्ते, स्वागत है", dir: "ltr" },
  { code: "mr", nativeName: "मराठी", englishName: "Marathi", greeting: "नमस्कार, स्वागत आहे", dir: "ltr" },
  { code: "es", nativeName: "Español", englishName: "Spanish", greeting: "Hola, bienvenido", dir: "ltr" },
  { code: "fr", nativeName: "Français", englishName: "French", greeting: "Bonjour, bienvenue", dir: "ltr" },
  { code: "de", nativeName: "Deutsch", englishName: "German", greeting: "Hallo, willkommen", dir: "ltr" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", greeting: "مرحبا، أهلا بك", dir: "rtl" },
];

export function isLanguage(value: unknown): value is LanguageCode {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export function languageInfo(code: LanguageCode): LanguageInfo {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0]!;
}

export const MEASUREMENT_SYSTEMS = ["metric", "imperial"] as const;
export type MeasurementSystem = (typeof MEASUREMENT_SYSTEMS)[number];

/** How a numeric date is written. Long dates always follow the language's own conventions. */
export const DATE_FORMATS = ["dmy", "mdy", "ymd"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const TIME_FORMATS = ["12h", "24h"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export const CURRENCY_CODES = ["INR", "USD", "EUR", "GBP", "CAD", "AUD", "SGD", "AED"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export type CurrencyInfo = { code: CurrencyCode; name: string };

export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: "INR", name: "Indian Rupee" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "AED", name: "UAE Dirham" },
];

export function isCurrency(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCY_CODES as readonly string[]).includes(value);
}

export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCIES.find((currency) => currency.code === code) ?? { code: code as CurrencyCode, name: code };
}

export const REGION_CODES = ["IN", "US", "GB", "CA", "AU", "SG", "AE", "DE", "FR", "ES"] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export type RegionInfo = {
  code: RegionCode;
  name: string;
  /** The zone a household here most likely lives in — a suggestion, never a decision. */
  timezone: string;
  currency: CurrencyCode;
  measurement: MeasurementSystem;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
};

export const REGIONS: readonly RegionInfo[] = [
  { code: "IN", name: "India", timezone: "Asia/Kolkata", currency: "INR", measurement: "metric", dateFormat: "dmy", timeFormat: "12h" },
  { code: "US", name: "United States", timezone: "America/New_York", currency: "USD", measurement: "imperial", dateFormat: "mdy", timeFormat: "12h" },
  { code: "GB", name: "United Kingdom", timezone: "Europe/London", currency: "GBP", measurement: "metric", dateFormat: "dmy", timeFormat: "24h" },
  { code: "CA", name: "Canada", timezone: "America/Toronto", currency: "CAD", measurement: "metric", dateFormat: "ymd", timeFormat: "12h" },
  { code: "AU", name: "Australia", timezone: "Australia/Sydney", currency: "AUD", measurement: "metric", dateFormat: "dmy", timeFormat: "12h" },
  { code: "SG", name: "Singapore", timezone: "Asia/Singapore", currency: "SGD", measurement: "metric", dateFormat: "dmy", timeFormat: "12h" },
  { code: "AE", name: "United Arab Emirates", timezone: "Asia/Dubai", currency: "AED", measurement: "metric", dateFormat: "dmy", timeFormat: "12h" },
  { code: "DE", name: "Germany", timezone: "Europe/Berlin", currency: "EUR", measurement: "metric", dateFormat: "dmy", timeFormat: "24h" },
  { code: "FR", name: "France", timezone: "Europe/Paris", currency: "EUR", measurement: "metric", dateFormat: "dmy", timeFormat: "24h" },
  { code: "ES", name: "Spain", timezone: "Europe/Madrid", currency: "EUR", measurement: "metric", dateFormat: "dmy", timeFormat: "24h" },
];

export const DEFAULT_REGION: RegionCode = "IN";

export function isRegion(value: unknown): value is RegionCode {
  return typeof value === "string" && (REGION_CODES as readonly string[]).includes(value);
}

export function regionInfo(code: RegionCode): RegionInfo {
  return REGIONS.find((region) => region.code === code) ?? REGIONS[0]!;
}

/** Time zones offered in the picker: every region's own, plus common others. Any valid IANA zone is still accepted. */
export const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
] as const;

/** A real IANA zone — never a bare UTC offset, which cannot know about daylight saving. */
export function isTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** "(GMT+05:30) Asia/Kolkata" — the offset right now, for reading, never for storing. */
export function describeTimezone(zone: string, now = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((entry) => entry.type === "timeZoneName")?.value;
    const offset = !part || part === "GMT" ? "GMT+00:00" : part;
    return `(${offset}) ${zone}`;
  } catch {
    return zone;
  }
}
