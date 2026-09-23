/**
 * The words facts are written in — dates in the household's own zone, keys
 * as phrases, money in its major unit. Shared by the context engine and the
 * HomeBrain so a fact reads the same wherever it is built.
 */

/** "school.run" → "School run"; "meals.dinner" → "Meals dinner". */
export function humanKey(key: string): string {
  const words = key.replace(/[._]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isoDateIn(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function formatDate(date: Date, timezone: string): string {
  try {
    // Assembled from parts: "en-GB" spells September "Sept" on some ICU
    // builds and "Sep" on others, and a fact must read the same everywhere.
    const parts = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: timezone }).formatToParts(date);
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
    return `${part("weekday")} ${part("day")} ${part("month")}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone }).format(date).replace(/\s?(am|pm)/i, (m) => m.trim());
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/** "Sat 20 Sep, 6:40pm" for the model's briefing, in the household's own zone. */
export function describeLocalNow(now: Date, timezone: string): string {
  return `${formatDate(now, timezone)}, ${formatTime(now, timezone)}`;
}

/** Money is decimal (CLAUDE.md rule 22): minor units only ever arrive here, and leave in the major unit. */
export function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(0)}`;
  }
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "school_event" → "school event". */
export function words(value: string): string {
  return value.replace(/_/g, " ");
}

export function describeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.statement === "string") return `${record.statement}${typeof record.time === "string" ? ` (${record.time})` : ""}`;
    return Object.entries(record)
      .filter(([, entry]) => entry !== null && entry !== undefined && typeof entry !== "object")
      .map(([entryKey, entry]) => `${entryKey} ${String(entry)}`)
      .join(", ");
  }
  return String(value);
}
