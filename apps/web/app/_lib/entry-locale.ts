import { headers } from "next/headers";

import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { languageInfo, type LanguageCode } from "@wonderhome/core/i18n/locales";
import { negotiateLanguage } from "@wonderhome/core/i18n/negotiate";
import { DEFAULT_PREFERENCES, preferencesOf, type LocalePreferences } from "@wonderhome/core/i18n/preferences";
import { setRequestLocale } from "@wonderhome/core/i18n/request";
import { translatorFor, type Translate } from "@wonderhome/core/i18n/translate";

/**
 * The language of the way in (story 22-004): the screens a person reaches
 * before — or just after — they have a household to hold their choice.
 *
 * A member's own language wins wherever there is a member row (the voice
 * consent screen, an invitation opened by somebody already in a household).
 * Before that — signed out, or signed up but not yet in a household — the
 * browser's `Accept-Language` decides, through `negotiateLanguage`, and
 * nothing is stored: English is the answer to anything it cannot match.
 */
export type EntryLocale = { language: LanguageCode; dir: "ltr" | "rtl"; t: Translate };

/** A visitor: whatever language their browser asks for, when WonderHome speaks it. */
export async function visitorLocale(): Promise<EntryLocale> {
  const language = negotiateLanguage((await headers()).get("accept-language"));
  return applyPreferences({ ...DEFAULT_PREFERENCES, language, dir: languageInfo(language).dir });
}

/** Somebody already in a household: their own language, as on every signed-in screen. */
export async function memberLocale(membership: HouseholdMembership): Promise<EntryLocale> {
  return applyPreferences(preferencesOf(membership.locale, membership.household.timezone));
}

async function applyPreferences(preferences: LocalePreferences): Promise<EntryLocale> {
  const t = await translatorFor(preferences.language);
  setRequestLocale(preferences, t);
  return { language: preferences.language, dir: preferences.dir, t };
}

/**
 * A translated sentence with one link inside it, split around the link so
 * the link can be a real element wherever the language puts it.
 */
export function aroundLink(t: Translate, key: Parameters<Translate>[0]): [before: string, after: string] {
  const [before = "", after = ""] = t(key, { link: "\u0000" }).split("\u0000");
  return [before, after];
}
