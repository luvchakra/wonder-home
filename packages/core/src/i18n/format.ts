import { intlLocale, type LocalePreferences } from "./preferences";

/**
 * The one place WonderHome turns a date, a number, an amount or a
 * measurement into text (story 22-001, spec §29–§31). Every regional
 * convention comes from the platform's own Intl data for the person's
 * language and the household's region — nothing here hand-builds a comma, a
 * currency symbol or a month name. Digits stay Latin in every language so an
 * amount reads the same on a bill as on the screen.
 *
 * Storage stays canonical: amounts in major units with their currency code,
 * timestamps in UTC, measurements in metric. Only presentation converts.
 */

export type Formatter = ReturnType<typeof formatterFor>;

type DateInput = Date | string;

function toDate(value: DateInput): Date {
  if (value instanceof Date) return value;
  // A bare calendar date is a day, not an instant: read it at midday UTC so
  // no zone moves it to the day before or after.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

export function formatterFor(preferences: LocalePreferences) {
  const locale = `${intlLocale(preferences)}-u-nu-latn`;
  const zone = preferences.timezone;
  const hour12 = preferences.timeFormat === "12h";

  const safe = <T,>(build: () => T, fallback: () => T): T => {
    try {
      return build();
    } catch {
      return fallback();
    }
  };

  function numericDate(value: DateInput, dateOnly = false): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: dateOnly ? "UTC" : zone,
    }).formatToParts(toDate(value));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const [day, month, year] = [get("day"), get("month"), get("year")];
    if (preferences.dateFormat === "mdy") return `${month}/${day}/${year}`;
    if (preferences.dateFormat === "ymd") return `${year}-${month}-${day}`;
    return `${day}/${month}/${year}`;
  }

  return {
    locale,
    language: preferences.language,
    dir: preferences.dir,
    timezone: zone,

    /** "23/09/2026", "09/23/2026" or "2026-09-23", as the person chose. */
    numericDate: (value: DateInput) => safe(() => numericDate(value, typeof value === "string" && value.length === 10), () => String(value)),

    /**
     * A date in words, in the person's language: "24 Sept" (short),
     * "Thu, 24 Sept" (long), "24 Sept 2026" (full). A bare `YYYY-MM-DD` is a
     * calendar day and never shifted by the zone.
     */
    date: (value: DateInput, style: "short" | "long" | "full" = "short") =>
      safe(
        () =>
          new Intl.DateTimeFormat(locale, {
            weekday: style === "long" ? "short" : undefined,
            day: "numeric",
            month: "short",
            year: style === "full" ? "numeric" : undefined,
            timeZone: typeof value === "string" && value.length === 10 ? "UTC" : zone,
          }).format(toDate(value)),
        () => numericDate(value),
      ),

    /** Today's date for a header: weekday, day, month, year. */
    today: (now = new Date()) =>
      safe(
        () => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: zone }).format(now),
        () => numericDate(now),
      ),

    /** "3:30 pm" or "15:30", as the person chose. */
    time: (value: DateInput) =>
      safe(
        () => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12, timeZone: zone }).format(toDate(value)),
        () => toDate(value).toISOString().slice(11, 16),
      ),

    /** The hour (0–23) in the household's zone — for greetings and quiet hours, never for display. */
    hourOf: (value: Date) =>
      safe(() => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: zone }).format(value)) % 24, () => value.getUTCHours()),

    number: (value: number, maximumFractionDigits = 2) =>
      safe(() => new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value), () => String(value)),

    /**
     * An amount in its own currency — always the record's currency, never
     * converted. Major units in, major units out (CLAUDE.md rule 22): 4250.5
     * INR reads "₹4,250.50", 1250 reads "₹1,250".
     */
    money: (amount: number, currency: string = preferences.currency) => {
      const whole = Number.isInteger(amount);
      return safe(
        () =>
          new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            minimumFractionDigits: whole ? 0 : 2,
            maximumFractionDigits: 2,
          }).format(amount),
        () => `${currency} ${amount.toFixed(whole ? 0 : 2)}`,
      );
    },

    /** The symbol a currency is written with here, for a field's prefix: "₹", "$", "AED". */
    currencySymbol: (currency: string = preferences.currency) =>
      safe(
        () => new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency,
        () => currency,
      ),

    /** A temperature stored in °C, shown in the person's system. */
    temperature: (celsius: number) =>
      preferences.measurement === "imperial"
        ? `${safe(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(celsius * 1.8 + 32), () => String(Math.round(celsius * 1.8 + 32)))}°F`
        : `${safe(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(celsius), () => String(celsius))}°C`,

    /** A weight stored in kg. */
    weight: (kg: number) =>
      preferences.measurement === "imperial"
        ? unit(locale, kg * 2.20462, "pound", 1)
        : unit(locale, kg, "kilogram", 1),

    /** A distance stored in km. */
    distance: (km: number) =>
      preferences.measurement === "imperial" ? unit(locale, km * 0.621371, "mile", 1) : unit(locale, km, "kilometer", 1),

    /** A volume stored in litres. */
    volume: (litres: number) =>
      preferences.measurement === "imperial" ? unit(locale, litres * 0.264172, "gallon", 2) : unit(locale, litres, "liter", 2),
  };
}

function unit(locale: string, value: number, name: string, digits: number): string {
  try {
    return new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "short", maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${name}`;
  }
}
