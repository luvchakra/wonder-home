import { DEFAULT_LANGUAGE, isLanguage, type LanguageCode } from "./locales";

/**
 * Which language to greet somebody in before we know who they are (story
 * 22-004): the signed-out screens — sign in, sign up, a reset link — and the
 * moment between creating an account and joining a household, when there is
 * no member row to hold a choice yet.
 *
 * It reads only what the browser already sends (`Accept-Language`), keeps no
 * cookie and stores nothing: the person's own choice, once they have a
 * household, always wins over this. The best-weighted tag whose primary
 * language WonderHome speaks is chosen — `zh-SG` is Chinese, `hi-IN` is
 * Hindi — and anything unmatched, malformed or absent is English. A tag with
 * `q=0` is the browser saying "not this one", and is never picked.
 *
 * Portuguese is not Spanish and Urdu is not Hindi: a language we do not have
 * falls through to the next one the person listed, then to English — never
 * to a neighbour.
 */
export function negotiateLanguage(acceptLanguage: string | null | undefined): LanguageCode {
  if (!acceptLanguage) return DEFAULT_LANGUAGE;

  const ranked = acceptLanguage
    .slice(0, 1024)
    .split(",")
    .map((entry, index) => {
      const [tag = "", ...params] = entry.trim().split(";");
      const qParam = params.map((param) => param.trim()).find((param) => /^q=/i.test(param));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { primary: tag.trim().toLowerCase().split("-")[0] ?? "", q: Number.isFinite(q) ? Math.min(Math.max(q, 0), 1) : 0, index };
    })
    .filter((entry) => entry.q > 0 && /^[a-z]{2,3}$/.test(entry.primary))
    // Highest weight first; an equal weight keeps the order the browser listed.
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const entry of ranked) {
    if (isLanguage(entry.primary)) return entry.primary;
  }
  return DEFAULT_LANGUAGE;
}
