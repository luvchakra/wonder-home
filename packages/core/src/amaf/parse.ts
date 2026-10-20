import { amountIn } from "../conversation/bill-talk";

/**
 * Reading an answer to one AMAF question, by rules.
 *
 * Every question says what shape its answer has, and these readers turn
 * what a person said into that shape — or say plainly that they could not.
 * They never guess: an answer that is not clearly a date is not a date, and
 * the question is asked again more narrowly or kept as the person's own words.
 * A model may read the same answer for a question with several parts
 * (`extract.ts`), and its reading is checked by these same readers.
 */

/** "I don't know", "not sure", "no idea" — an answer, but nothing to record. */
export function isDontKnow(text: string): boolean {
  return /^(?:i\s+)?(?:don'?t|do not|dunno|not sure|no idea|can'?t remember|cannot remember|not certain|i forget|forgot)\b/i.test(text.trim());
}

/** "Skip", "next", "pass" — move on to another question. */
export function isSkipQuestion(text: string): boolean {
  return /^(?:skip(?: this| it| that)?|next(?: one| question)?|pass|move on|ask (?:me )?(?:something|another)(?: else)?|another(?: one)?|not this one)[.!]*$/i.test(text.trim());
}

/** "Stop", "that's enough", "later" — end the mode. */
export function isStop(text: string): boolean {
  return /^(?:stop(?: asking)?(?: questions)?|enough(?: for now| for today)?|that'?s (?:enough|all)(?: for now| for today)?|later|not now|maybe later|i'?m done|done for now|end(?: this)?|quit|exit|stop amaf|exit amaf|no more questions)[.!]*$/i.test(text.trim());
}

const YES = /^(?:yes|yeah|yep|yup|sure|right|correct|that'?s right|exactly|true|of course|absolutely|haan?|ha ji|ji|hmm yes|y)\b/i;
const NO = /^(?:no|nope|nah|not really|none|nobody|no one|nothing|wrong|that'?s wrong|incorrect|n)\b/i;

/** Yes, no, or neither. */
export function readYesNo(text: string): boolean | null {
  const said = text.trim();
  if (YES.test(said)) return true;
  if (NO.test(said)) return false;
  return null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;

function monthOf(word: string): number {
  const lower = word.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((month) => month.startsWith(lower)) + 1;
}

function validDay(year: number | null, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const days = new Date(Date.UTC(year ?? 2024, month, 0)).getUTCDate();
  return day <= days;
}

export type ReadDate = { month: number; day: number; year: number | null };

/**
 * "3 May 2015", "May 3rd", "3rd of May, 2015", "2015-05-03", "03/05/2015"
 * (day first, as an Indian household writes it). A year on its own or a
 * date that cannot exist is not a date.
 */
export function readDate(text: string): ReadDate | null {
  const said = text.toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const iso = said.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return validDay(year, month, day) ? { year, month, day } : null;
  }
  const slashed = said.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (slashed) {
    const day = Number(slashed[1]);
    const month = Number(slashed[2]);
    const year = slashed[3] ? fullYear(Number(slashed[3])) : null;
    return validDay(year, month, day) ? { year, month, day } : null;
  }
  const dayFirst = said.match(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?(?: of)? ${MONTH}\b(?: (\d{4}))?`, "i"));
  const monthFirst = said.match(new RegExp(String.raw`\b${MONTH} (\d{1,2})(?:st|nd|rd|th)?\b(?: (\d{4}))?`, "i"));
  const found = dayFirst
    ? { day: Number(dayFirst[1]), month: monthOf(dayFirst[2]!), year: dayFirst[3] ? Number(dayFirst[3]) : null }
    : monthFirst
      ? { day: Number(monthFirst[2]), month: monthOf(monthFirst[1]!), year: monthFirst[3] ? Number(monthFirst[3]) : null }
      : null;
  if (!found) return null;
  const year = found.year ?? yearAlone(said);
  return validDay(year, found.month, found.day) ? { ...found, year } : null;
}

function fullYear(year: number): number {
  if (year >= 100) return year;
  // Two digits: a birthday this century until it would be in the future.
  const now = new Date().getUTCFullYear() % 100;
  return year <= now ? 2000 + year : 1900 + year;
}

/** A year said separately: "May 3rd, born in 2015". */
function yearAlone(said: string): number | null {
  const year = said.match(/\b(19\d{2}|20\d{2})\b/);
  return year ? Number(year[1]) : null;
}

export function isoDate(date: ReadDate): string | null {
  if (date.year === null) return null;
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/** A time of day as "HH:MM" from "9", "9am", "9:30 pm", "18:00", "half past five" is not read. */
export function readClock(text: string, defaultPm = false): string | null {
  const said = text.trim().toLowerCase();
  const match = said.match(/^(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.replace(/\./g, "");
  if (hour > 23 || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && defaultPm && hour >= 1 && hour <= 7) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * "9 to 6", "9am-5:30pm", "from 8:30 till 3", "between 10 and 7". An end
 * without am/pm that would fall before the start is read in the afternoon:
 * "9 to 6" is a working day, not nine hours backwards.
 */
export function readTimeRange(text: string): { starts: string; ends: string } | null {
  const said = text.toLowerCase().replace(/\bnoon\b/g, "12pm").replace(/\bmidday\b/g, "12pm");
  const match = said.match(/(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\s*(?:-|–|to|till|until|til|and)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/);
  if (!match) return null;
  const starts = readClock(match[1]!.replace(/\s+/g, ""));
  let ends = readClock(match[2]!.replace(/\s+/g, ""));
  if (!starts || !ends) return null;
  if (ends <= starts && !/am|pm/.test(match[2]!)) ends = readClock(match[2]!.replace(/\s+/g, ""), true);
  if (!ends || ends <= starts) return null;
  return { starts, ends };
}

const WEEKDAYS: readonly [RegExp, number][] = [
  [/\bmon(?:day)?s?\b/i, 1],
  [/\btue(?:s(?:day)?)?s?\b/i, 2],
  [/\bwed(?:nesday)?s?\b/i, 3],
  [/\bthu(?:r(?:s(?:day)?)?)?s?\b/i, 4],
  [/\bfri(?:day)?s?\b/i, 5],
  [/\bsat(?:urday)?s?\b/i, 6],
  [/\bsun(?:day)?s?\b/i, 7],
];

/**
 * Days of the week, 1 = Monday: "Tuesdays and Thursdays", "Mon to Fri",
 * "weekdays", "every day", "weekends".
 */
export function readWeekdays(text: string): number[] {
  const said = text.toLowerCase();
  if (/\b(?:every ?day|daily|all (?:days|week)|seven days)\b/.test(said)) return [1, 2, 3, 4, 5, 6, 7];
  const days = new Set<number>();
  if (/\bweekdays?\b|\bmonday to friday\b|\bmon(?:day)? ?(?:-|to|through) ?fri(?:day)?\b/.test(said)) [1, 2, 3, 4, 5].forEach((day) => days.add(day));
  if (/\bmon(?:day)? ?(?:-|to|through) ?sat(?:urday)?\b/.test(said)) [1, 2, 3, 4, 5, 6].forEach((day) => days.add(day));
  if (/\bweekends?\b/.test(said)) [6, 7].forEach((day) => days.add(day));
  for (const [pattern, day] of WEEKDAYS) if (pattern.test(said)) days.add(day);
  return [...days].sort((a, b) => a - b);
}

/** A day of the month, "the 5th", "on 12", "5th of every month". */
export function readMonthDay(text: string): number | null {
  const match = text.match(/\b(?:on |by |the |due )*(\d{1,2})(?:st|nd|rd|th)\b/i) ?? text.match(/\b(?:on|by|due(?: on)?)\s+(?:the\s+)?(\d{1,2})\b/i);
  const day = match ? Number(match[1]) : null;
  return day !== null && day >= 1 && day <= 31 ? day : null;
}

/** An amount in major units (42.50, never 4250), or null. Reuses the bills reader. */
export function readAmount(text: string): number | null {
  const amount = amountIn(text);
  return amount !== null && amount > 0 ? amount : null;
}

/** A phone number as typed: at least 8 digits, an optional +country code; the person's own spacing dropped. */
export function readPhone(text: string): string | null {
  const match = text.match(/(\+?\d[\d\s()-]{7,}\d)/);
  if (!match) return null;
  const digits = match[1]!.replace(/[^\d+]/g, "");
  const count = digits.replace(/\D/g, "").length;
  return count >= 8 && count <= 15 ? digits : null;
}

/** An email address, or null. */
export function readEmail(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  return match ? match[0].toLowerCase() : null;
}

/**
 * The option a person meant from a known set, by its words or any of its
 * synonyms, matched as whole words. Two different options named is no
 * answer: one focused question is better than a guess.
 */
export function readChoice<T extends string>(text: string, options: readonly { value: T; words: readonly string[] }[]): T | null {
  const said = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ")} `;
  const hits = new Set<T>();
  for (const option of options) {
    if (option.words.some((word) => said.includes(` ${word.toLowerCase()} `))) hits.add(option.value);
  }
  return hits.size === 1 ? [...hits][0]! : null;
}

/**
 * Several things said in one answer: "peanuts, prawns and kiwi" → three.
 * Lead-ins ("she likes", "we usually have") are taken off by the caller.
 */
export function readList(text: string): string[] {
  return text
    .replace(/[.!?]+$/g, "")
    .split(/\s*(?:,|;|\band\b|\bor\b|&|\/|\bplus\b|\balso\b)\s*/i)
    .map((part) => part.trim().replace(/^(?:a|an|the|some)\s+/i, ""))
    .filter((part) => part.length > 0 && part.length <= 80)
    .slice(0, 12);
}

/** The words of an answer with the lead-in a person adds: "Her name is Mrs Rao" → "Mrs Rao". */
export function stripLeadIn(text: string): string {
  return text
    .trim()
    .replace(/^(?:(?:um+|uh+|well|so|okay|ok|hmm+)[, ]+)*/i, "")
    .replace(/^(?:it'?s|it is|that'?s|that is|(?:his|her|their|its|our|my) (?:name )?is|(?:he|she|they) (?:is|are)|we (?:have|use|go to)|they go to|she goes to|he goes to|called|named)\s+/i, "")
    .replace(/[.!]+$/, "")
    .trim();
}
