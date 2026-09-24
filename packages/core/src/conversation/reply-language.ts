/**
 * A HomeTalk reply in the person's own language (story 22-005).
 *
 * Every reply is composed, checked and validated in English exactly as
 * before — the HomeBrain validator, the executor's own words, the gates.
 * Only then is it put into the person's language, and that step is not
 * trusted either:
 *
 *  1. Everything that carries a fact is taken out first and replaced by a
 *     token ⟦1⟧, ⟦2⟧…: a person's name, a **bold** value (an item, a bill,
 *     a reminder), a date, a time, an amount, any number, and every link
 *     target. The model translating never sees them, so it cannot change,
 *     invent or leak them.
 *  2. What comes back must carry every token exactly once, no digit of its
 *     own, no new link or bold, and a length a translation could have.
 *  3. Only then are the tokens put back. Anything else — no model, a model
 *     that failed, a check that failed — shows the English that was
 *     validated. A person is never shown words nothing checked.
 */

import type { ContentClass, DataUsePolicy } from "../ai/privacy";
import type { IntentAction } from "./intent";

/** Never translated, and never handed to a translator as words (story 22-004). */
const BRAND_NAMES = ["WonderHome", "HomeTalk", "HomeBrain", "HomeSend"] as const;

export type ProtectedText = {
  /** The reply with every protected span replaced by its token. */
  text: string;
  /** What each token stands for, in order: tokens[0] is ⟦1⟧. */
  spans: readonly string[];
};

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*";
const WEEKDAY = "(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)[a-z]*";

/** Protected spans, applied in this order so a longer, more specific span is taken whole first. */
const PATTERNS: readonly RegExp[] = [
  // A link's target: the label is words to translate, where it goes is not.
  /\]\([^)\s]+\)/g,
  // A bold value — an item, a bill, a reminder's words.
  /\*\*[^*\n]+\*\*/g,
  // A date: "Thu 24 Sep", "24 Sep 2026", "September 24".
  new RegExp(`\\b(?:${WEEKDAY},?\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}(?:\\s+\\d{4})?\\b`, "g"),
  new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "g"),
  // A clock time: "9:45pm", "9 am", "21:30".
  /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi,
  /\b\d{1,2}:\d{2}\b/g,
  // An amount: "₹2,430", "$12.50", "2,430 INR".
  /[₹$€£¥]\s?\d[\d,]*(?:\.\d+)?/g,
  /\b\d[\d,]*(?:\.\d+)?\s?(?:INR|USD|EUR|GBP|AED|SGD|CAD|AUD)\b/g,
  // Any other number.
  /\d[\d,.]*/g,
];

/**
 * Takes out everything that carries a fact, leaving only words to translate.
 * One pass over the original text: each kind of span is found in order of
 * precedence (a link, a bold value, a name, then dates, times, amounts and
 * numbers), a span inside one already taken is left to it, and the tokens are
 * numbered in reading order.
 */
export function protectForTranslation(text: string, names: readonly string[]): ProtectedText {
  const taken: { start: number; end: number }[] = [];
  const take = (pattern: RegExp) => {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (match[0].length === 0 || taken.some((span) => start < span.end && end > span.start)) continue;
      taken.push({ start, end });
    }
  };
  // Names longest first, so "Asmi Sharma" is one span, not two.
  const sorted = [...new Set([...names, ...BRAND_NAMES].map((name) => name.trim()).filter((name) => name.length > 1))].sort((a, b) => b.length - a.length);
  for (const pattern of PATTERNS.slice(0, 2)) take(pattern);
  for (const name of sorted) take(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "gu"));
  for (const pattern of PATTERNS.slice(2)) take(pattern);

  taken.sort((a, b) => a.start - b.start);
  const spans: string[] = [];
  let out = "";
  let at = 0;
  for (const span of taken) {
    out += text.slice(at, span.start);
    spans.push(text.slice(span.start, span.end));
    out += `⟦${spans.length}⟧`;
    at = span.end;
  }
  out += text.slice(at);
  return { text: out, spans };
}

export type TranslationFailure = "missing_token" | "extra_token" | "invented_digit" | "invented_markup" | "implausible_length" | "empty";

export type TranslationCheck = { ok: true; text: string } | { ok: false; reason: TranslationFailure };

/**
 * Whether a translation of `source` can be shown, and if so the finished
 * text with every protected span put back exactly as it was.
 */
export function checkTranslation(source: ProtectedText, translated: string | null | undefined): TranslationCheck {
  const text = (translated ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };
  for (let index = 1; index <= source.spans.length; index += 1) {
    const count = text.split(`⟦${index}⟧`).length - 1;
    if (count === 0) return { ok: false, reason: "missing_token" };
    if (count > 1) return { ok: false, reason: "extra_token" };
  }
  const found = text.match(/⟦(\d+)⟧/g) ?? [];
  if (found.some((match) => Number(match.slice(1, -1)) > source.spans.length || Number(match.slice(1, -1)) < 1)) return { ok: false, reason: "extra_token" };

  const words = text.replace(/⟦\d+⟧/g, "");
  // A number of its own is a fact nothing checked.
  if (/\p{Nd}/u.test(words)) return { ok: false, reason: "invented_digit" };
  // So is a new link, a new bold value or a raw address.
  if (/\]\(|\*\*|https?:\/\//.test(words)) return { ok: false, reason: "invented_markup" };

  const sourceWords = source.text.replace(/⟦\d+⟧/g, "").replace(/\s+/g, "").length;
  const translatedWords = words.replace(/\s+/g, "").length;
  if (sourceWords >= 20 && (translatedWords < sourceWords * 0.3 || translatedWords > sourceWords * 4)) return { ok: false, reason: "implausible_length" };

  const restored = text.replace(/⟦(\d+)⟧/g, (_, index: string) => source.spans[Number(index) - 1]!);
  return { ok: true, text: restored };
}

/** Puts one protected reply into another language: the model's part, behind a seam. */
export type ReplyTranslator = (input: { text: string; language: string }) => Promise<string | null>;

/** Why the validated English was shown instead, in closed words. */
export type TranslationFallback = "no_model" | "model_failed" | "not_permitted" | TranslationFailure;

export type LocalizedReply = {
  text: string;
  /** True only when the shown text is a checked translation. */
  localized: boolean;
  fallback?: TranslationFallback;
};

/**
 * The reply as this person should see it. English is returned untouched;
 * any other language goes through protect → translate → check, and falls
 * back to the validated English on anything short of a clean check.
 */
export async function localizeReply(
  text: string,
  options: { language: string; names: readonly string[]; translate: ReplyTranslator | null },
): Promise<LocalizedReply> {
  if (options.language === "en" || !text.trim()) return { text, localized: false };
  if (!options.translate) return { text, localized: false, fallback: "no_model" };
  const source = protectForTranslation(text, options.names);
  let translated: string | null = null;
  try {
    translated = await options.translate({ text: source.text, language: options.language });
  } catch {
    translated = null;
  }
  if (translated === null) return { text, localized: false, fallback: "model_failed" };
  const checked = checkTranslation(source, translated);
  return checked.ok ? { text: checked.text, localized: true } : { text, localized: false, fallback: checked.reason };
}

/** The line, in the person's language, that says why a reply is in English. */
export function englishNoticeKey(fallback: string | null | undefined): "hometalk.english.notPermitted" | "hometalk.english.noModel" | "hometalk.english.unchecked" {
  if (fallback === "not_permitted") return "hometalk.english.notPermitted";
  if (fallback === "no_model" || fallback === "model_failed") return "hometalk.english.noModel";
  return "hometalk.english.unchecked";
}

/**
 * Whether a reply may go to the household's model provider to be
 * translated (story 22-005): the same consent that lets anything leave. The
 * words that go are the reply with every name, item, date, time, amount and
 * number taken out, but what is left can still be about a child, a health
 * matter or money — so every class the reply carries must be one the
 * household agreed may be sent. Anything else stays in English.
 */
export function mayTranslate(policy: Pick<DataUsePolicy, "allowProviderContent" | "allowedClasses">, carried: Iterable<ContentClass>): boolean {
  if (!policy.allowProviderContent) return false;
  for (const contentClass of carried) {
    if (contentClass === "credential" || !policy.allowedClasses.includes(contentClass)) return false;
  }
  return true;
}

/** Every class a reply could carry beyond ordinary household operations: what a reply of unknown content is assumed to be about. */
export const EVERY_SENSITIVE_CLASS: readonly ContentClass[] = ["child", "health", "financial", "location", "private_message"];

/**
 * What a reply about each HomeTalk action is about, beyond ordinary household
 * operations (story 22-005). Every action is placed here exactly once, so a
 * new one forces a decision about what its reply may carry.
 */
export const REPLY_CLASSES: Readonly<Record<IntentAction, readonly ContentClass[]>> = {
  record_absence: ["location"],
  add_to_list: [],
  // The HomeBrain answer adds the classes of the facts it rests on.
  ask_status: [],
  // A run reads every part of the home.
  check_agents: EVERY_SENSITIVE_CLASS,
  plan_event: [],
  plan_meal: [],
  set_reminder: [],
  remove_from_list: [],
  complete_school_item: ["child"],
  raise_service_request: [],
  adjust_schedule: [],
  set_preference: [],
  make_payment: ["financial"],
  order_items: ["financial"],
  assign_responsibility: [],
  record_health_appointment: ["health"],
  log_health_issue: ["health"],
  resolve_health_issue: ["health"],
  log_vital: ["health"],
  set_fitness_goal: ["health"],
  greet: [],
  unknown: [],
};

export function replyClassesFor(action: string): readonly ContentClass[] {
  return (REPLY_CLASSES as Record<string, readonly ContentClass[] | undefined>)[action] ?? EVERY_SENSITIVE_CLASS;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
