import { cache } from "react";

import { formatterFor, type Formatter } from "./format";
import { en } from "./messages/en";
import { DEFAULT_PREFERENCES, type LocalePreferences } from "./preferences";
import { translator, type Translate } from "./translate";

/**
 * The locale of the request being rendered (story 22-001).
 *
 * Set once, where the session is built, and read by the shared formatting
 * helpers — so every existing call to "format this date" or "format this
 * amount" follows the person's preferences without each of the dozens of
 * call sites being told. React's `cache` scopes it to one server request;
 * anywhere outside one (a test, a job, a webhook) it is WonderHome's
 * defaults, which is exactly what those places produced before.
 */
type RequestLocale = { preferences: LocalePreferences; t: Translate; format: Formatter };

const current = cache((): RequestLocale => ({
  preferences: DEFAULT_PREFERENCES,
  t: translator("en", en),
  format: formatterFor(DEFAULT_PREFERENCES),
}));

export function setRequestLocale(preferences: LocalePreferences, t: Translate): void {
  const store = current();
  store.preferences = preferences;
  store.t = t;
  store.format = formatterFor(preferences);
}

export function requestPreferences(): LocalePreferences {
  return current().preferences;
}

export function requestT(): Translate {
  return current().t;
}

export function requestFormat(): Formatter {
  return current().format;
}

/** The request's formatter, for a different zone — a record that belongs to one. */
export function requestFormatIn(timezone: string): Formatter {
  const store = current();
  return timezone === store.preferences.timezone ? store.format : formatterFor({ ...store.preferences, timezone });
}
