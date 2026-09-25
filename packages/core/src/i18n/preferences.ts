import {
  DATE_FORMATS,
  DEFAULT_LANGUAGE,
  DEFAULT_REGION,
  isCurrency,
  isLanguage,
  isRegion,
  isTimezone,
  languageInfo,
  MEASUREMENT_SYSTEMS,
  regionInfo,
  TIME_FORMATS,
  type DateFormat,
  type LanguageCode,
  type MeasurementSystem,
  type RegionCode,
  type TimeFormat,
} from "./locales";

/**
 * Whose choice wins (story 22-001, spec §2.2):
 *
 *   the person's own explicit choice
 *     → the household's setting
 *       → what the household's region suggests
 *         → WonderHome's defaults
 *
 * Nothing here — no model, no region change — ever overwrites an explicit
 * choice. A region *suggests*; only a person *decides*.
 */

/** What a household has set for everyone. Null is "not decided yet", never "empty". */
export type HouseholdLocaleSettings = {
  region: RegionCode | null;
  currency: string | null;
  /** The household's zone — already required, since routines and reminders run on it. */
  timezone: string;
  measurement: MeasurementSystem | null;
  language: LanguageCode | null;
};

/** What one person has chosen for themselves. Each field is its own decision. */
export type MemberLocaleChoices = {
  language: LanguageCode | null;
  dateFormat: DateFormat | null;
  timeFormat: TimeFormat | null;
  measurement: MeasurementSystem | null;
};

export type LocalePreferences = {
  language: LanguageCode;
  region: RegionCode;
  /** The household's default for new money — each record keeps its own currency. */
  currency: string;
  timezone: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  measurement: MeasurementSystem;
  dir: "ltr" | "rtl";
};

export const NO_MEMBER_CHOICES: MemberLocaleChoices = { language: null, dateFormat: null, timeFormat: null, measurement: null };

export const DEFAULT_PREFERENCES: LocalePreferences = resolvePreferences(NO_MEMBER_CHOICES, {
  region: null,
  currency: null,
  timezone: "Asia/Kolkata",
  measurement: null,
  language: null,
});

export function resolvePreferences(member: MemberLocaleChoices, household: HouseholdLocaleSettings): LocalePreferences {
  const region = regionInfo(household.region ?? DEFAULT_REGION);
  const language = member.language ?? household.language ?? DEFAULT_LANGUAGE;
  return {
    language,
    region: region.code,
    currency: household.currency ?? region.currency,
    timezone: isTimezone(household.timezone) ? household.timezone : region.timezone,
    dateFormat: member.dateFormat ?? region.dateFormat,
    timeFormat: member.timeFormat ?? region.timeFormat,
    measurement: member.measurement ?? household.measurement ?? region.measurement,
    dir: languageInfo(language).dir,
  };
}

/** The BCP 47 tag the platform's Intl formatting runs on: the person's language, the household's region. */
export function intlLocale(preferences: Pick<LocalePreferences, "language" | "region">): string {
  // Chinese names its script, so a household in India or the US still reads Simplified characters.
  if (preferences.language === "zh") return `zh-Hans-${preferences.region}`;
  return `${preferences.language}-${preferences.region}`;
}

/**
 * What changing region would suggest, for the fields that are still only
 * defaults. An explicit currency, zone or measurement is never in here: the
 * screen offers these, it does not apply them (spec §34).
 */
export function regionSuggestions(
  next: RegionCode,
  current: Pick<HouseholdLocaleSettings, "currency" | "timezone" | "measurement">,
): { currency?: string; timezone?: string; measurement?: MeasurementSystem } {
  const region = regionInfo(next);
  const suggestions: { currency?: string; timezone?: string; measurement?: MeasurementSystem } = {};
  if (current.currency !== region.currency) suggestions.currency = region.currency;
  if (current.timezone !== region.timezone) suggestions.timezone = region.timezone;
  if (current.measurement !== region.measurement) suggestions.measurement = region.measurement;
  return suggestions;
}

/** Reads stored values defensively: anything unrecognised is "not chosen", never an error or a guess. */
export function parseMemberChoices(row: { language?: unknown; date_format?: unknown; time_format?: unknown; measurement_system?: unknown }): MemberLocaleChoices {
  return {
    language: isLanguage(row.language) ? row.language : null,
    dateFormat: (DATE_FORMATS as readonly unknown[]).includes(row.date_format) ? (row.date_format as DateFormat) : null,
    timeFormat: (TIME_FORMATS as readonly unknown[]).includes(row.time_format) ? (row.time_format as TimeFormat) : null,
    measurement: (MEASUREMENT_SYSTEMS as readonly unknown[]).includes(row.measurement_system) ? (row.measurement_system as MeasurementSystem) : null,
  };
}

export function parseHouseholdSettings(row: { region?: unknown; currency?: unknown; timezone?: unknown; measurement_system?: unknown; language?: unknown }): HouseholdLocaleSettings {
  return {
    region: isRegion(row.region) ? row.region : null,
    currency: isCurrency(row.currency) ? row.currency : null,
    timezone: typeof row.timezone === "string" ? row.timezone : "Asia/Kolkata",
    measurement: (MEASUREMENT_SYSTEMS as readonly unknown[]).includes(row.measurement_system) ? (row.measurement_system as MeasurementSystem) : null,
    language: isLanguage(row.language) ? row.language : null,
  };
}

export const LOCALE_SETUP_STEPS = ["intro", "language", "region", "currency", "datetime", "review"] as const;
export type LocaleSetupStep = (typeof LOCALE_SETUP_STEPS)[number];
export type LocaleSetupStatus = "in_progress" | "skipped" | "completed";
/** Bumped when the setup asks something new; a person who finished an older version is offered only what is new. */
export const LOCALE_SETUP_VERSION = 1;

export type LocaleSetup = {
  /** Null: never offered. */
  status: LocaleSetupStatus | null;
  step: LocaleSetupStep | null;
  promptDismissedAt: string | null;
};

export type MembershipLocale = {
  household: HouseholdLocaleSettings;
  member: MemberLocaleChoices;
  setup: LocaleSetup;
};

export function parseLocaleSetup(row: { locale_setup_status?: unknown; locale_setup_step?: unknown; locale_prompt_dismissed_at?: unknown }): LocaleSetup {
  const status = row.locale_setup_status;
  return {
    status: status === "in_progress" || status === "skipped" || status === "completed" ? status : null,
    step: (LOCALE_SETUP_STEPS as readonly unknown[]).includes(row.locale_setup_step) ? (row.locale_setup_step as LocaleSetupStep) : null,
    promptDismissedAt: typeof row.locale_prompt_dismissed_at === "string" ? row.locale_prompt_dismissed_at : null,
  };
}

/** The resolved preferences for a membership — defaults when nothing was loaded. */
export function preferencesOf(locale: MembershipLocale | undefined, fallbackTimezone = "Asia/Kolkata"): LocalePreferences {
  if (!locale) return { ...DEFAULT_PREFERENCES, timezone: isTimezone(fallbackTimezone) ? fallbackTimezone : DEFAULT_PREFERENCES.timezone };
  return resolvePreferences(locale.member, locale.household);
}

/**
 * The steps this person is asked, in order. Region, currency and time zone
 * are the household's, so only an Admin is asked them; everyone else sees
 * what the household uses on the review and is never asked to decide it.
 */
export function localeSetupSteps(isAdmin: boolean): LocaleSetupStep[] {
  return isAdmin ? ["intro", "language", "region", "currency", "datetime", "review"] : ["intro", "language", "datetime", "review"];
}

export function nextLocaleStep(step: LocaleSetupStep, isAdmin: boolean): LocaleSetupStep | "done" {
  const steps = localeSetupSteps(isAdmin);
  const index = steps.indexOf(step);
  return index < 0 ? steps[0]! : (steps[index + 1] ?? "done");
}

export function previousLocaleStep(step: LocaleSetupStep, isAdmin: boolean): LocaleSetupStep | null {
  const steps = localeSetupSteps(isAdmin);
  const index = steps.indexOf(step);
  return index > 0 ? steps[index - 1]! : null;
}

/** Whether Home should offer the setup: never after it is finished or put away, and never twice. */
export function shouldOfferLocaleSetup(setup: LocaleSetup | undefined): boolean {
  if (!setup) return false;
  if (setup.promptDismissedAt) return false;
  return setup.status === null || setup.status === "in_progress" || setup.status === "skipped";
}

