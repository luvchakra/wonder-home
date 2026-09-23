/**
 * Post-generation validation (Wave 2 §7).
 *
 * A model told "the facts are the whole world" usually keeps to them. This
 * file is what makes "usually" irrelevant: every draft is checked, before a
 * person sees it, against exactly the facts that were sent — the same
 * pseudonymised text, so "Child A" in the answer is checked against "Child A"
 * in the facts and no real name is involved on either side.
 *
 * What it looks for is what an invented answer is made of:
 *
 *  - a person, place or thing named nowhere in the facts or the question;
 *  - a date, a weekday, a clock time or an amount that no fact carries;
 *  - an event ("a party on Friday") the facts never mention;
 *  - a diagnosis, a dose or a treatment — HomeBrain manages a household's
 *    records, it does not practise medicine (§13);
 *  - a connected service ("synced with your Google Calendar") that is not on
 *    record as connected;
 *  - a claim to have done something. An answer is composed with no execution
 *    result behind it, so "I've added it" is never true here (§11).
 *
 * It is deliberately strict: a false alarm costs one regeneration or a plainer
 * deterministic answer; a missed invention costs the household's trust.
 * Nothing here decides what is true — it only decides what is *supported*.
 */

export type ViolationKind =
  | "unsupported_name"
  | "unsupported_date"
  | "unsupported_time"
  | "unsupported_amount"
  | "unsupported_event"
  | "unsupported_health_claim"
  | "unsupported_integration"
  | "unsupported_action"
  /** An answer to a question about one part of the home that cites nothing from that part (`turn.ts`). */
  | "unfounded_answer"
  | "unknown_fact";

export type Violation = { kind: ViolationKind; value: string };

export type AnswerDraft = {
  text: string;
  /** Fact ids the model says it used ("F2"). */
  usedFacts: readonly string[];
};

export type ValidationContext = {
  /** Exactly what was sent: id and pseudonymised text. */
  facts: readonly { id: string; text: string }[];
  /** The question as sent (pseudonymised). */
  question: string;
  /** Earlier turns as sent. */
  history?: readonly string[];
  /** "Wed 23 Sep, 11:30am" — the briefing line the model was given. */
  localNow: string;
  /** Today in the household's zone, YYYY-MM-DD, so "tomorrow is Thursday" can be checked. */
  today: string;
};

export type ValidationResult = { ok: boolean; violations: Violation[] };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const MONTH_WORD = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

/** Capitalised words that are not a claim about anyone: the product's own names, calendar words, courtesy words. */
const ALLOWED_CAPITALS = new Set([
  "wonderhome", "hometalk", "homebrain", "homesend", "i", "i'm", "i've", "i'd", "i'll", "ok", "okay", "yes", "no", "hi", "hello", "thanks",
  "today", "tomorrow", "tonight", "yesterday", "morning", "afternoon", "evening", "weekend", "am", "pm",
  ...WEEKDAYS, ...WEEKDAYS.map((day) => day.slice(0, 3)),
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  ...MONTHS, "sept",
  "adult", "child", "helper", "mr", "mrs", "ms", "dr",
  // The app's own screens, which an answer may point to.
  "home", "family", "more", "groceries", "meals", "bills", "finance", "school", "kids", "health", "househelper", "responsibilities",
  "review", "upkeep", "notifications", "household", "settings", "privacy",
]);

/** Distinctive event words: saying one the facts never mention is inventing an event. */
/**
 * Words a sentence commonly opens with. A capitalised first word is only
 * read as a name when it is not one of these and a name-like verb follows
 * ("Priya will…", "Rohan has…").
 */
const SENTENCE_STARTERS = new Set([
  "the", "this", "that", "these", "those", "there", "here", "it", "its", "he", "she", "they", "we", "you", "your", "our", "my", "his", "her", "their",
  "nothing", "everything", "something", "anything", "nobody", "everyone", "someone", "no", "yes", "also", "and", "but", "so", "or", "if", "when", "while",
  "for", "on", "at", "in", "by", "with", "from", "to", "of", "both", "all", "each", "every", "one", "two", "three", "just", "only", "please", "sure",
  "right", "looks", "sounds", "based", "according", "unfortunately", "currently", "none", "not", "a", "an", "what", "which", "who", "how", "why",
  "as", "after", "before", "until", "since", "because", "once", "then", "next", "last", "first", "second", "good", "great", "yes", "okay",
]);
const NAME_FOLLOWERS = new Set(["will", "is", "has", "had", "was", "needs", "wants", "likes", "loves", "prefers", "should", "can", "could", "would", "must", "might", "may", "and", "pays", "cooks", "goes", "gets", "said", "asked", "does", "did"]);

const EVENT_WORDS = [
  "party", "birthday", "tournament", "recital", "concert", "exam", "sports day", "annual day", "picnic", "trip",
  "excursion", "meeting", "wedding", "ceremony", "competition", "exhibition", "performance", "ptm", "parent-teacher",
];

/** A diagnosis, a dose or a treatment. Supported only if a record says exactly that. */
const HEALTH_CLAIMS: readonly RegExp[] = [
  /\bdiagnos\w*/gi,
  /\b(?:probably|likely|might|may|could) (?:have|be suffering from|be coming down with) (?:a |an )?(?:[a-z]+ )?(?:infection|flu|virus|fever|migraine|allergy|condition|disease|deficiency|disorder|cold|cough|covid|asthma|diabetes|anaemia|anemia)\b/gi,
  /\b(?:sounds|looks|seems) like (?:a |an )?(?:[a-z]+ )?(?:infection|flu|virus|fever|migraine|allergy|condition|disease|deficiency|disorder)\b/gi,
  /\b(?:take|taking|increase|reduce|decrease|stop|start|double|skip) (?:the |your |his |her |their )?(?:dose|dosage|medicine|medication|tablets?|pills?|antibiotics?|paracetamol|ibuprofen)\b/gi,
  /\b\d+(?:\.\d+)?\s?(?:mg|mcg|ml)\b/gi,
  /\bprescri(?:be|bed|ption|bing)\b/gi,
  /\b(?:treatment|treat it|cure)\b/gi,
];

const INTEGRATION_BRANDS = /\b(?:google calendar|outlook|icloud|apple calendar|gmail|whatsapp|alexa|google home|siri|amazon|swiggy|zomato|blinkit|zepto|bigbasket|instamart)\b/gi;
const SYNC_WORDS = /\b(?:synced|syncing|sync(?:ed)? with|connected to|linked to|imported from|pulled from)\b/gi;

const FIRST_PERSON_DONE = /\bi(?:'ve| have| just| already)?\s+(?:just\s+|already\s+)?(added|paid|ordered|booked|scheduled|sent|created|updated|removed|deleted|cancelled|canceled|set up|marked|moved|rescheduled|reminded|notified|saved|noted|put|placed|confirmed|assigned|changed|told)\b/gi;
const PASSIVE_DONE = /\b(?:has|have) (?:now |just |already )?been (added|paid|ordered|booked|scheduled|sent|created|updated|removed|deleted|cancelled|canceled|marked|moved|rescheduled|placed|assigned|changed)\b/gi;
const LEADING_DONE = /^\s*(?:all )?done\b\s*[.!:,—–-]/i;

export function validateAnswer(draft: AnswerDraft, context: ValidationContext): ValidationResult {
  const text = plain(draft.text);
  const corpus = normalise([...context.facts.map((fact) => fact.text), context.question, ...(context.history ?? []), context.localNow].join("\n"));
  const words = new Set(corpus.split(/[^a-z0-9'’-]+/).filter(Boolean));
  const violations: Violation[] = [];
  const flag = (kind: ViolationKind, value: string) => {
    if (!violations.some((entry) => entry.kind === kind && entry.value.toLowerCase() === value.toLowerCase())) violations.push({ kind, value });
  };

  // --- Which facts it says it used --------------------------------------------
  const known = new Set(context.facts.map((fact) => fact.id));
  for (const id of draft.usedFacts) if (!known.has(id)) flag("unknown_fact", id);

  // --- Names ---------------------------------------------------------------------
  for (const match of text.matchAll(/\b(Adult|Child|Helper) ([A-Z])\b/g)) {
    if (!corpus.includes(`${match[1]!.toLowerCase()} ${match[2]!.toLowerCase()}`)) flag("unsupported_name", match[0]);
  }
  for (const clause of text.split(/[.!?\n]+|:\s|\s[—–-]\s|\(|;\s/)) {
    const tokens = clause.trim().match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
    tokens.forEach((token, index) => {
      if (!/^[A-Z][a-z]/.test(token)) return;
      const bare = token.replace(/['’]s$/i, "").toLowerCase();
      if (index === 0 && (SENTENCE_STARTERS.has(bare) || !NAME_FOLLOWERS.has((tokens[1] ?? "").toLowerCase()) && !/['’]s$/i.test(token))) return;
      if (ALLOWED_CAPITALS.has(bare)) return;
      if (/^(?:Adult|Child|Helper)$/.test(tokens[index - 1] ?? "") ) return;
      if (words.has(bare) || corpus.includes(bare)) return;
      flag("unsupported_name", token.replace(/['’]s$/i, ""));
    });
  }

  // --- Dates -------------------------------------------------------------------
  for (const match of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {
    if (!corpus.includes(match[0])) flag("unsupported_date", match[0]);
  }
  const supportedDays = supportedDayMonths(corpus, context.today);
  for (const match of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_WORD}\\b|\\b${MONTH_WORD}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi"))) {
    const day = Number(match[1] ?? match[4]);
    const month = monthIndex(match[2] ?? match[3] ?? "");
    if (month === null || !day) continue;
    if (!supportedDays.has(`${day} ${month}`)) flag("unsupported_date", match[0]);
  }
  const weekdays = supportedWeekdays(corpus, words, context.today);
  // Whole day names in any case; the short forms only as fact text writes
  // them ("Sat"), since "sat" and "sun" are also ordinary words.
  for (const match of [...text.matchAll(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi), ...text.matchAll(/\b(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\b/g)]) {
    const index = weekdayIndex(match[1]!);
    if (index === null) continue;
    if (!weekdays.has(index)) flag("unsupported_date", match[0]);
  }

  // --- Clock times -------------------------------------------------------------
  const supportedTimes = clockTimesIn(corpus);
  for (const { text: said, minutes } of clockTimesIn(normalise(text))) {
    if (!minutes.some((value) => supportedTimes.some((time) => time.minutes.includes(value)))) flag("unsupported_time", said);
  }

  // --- Amounts -----------------------------------------------------------------
  const supportedAmounts = amountsIn(corpus);
  const usedAmounts = amountsIn(normalise(context.facts.filter((fact) => draft.usedFacts.includes(fact.id)).map((fact) => fact.text).join("\n")));
  const sums = [sum(supportedAmounts), sum(usedAmounts)];
  for (const amount of amountsIn(normalise(text))) {
    const supported = supportedAmounts.some((value) => Math.abs(value - amount) < 0.5) || sums.some((value) => value > 0 && Math.abs(value - amount) < 0.5);
    if (!supported) flag("unsupported_amount", formatAmount(amount));
  }

  // --- Events ------------------------------------------------------------------
  const lowered = normalise(text);
  for (const word of EVENT_WORDS) {
    const pattern = new RegExp(`\\b${word.replace(/[-]/g, "[- ]")}(?:e?s)?\\b`, "i");
    if (pattern.test(lowered) && !pattern.test(corpus)) flag("unsupported_event", word);
  }

  // --- Health: never a diagnosis, a dose or a treatment --------------------------
  for (const pattern of HEALTH_CLAIMS) {
    for (const match of lowered.matchAll(pattern)) {
      if (!corpus.includes(match[0].trim())) flag("unsupported_health_claim", match[0].trim());
    }
  }

  // --- Connected services ---------------------------------------------------------
  for (const match of lowered.matchAll(INTEGRATION_BRANDS)) {
    if (!corpus.includes(match[0])) flag("unsupported_integration", match[0]);
  }
  for (const match of lowered.matchAll(SYNC_WORDS)) {
    if (!/\bsync|\bconnection\b|\bconnected\b/.test(corpus)) flag("unsupported_integration", match[0]);
  }

  // --- Claims to have done something --------------------------------------------
  for (const match of lowered.matchAll(FIRST_PERSON_DONE)) flag("unsupported_action", match[0]);
  for (const match of lowered.matchAll(PASSIVE_DONE)) {
    if (!words.has(match[1]!)) flag("unsupported_action", match[0]);
  }
  if (LEADING_DONE.test(lowered)) flag("unsupported_action", "done");

  return { ok: violations.length === 0, violations };
}

/**
 * What to tell a model the second time, in terms of what it wrote — never a
 * hint about what the answer should be, and never anything about reasoning.
 */
export function describeViolations(violations: readonly Violation[]): string[] {
  return violations.map(({ kind, value }) => {
    switch (kind) {
      case "unsupported_name":
        return `"${value}" is not named in any fact.`;
      case "unsupported_date":
        return `"${value}" is not a date any fact gives.`;
      case "unsupported_time":
        return `"${value}" is not a time any fact gives.`;
      case "unsupported_amount":
        return `The amount ${value} is not in any fact.`;
      case "unsupported_event":
        return `No fact mentions a ${value}.`;
      case "unsupported_health_claim":
        return `"${value}" reads as medical advice or a diagnosis, which WonderHome never gives.`;
      case "unsupported_integration":
        return `"${value}" describes a connected service no fact records.`;
      case "unsupported_action":
        return `"${value}" claims something was done; nothing has been done in answering a question.`;
      case "unfounded_answer":
        return `Nothing on record answers "${value}".`;
      case "unknown_fact":
        return `${value} is not one of the facts given.`;
    }
  });
}

/** Markdown and links read as their words; a link's target is not a claim. */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "");
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
}

function monthIndex(word: string): number | null {
  const index = MONTHS.indexOf(word.toLowerCase().slice(0, 3) as (typeof MONTHS)[number]);
  return index >= 0 ? index : null;
}

function weekdayIndex(word: string): number | null {
  const clean = word.toLowerCase().slice(0, 3);
  const index = WEEKDAYS.findIndex((day) => day.startsWith(clean));
  return index >= 0 ? index : null;
}

/** Every "day month" the corpus carries, however it was written. */
function supportedDayMonths(corpus: string, today: string): Set<string> {
  const out = new Set<string>();
  for (const match of corpus.matchAll(/\b\d{4}-(\d{2})-(\d{2})\b/g)) out.add(`${Number(match[2])} ${Number(match[1]) - 1}`);
  for (const match of corpus.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_WORD}\\b|\\b${MONTH_WORD}\\s+(\\d{1,2})\\b`, "gi"))) {
    const month = monthIndex(match[2] ?? match[3] ?? "");
    const day = Number(match[1] ?? match[4]);
    if (month !== null && day) out.add(`${day} ${month}`);
  }
  // Today, yesterday and tomorrow are always known.
  for (const offset of [-1, 0, 1]) {
    const date = shift(today, offset);
    out.add(`${date.getUTCDate()} ${date.getUTCMonth()}`);
  }
  return out;
}

/** Weekdays the corpus names, plus the weekday of every date it carries, plus today's neighbours. */
function supportedWeekdays(corpus: string, words: Set<string>, today: string): Set<number> {
  const out = new Set<number>();
  WEEKDAYS.forEach((day, index) => {
    if (words.has(day) || words.has(day.slice(0, 3)) || words.has(`${day}s`)) out.add(index);
  });
  const year = Number(today.slice(0, 4));
  for (const match of corpus.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    out.add(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay());
  }
  for (const match of corpus.matchAll(new RegExp(`\\b(\\d{1,2})\\s+${MONTH_WORD}\\b`, "gi"))) {
    const month = monthIndex(match[2]!);
    if (month !== null) out.add(new Date(Date.UTC(year, month, Number(match[1]))).getUTCDay());
  }
  for (const offset of [-1, 0, 1]) out.add(shift(today, offset).getUTCDay());
  return out;
}

function shift(iso: string, days: number): Date {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

/**
 * Clock times, as minutes past midnight: "7:30pm", "7 pm", "19:30". A bare
 * "10:30" (the first half of "10:30–11:30am") could be either half of the
 * day, so it carries both readings and matches either.
 */
function clockTimesIn(text: string): { text: string; minutes: number[] }[] {
  const out: { text: string; minutes: number[] }[] = [];
  for (const match of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s?(a\.?m\.?|p\.?m\.?)(?![a-z])|\b(\d{1,2}):(\d{2})\b/gi)) {
    const hour = Number(match[1] ?? match[4]);
    const minute = Number(match[2] ?? match[5] ?? 0);
    if (hour > 23 || minute > 59) continue;
    const meridiem = match[3]?.replace(/\./g, "").toLowerCase();
    if (meridiem) {
      if (hour < 1 || hour > 12) continue;
      out.push({ text: match[0].trim(), minutes: [((hour % 12) + (meridiem === "pm" ? 12 : 0)) * 60 + minute] });
    } else {
      out.push({ text: match[0].trim(), minutes: hour <= 12 ? [(hour % 12) * 60 + minute, ((hour % 12) + 12) * 60 + minute] : [hour * 60 + minute] });
    }
  }
  return out;
}

/** Amounts with a currency mark or word: "₹1,200", "rs 450", "1200 rupees", "$20". */
function amountsIn(text: string): number[] {
  const out: number[] = [];
  const pattern = /(?:₹|\brs\.?\s?|\binr\s?|\$|\busd\s?|€|£)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:rupees|dollars|\brs\b|\binr\b|\busd\b)/gi;
  for (const match of text.matchAll(pattern)) {
    const value = Number((match[1] ?? match[2] ?? "").replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) out.push(value);
  }
  return out;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toFixed(2);
}
