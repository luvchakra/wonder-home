import { DEFAULT_LANGUAGE, isLanguage, type LanguageCode } from "./locales";
import { en, type Catalog, type MessageKey } from "./messages/en";

/**
 * Turning a key into words (story 22-004, spec §27–§28).
 *
 * Only the catalog asked for is loaded — each language is its own module —
 * and every language is complete by construction (`Catalog` is every English
 * key). The fallback chain is still here for the day a catalog is shipped
 * partial: the requested language, then English, then an empty string. A
 * person never sees a key, `undefined` or `null`.
 *
 * Standard labels come only from here. No model is asked to translate a
 * button.
 */

type PluralBase<K> = K extends `${infer Base}#other` ? Base : never;
export type TranslationKey = Exclude<MessageKey, `${string}#${string}`> | PluralBase<MessageKey>;
export type TranslationParams = Record<string, string | number>;
export type Translate = (key: TranslationKey, params?: TranslationParams) => string;

const LOADERS: Record<LanguageCode, () => Promise<Catalog>> = {
  en: async () => en,
  hi: async () => (await import("./messages/hi")).hi,
  mr: async () => (await import("./messages/mr")).mr,
  es: async () => (await import("./messages/es")).es,
  fr: async () => (await import("./messages/fr")).fr,
  de: async () => (await import("./messages/de")).de,
  ar: async () => (await import("./messages/ar")).ar,
};

const loaded = new Map<LanguageCode, Catalog>([["en", en]]);

/** The catalog for a language, loaded once per server process and then cached. */
export async function loadCatalog(language: string): Promise<Catalog> {
  const code: LanguageCode = isLanguage(language) ? language : DEFAULT_LANGUAGE;
  const cached = loaded.get(code);
  if (cached) return cached;
  try {
    const catalog = await LOADERS[code]();
    loaded.set(code, catalog);
    return catalog;
  } catch {
    return en;
  }
}

/** A translator over one catalog, falling back to English key by key. */
export function translator(language: string, catalog: Catalog): Translate {
  const plurals = (() => {
    try {
      return new Intl.PluralRules(language);
    } catch {
      return new Intl.PluralRules(DEFAULT_LANGUAGE);
    }
  })();

  const lookup = (key: string): string | undefined => {
    const table = catalog as Record<string, string | undefined>;
    const fallback = en as Record<string, string | undefined>;
    return table[key] ?? fallback[key];
  };

  return (key, params) => {
    let template: string | undefined;
    if (params && typeof params.count === "number") {
      const category = plurals.select(params.count);
      template = lookup(`${key}#${category}`) ?? lookup(`${key}#other`);
    }
    template ??= lookup(key) ?? lookup(`${key}#other`) ?? "";
    return interpolate(template, params);
  };
}

/** `{name}` → its value. An unknown placeholder is dropped, never shown with its braces. */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!template.includes("{")) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** Convenience for places that have a language and want a translator in one step. */
export async function translatorFor(language: string): Promise<Translate> {
  const code = isLanguage(language) ? language : DEFAULT_LANGUAGE;
  return translator(code, await loadCatalog(code));
}
