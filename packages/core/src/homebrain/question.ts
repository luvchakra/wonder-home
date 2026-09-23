import { daysBetween, isoDay, normalizeText, weekdayIndex } from "../context/normalize";
import { resolvePerson } from "../context/resolution";
import { DOMAIN_WORDS, readQuestion } from "../context/retrieval";
import type { ContextDomain, HouseholdContextItem, PersonRef } from "../context/types";

/**
 * Reading a question before anything is retrieved (Wave 2 §5: intent hints,
 * then entity, time and domain hints).
 *
 * Wave 1's `readQuestion` already says which domains a question's words are
 * in and which people or things it names. HomeBrain 2.0 adds what a person
 * means without saying it:
 *
 *  - the domains a question *connects* to — "can we make pasta tonight?" is
 *    about meals, and so about whether the groceries are there (§4);
 *  - when it is about — "tomorrow", "Saturday", "this week" — as real dates
 *    in the household's own zone, so a fact can be judged in or out of it;
 *  - who "the older one", "my son" or "me" is, resolved through the context
 *    engine and never guessed: an ambiguous reference becomes one focused
 *    question instead of an answer about the wrong child;
 *  - what a follow-up ("and Manan?", "is she free then?") inherits from the
 *    question before it.
 *
 * Pure: nothing is read, and the same question over the same facts always
 * reads the same way.
 */

export type TimeWindow = {
  /** How the question put it, for the answer's own words. */
  label: string;
  /** First day in the window, YYYY-MM-DD, household zone. */
  from: string;
  /** Last day in the window, inclusive. */
  to: string;
};

export type BrainReading = {
  /** The text retrieval ranks against — the question, plus what a follow-up inherited and who a reference resolved to. */
  retrievalText: string;
  /** Domains the question's own words are in. */
  domains: Set<ContextDomain>;
  /**
   * The parts of the home the question is unmistakably about — domains named
   * by a strong word ("bills", "homework", "dinner"), not by a word that
   * happens to be in several lists ("does", "need", "who"). Facts outside
   * these (and what they connect to) are left out when there is a focus.
   */
  focus: Set<ContextDomain>;
  /** Domains it connects to without naming them (§4). */
  connected: Set<ContextDomain>;
  /** People the question is about, each one resolved rather than guessed. */
  people: PersonRef[];
  time: TimeWindow | null;
  /** Whether it inherited anything from the question before. */
  followUp: boolean;
  /** Whether it asks if two things collide. */
  wantsConflicts: boolean;
  /** "What's going on?" — about the whole home rather than any part of it. */
  broad: boolean;
  /** Set when a person could not be resolved: the one question to ask instead of answering. */
  clarification: string | null;
  /**
   * The children the asker looks after, when the question is about the asker
   * alone ("what do I need to remember tomorrow?"): a parent's day includes
   * their children's plans. Never used for health — "my checkup" is mine.
   */
  dependants: string[];
};

/**
 * Where a question naturally reaches past the domain it names.
 *
 * Kept small and explicit: each line is a connection a household makes
 * without thinking ("dinner" means "do we have what dinner needs"), not a
 * way to widen every question until it is about everything.
 */
const CONNECTED: Partial<Record<ContextDomain, readonly ContextDomain[]>> = {
  meals: ["groceries", "preferences"],
  school: ["calendar", "groceries"],
  health: ["calendar"],
  calendar: ["absences"],
  groceries: ["orders"],
  pets: ["pet_care"],
};

/** "Need", "bring", "carry" about a person or a day reaches across school, the calendar and what is in the house. */
const NEED_WORDS = /\b(?:need|needs|needed|bring|carry|take|pack|ready for|prepare|prepared)\b/i;
const CONFLICT_WORDS = /\b(?:clash|clashes|clashing|conflict|conflicts|overlap|overlaps|double[- ]?booked|same time|free|busy|available)\b/i;
const MEAL_TIME_WORDS = /\b(?:tonight|dinner|lunch|breakfast|cook|make)\b/i;

/** References to a person that are not a name. Names are found by `readQuestion`'s own mention matching. */
const PERSON_PHRASES = [
  /\bthe (?:older|elder|eldest|oldest|younger|youngest|little|big|small) one\b/i,
  /\b(?:my|our|the) (?:son|daughter|kid|child|boy|girl|elder one|younger one)\b/i,
  /\bthe (?:kid|child|helper|cook|maid|driver|nanny|cleaner|gardener)\b/i,
  /\b(?:dad|daddy|papa|father|mom|mum|mummy|mama|mother|nani|nana|dadi|dada|grandma|grandpa)\b/i,
];
/**
 * Words in Wave 1's domain lists that are too common to say what a question
 * is about on their own — "what does Asmi have" is not a question about
 * responsibilities. They still count toward relevance; they only never set
 * the focus.
 */
const WEAK_WORDS = new Set([
  "who", "does", "do", "did", "was", "were", "need", "needs", "run", "running", "out", "order", "buy", "get", "going", "check", "checked",
  "sent", "said", "asked", "earlier", "when", "free", "busy", "around", "here", "off", "walk", "track", "progress", "like", "likes", "usually",
  "always", "plan", "plans", "week", "today", "tomorrow", "handle", "handles", "owner", "owns", "charge", "wrong", "problem", "problems",
  "account", "connected", "notice", "told", "amount", "money", "pay", "due", "class", "test", "match", "cat", "dog", "run",
]);
const SELF_WORDS = /\b(?:i|me|my|mine|myself)\b/i;

const FOLLOW_UP_OPENERS = /^(?:and|what about|how about|also|then|same for|and for)\b/i;
const FOLLOW_UP_PRONOUNS = /\b(?:she|he|her|him|his|hers|they|them|their|it|that|those|then|there)\b/i;

export type ReadOptions = {
  viewerMemberId: string;
  timezone: string;
  now: Date;
  /** The member's previous question in this conversation, for a follow-up to inherit from. */
  previousQuestion?: string | null;
  /** The children this member is a guardian of — the context scope's own `guardianOf`. */
  guardianOf?: readonly string[];
};

export function readBrainQuestion(question: string, items: readonly HouseholdContextItem[], options: ReadOptions): BrainReading {
  const own = readQuestion(question, items);
  const ownPeople = namedPeople(own.mentioned);

  // A follow-up inherits: "And Manan?" keeps the previous question's day and
  // domain but swaps the person; "is she free then?" keeps all of it.
  let text = question;
  let followUp = false;
  const previous = options.previousQuestion?.trim();
  if (previous && isFollowUp(question, own)) {
    followUp = true;
    if (ownPeople.length > 0) {
      const earlier = namedPeople(readQuestion(previous, items).mentioned);
      // The new person replaces whoever — or whichever "the kid" — was asked about before.
      text = `${question} ${stripPersonPhrases(stripNames(previous, earlier))}`;
    } else {
      text = `${previous} ${question}`;
    }
  }

  // People who are not named: "the older one", "my son", "the cook", "me".
  const people: PersonRef[] = [...namedPeople(readQuestion(text, items).mentioned)];
  let clarification: string | null = null;
  for (const phrase of personPhrases(text)) {
    const resolved = resolvePerson(phrase, items, { viewerMemberId: options.viewerMemberId });
    if (resolved.selected) {
      if (!people.some((person) => person.memberId === resolved.selected!.memberId)) people.push(resolved.selected);
    } else if (resolved.candidates.length > 1 && resolved.question) {
      clarification ??= resolved.question;
    }
  }
  let dependants: string[] = [];
  if (SELF_WORDS.test(text)) {
    const self = resolvePerson("me", items, { viewerMemberId: options.viewerMemberId }).selected;
    const aboutOnlyMe = people.length === 0;
    if (self && !people.some((person) => person.memberId === self.memberId)) people.push(self);
    if (self && aboutOnlyMe) dependants = [...(options.guardianOf ?? [])];
  }

  const retrievalText = [text, ...people.map((person) => person.displayName)].join(" ");
  const read = readQuestion(retrievalText, items);

  const domains = new Set(read.domains);
  if (/\b(?:tonight|dinner|lunch|breakfast)\b/i.test(text)) domains.add("meals");
  if (/\bresponsibilit(?:y|ies)\b/i.test(text)) domains.add("responsibilities");
  if (/\bprotected\b/i.test(text)) domains.add("calendar");
  for (const item of read.mentioned) {
    if (item.entityType === "meal") domains.add("meals");
    if (item.entityType === "school_item") domains.add("school");
  }

  const said = new Set(normalizeText(retrievalText).split(" ").filter(Boolean));
  const focus = new Set<ContextDomain>();
  for (const [domain, words] of Object.entries(DOMAIN_WORDS) as [ContextDomain, readonly string[]][]) {
    if (words.some((word) => !WEAK_WORDS.has(word) && said.has(word))) focus.add(domain);
  }
  for (const domain of domains) if (!read.domains.has(domain)) focus.add(domain);

  const wantsConflicts = CONFLICT_WORDS.test(text);
  const connected = new Set<ContextDomain>();
  for (const domain of domains) for (const next of CONNECTED[domain] ?? []) if (!domains.has(next)) connected.add(next);
  if (NEED_WORDS.test(text) && (people.length > 0 || timeWindow(text, options))) {
    for (const next of ["school", "calendar", "groceries"] as const) if (!domains.has(next)) connected.add(next);
    // "What do we need today?" includes what today's meals still need.
    if (timeWindow(text, options) && !domains.has("meals")) connected.add("meals");
  }
  if (MEAL_TIME_WORDS.test(text) && /\b(?:make|cook|have)\b/i.test(text) && !domains.has("groceries")) connected.add("groceries");
  // "What's on tomorrow?" is a household's day, and school work due that day
  // is part of it — the date window still keeps next week's project out.
  if (domains.has("calendar") && timeWindow(text, options) && !domains.has("school")) connected.add("school");
  if (wantsConflicts) {
    for (const next of ["calendar", "absences"] as const) if (!domains.has(next)) connected.add(next);
  }

  return {
    retrievalText,
    domains,
    focus,
    connected,
    people,
    time: timeWindow(text, options),
    followUp,
    wantsConflicts,
    broad: read.broad && people.length === 0,
    clarification,
    dependants,
  };
}

/**
 * The dates a question is about, in the household's zone. Null when it names
 * no time — which is not the same as "today", and is never read as it.
 */
export function timeWindow(text: string, options: { timezone: string; now: Date }): TimeWindow | null {
  const today = isoDay(options.now, options.timezone);
  const t = normalizeText(text);
  const day = (offset: number) => addDays(today, offset);

  if (/\b(?:today|tonight|this evening|this morning|this afternoon)\b/.test(t)) return { label: /\btonight\b/.test(t) ? "tonight" : "today", from: today, to: today };
  if (/\byesterday\b/.test(t)) return { label: "yesterday", from: day(-1), to: day(-1) };
  if (/\bday after tomorrow\b/.test(t)) return { label: "the day after tomorrow", from: day(2), to: day(2) };
  if (/\btomorrow\b/.test(t)) return { label: "tomorrow", from: day(1), to: day(1) };
  if (/\bthis weekend\b|\bweekend\b/.test(t)) {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const toSaturday = (6 - weekday + 7) % 7;
    const from = weekday === 0 ? today : day(toSaturday);
    return { label: "this weekend", from, to: weekday === 0 ? today : addDays(from, 1) };
  }
  if (/\bnext week\b/.test(t)) return { label: "next week", from: day(7), to: day(13) };
  if (/\bthis week\b|\bthe week\b/.test(t)) return { label: "this week", from: today, to: day(6) };
  if (/\bthis month\b/.test(t)) {
    const [year, month] = today.split("-").map(Number) as [number, number];
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { label: "this month", from: today, to: `${today.slice(0, 8)}${String(last).padStart(2, "0")}` };
  }
  for (const word of t.split(" ")) {
    if (word.length < 3 || !/^(?:mon|tue|wed|thu|fri|sat|sun)/.test(word)) continue;
    const index = weekdayIndex(word);
    if (index === null) continue;
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const offset = (index - weekday + 7) % 7;
    const date = day(offset);
    return { label: `on ${capitalizeDay(word)}`, from: date, to: date };
  }
  return null;
}

/** Whether an ISO date falls inside a window. */
export function inWindow(date: string, window: TimeWindow): boolean {
  const day = date.slice(0, 10);
  return daysBetween(window.from, day) >= 0 && daysBetween(day, window.to) >= 0;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function capitalizeDay(word: string): string {
  const index = weekdayIndex(word);
  const full = index === null ? word : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index]!;
  return full;
}

function namedPeople(mentioned: readonly HouseholdContextItem[]): PersonRef[] {
  return mentioned
    .filter((item) => item.entityType === "member")
    .map((item) => {
      const memberType = item.attributes.memberType as PersonRef["memberType"];
      return { kind: memberType === "helper" ? "helper" : "family", memberId: item.entityId, displayName: String(item.attributes.displayName), memberType } satisfies PersonRef;
    });
}

function isFollowUp(question: string, own: ReturnType<typeof readQuestion>): boolean {
  const words = normalizeText(question).split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 9) return false;
  if (FOLLOW_UP_OPENERS.test(question.trim())) return true;
  // "Asmi." — a name on its own answers "which one did you mean?".
  const people = own.mentioned.filter((item) => item.entityType === "member");
  if (words.length <= 3 && people.length > 0 && own.domains.size === 0) return true;
  // A short question with a pronoun and nothing of its own to be about.
  const namesSomething = own.mentioned.some((item) => item.entityType !== "household");
  return FOLLOW_UP_PRONOUNS.test(question) && !namesSomething && own.domains.size <= 1;
}

function stripNames(text: string, people: readonly PersonRef[]): string {
  let out = text;
  for (const person of people) {
    for (const name of [person.displayName, person.displayName.split(/\s+/)[0] ?? ""]) {
      if (name.length < 2) continue;
      out = out.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:'s)?\\b`, "gi"), " ");
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function stripPersonPhrases(text: string): string {
  let out = text;
  for (const pattern of PERSON_PHRASES) out = out.replace(new RegExp(pattern.source, "gi"), " ");
  return out.replace(/\s+/g, " ").trim();
}

function personPhrases(text: string): string[] {
  const found: string[] = [];
  for (const pattern of PERSON_PHRASES) {
    const match = text.match(pattern);
    if (match) found.push(match[0].toLowerCase());
  }
  return found;
}
