import { createHash } from "node:crypto";

import type { AgeBand } from "../identity/age";

/**
 * Kids Trivia (story 08-034, the owner 2026-11-07): a child picks topics they
 * love, and every time they open WonderHome their Home shows one trivia card
 * from those topics — "Did you know?" and "Quiz time!" in turn.
 *
 * This file is the deterministic part, with no database and no model:
 *  - what a typed topic becomes (`normaliseTopic`), and whether the rules turn
 *    it away (`screenTopic`) before any model is asked;
 *  - which card comes next (`pickNextCard`): the other kind from last time,
 *    never the same card twice in a row, unseen cards first, nearest the
 *    child's difficulty;
 *  - the quiz streak, counted from answers on record (rule 9).
 *
 * A topic is untrusted text. The rules here are the first gate; the model check
 * (`trivia-safety.ts`) is the second, and a topic it turns away is never
 * stored — only a hash and a reason code for the guardian (`topicHash`).
 */

export const TRIVIA_TOPIC_MAX = 40;
export const TRIVIA_TOPIC_MIN = 2;
export const TRIVIA_TOPICS_PER_CHILD = 8;
export const TRIVIA_HISTORY_FOR_GUARDIAN = 20;

export const TRIVIA_BANDS = ["young_child", "older_child", "teen"] as const;
export type TriviaBand = (typeof TRIVIA_BANDS)[number];

export const TRIVIA_REJECT_REASONS = ["violence", "sexual", "drugs", "self_harm", "hate", "gambling", "scary", "private_person", "not_a_topic"] as const;
export type TriviaRejectReason = (typeof TRIVIA_REJECT_REASONS)[number];

export const TRIVIA_KINDS = ["fact", "quiz"] as const;
export type TriviaKind = (typeof TRIVIA_KINDS)[number];

export type TriviaLevel = 1 | 2 | 3;

/** The trivia age band: a child without a birthday on record is treated as 8–12; an adult viewing as a child as a teen. */
export function triviaBand(ageBand: AgeBand | null | undefined): TriviaBand {
  if (ageBand === "young_child" || ageBand === "older_child" || ageBand === "teen") return ageBand;
  return ageBand === "adult" ? "teen" : "older_child";
}

/** Where a child starts before they say "too hard" or "too easy". */
export function defaultLevel(band: TriviaBand): TriviaLevel {
  return band === "young_child" ? 1 : band === "older_child" ? 2 : 3;
}

export function clampLevel(value: number): TriviaLevel {
  return (Math.min(3, Math.max(1, Math.round(Number.isFinite(value) ? value : 2))) as TriviaLevel);
}

export type NormalisedTopic = { label: string; key: string };

const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
// Letters (any script), marks, digits, spaces and a few joiners: "K-pop", "Tom & Jerry", "C++", "F1", "Mr. Bean".
const ALLOWED = /^[\p{L}\p{M}\p{N} '&.+-]+$/u;

/**
 * What a typed topic becomes: one tidy line of at most 40 characters and five
 * words, in the child's own spelling (`label`), and a lower-case key that two
 * spellings of one topic share (`key`). Null when nothing usable is left — a
 * link, an emoji-only line, a paragraph.
 */
export function normaliseTopic(raw: unknown): NormalisedTopic | null {
  if (typeof raw !== "string") return null;
  let line = raw.normalize("NFKC").replace(INVISIBLE, " ").replace(/\p{Extended_Pictographic}/gu, " ");
  line = line.replace(/[\s_]+/g, " ").trim().replace(/^[\s'&.+-]+|[\s'&.-]+$/g, "");
  if (line.length < TRIVIA_TOPIC_MIN || line.length > TRIVIA_TOPIC_MAX) return null;
  if (!ALLOWED.test(line)) return null;
  if (!/\p{L}/u.test(line)) return null;
  if (line.split(" ").length > 5) return null;
  const key = line
    .toLocaleLowerCase("en")
    .replace(/['.]/g, "")
    .replace(/&/g, " and ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (key.length < TRIVIA_TOPIC_MIN) return null;
  return { label: line, key: key.slice(0, TRIVIA_TOPIC_MAX) };
}

/** A turned-away topic, kept for the guardian without its words: the hash of its key within this household. */
export function topicHash(householdId: string, key: string): string {
  return createHash("sha256").update(`trivia:${householdId}:${key}`).digest("hex");
}

// --- the rules' gate ---------------------------------------------------------------

/** Letters a child might swap in to get past a word list. */
function deLeet(key: string): string {
  return key.replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/\$/g, "s").replace(/@/g, "a");
}

type Rule = { reason: TriviaRejectReason; words: readonly string[]; bands?: readonly TriviaBand[] };

/**
 * Words that settle a topic on their own, whole words only ("skill" is not
 * "kill"). Kept to what is unambiguous for a child: anything that may be fine
 * ("world war 2" for a teen, "sharks") is the model's to judge, never refused
 * here. No slurs are written down here; hate beyond these is the model's.
 */
const RULES: readonly Rule[] = [
  { reason: "violence", words: ["murder", "murders", "murderer", "kill", "killing", "killings", "gore", "gory", "torture", "massacre", "massacres", "behead", "beheading", "beheadings", "stabbing", "stabbings", "terrorist", "terrorists", "terrorism", "school shooting", "mass shooting", "firearm", "firearms", "assault rifle", "bloodbath", "dismember", "dismemberment", "snuff"] },
  { reason: "sexual", words: ["sex", "sexy", "sexual", "porn", "porno", "pornography", "nude", "nudes", "naked", "nudity", "nsfw", "xxx", "hentai", "onlyfans", "erotic", "erotica", "fetish", "boobs", "penis", "vagina", "rape", "strip club", "stripper", "strippers", "hooker", "hookers", "prostitute", "prostitutes", "prostitution", "orgasm", "horny", "lingerie", "dating app", "hookup"] },
  { reason: "drugs", words: ["drug", "drugs", "cocaine", "heroin", "meth", "crystal meth", "weed", "marijuana", "cannabis", "ganja", "lsd", "ecstasy", "mdma", "vape", "vapes", "vaping", "cigarette", "cigarettes", "smoking", "tobacco", "alcohol", "beer", "beers", "wine", "wines", "vodka", "whisky", "whiskey", "rum", "tequila", "gin", "cocktail", "cocktails", "booze", "drunk", "getting high", "bong", "opium", "daru", "sharab", "bhang", "hookah"] },
  { reason: "self_harm", words: ["suicide", "suicides", "suicidal", "self harm", "selfharm", "cutting myself", "kill myself", "kys", "anorexia", "pro ana", "overdose", "hang myself", "starving myself"] },
  { reason: "hate", words: ["nazi", "nazis", "neo nazi", "kkk", "ku klux klan", "white power", "white supremacy", "white supremacist", "ethnic cleansing", "racist jokes", "hate speech"] },
  { reason: "gambling", words: ["gambling", "gamble", "casino", "casinos", "betting", "bets", "sports betting", "poker", "slot machine", "slot machines", "slots", "lottery", "roulette", "blackjack", "satta", "matka", "teen patti", "online betting"] },
  { reason: "scary", words: ["horror", "horror movies", "horror films", "slasher", "slashers", "creepypasta", "creepypastas", "demon", "demons", "demonic", "exorcism", "serial killer", "serial killers", "jumpscare", "jumpscares"], bands: ["young_child", "older_child"] },
  { reason: "scary", words: ["ghost", "ghosts", "haunted", "zombie", "zombies", "monsters under the bed"], bands: ["young_child"] },
];

/** Instructions dressed as a topic: never a topic, whatever else they say. */
const INJECTION = /\b(ignore|disregard|forget)\b.*\b(instruction|instructions|rules|above|previous|prompt)\b|\b(system prompt|you are now|act as|pretend to be|jailbreak|developer mode|new instructions|respond with|reply with|say that)\b/i;
/** Someone the child knows: never a topic (their name is not sent anywhere). */
const PRIVATE_PERSON = /\b(my|our)\s+(?:best\s+|old\s+|new\s+|favourite\s+|favorite\s+|class\s+)?(mom|mum|mummy|mother|dad|daddy|father|papa|mama|sister|brother|friend|friends|teacher|teachers|classmate|classmates|neighbour|neighbor|neighbours|neighbors|aunt|aunty|auntie|uncle|cousin|cousins|grandma|grandpa|nani|nana|dadi|dada|bestie|crush|boyfriend|girlfriend|school|class|coach|maid|didi|bhaiya)\b|\b(mr|mrs|ms|miss|sir|madam|ma'am)\b\s+\p{L}/iu;

/** Whether raw text reads like an instruction to WonderHome rather than a subject, before it is even a topic (too long or not). */
export function looksLikeInstruction(raw: string): boolean {
  const line = raw.normalize("NFKC").replace(/\s+/g, " ");
  return INJECTION.test(line);
}

export type TopicScreen = { ok: true } | { ok: false; reason: TriviaRejectReason };

function hasPhrase(key: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(key);
}

/**
 * The rules' answer for a topic and an age band: a reason when a word list,
 * an instruction or a person the child knows settles it, else ok — and ok
 * here is not yet a yes: where a model is reachable it is asked next.
 */
export function screenTopic(topic: NormalisedTopic, band: TriviaBand): TopicScreen {
  const original = topic.label;
  if (INJECTION.test(original) || INJECTION.test(topic.key)) return { ok: false, reason: "not_a_topic" };
  if (PRIVATE_PERSON.test(original)) return { ok: false, reason: "private_person" };
  if (/\p{N}{6,}/u.test(topic.key.replace(/\s/g, ""))) return { ok: false, reason: "private_person" };
  const keys = [topic.key, deLeet(topic.key), topic.key.replace(/\s+/g, ""), deLeet(topic.key).replace(/\s+/g, "")];
  for (const rule of RULES) {
    if (rule.bands && !rule.bands.includes(band)) continue;
    if (rule.words.some((word) => keys.some((key) => hasPhrase(key, word)))) return { ok: false, reason: rule.reason };
  }
  return { ok: true };
}

// --- cards and what comes next -------------------------------------------------------

export type TriviaCard = {
  /** "c:<id>" for a built-in card; generated cards get their own prefix. */
  key: string;
  kind: TriviaKind;
  /** The fact, or the question. At most two short sentences. */
  text: string;
  /** A quiz's choices, 3–4, and the index of the right one. */
  options?: readonly string[];
  answer?: number;
  /** One line said after a quiz answer: why the right one is right. */
  explain?: string;
  /** The built-in category it belongs to ("space", "animals", …). */
  category: string;
  difficulty: TriviaLevel;
  /** The language the words are in. */
  language: string;
};

export type ShownCard = { key: string; kind: TriviaKind; topic: string; answeredCorrect: boolean | null };

export type TopicCards = {
  /** The child's own words for the topic, or the category's name when the card is from another topic. */
  topic: string;
  cards: readonly TriviaCard[];
};

export type PickMode = "open" | "another" | "next_topic";

export type Pick = { card: TriviaCard; topic: string; topicIndex: number };

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * The next card for a child. `topics` are in the child's order; `history` is
 * newest first. Rules, in order:
 *  - the topic: "another" keeps the last card's topic; "open" and "next_topic"
 *    move to the topic after it, so each opening brings a different one;
 *  - the kind: the other one from the last card ("Did you know?" then "Quiz
 *    time!"), unless the topic has none of it;
 *  - never the last card again, whatever else;
 *  - cards not yet seen first, then the one seen longest ago;
 *  - among those, the nearest to the child's difficulty;
 *  - a tie is broken by the day, so two children (or two days) differ.
 * Null only when there is no card at all.
 */
export function pickNextCard(input: { topics: readonly TopicCards[]; history: readonly ShownCard[]; level: TriviaLevel; mode: PickMode; seed: string }): Pick | null {
  const topics = input.topics.filter((topic) => topic.cards.length > 0);
  if (topics.length === 0) return null;
  const last = input.history[0] ?? null;
  const lastTopicIndex = last ? topics.findIndex((topic) => topic.topic === last.topic) : -1;
  let topicIndex: number;
  if (input.mode === "another" && lastTopicIndex >= 0) topicIndex = lastTopicIndex;
  else if (lastTopicIndex >= 0) topicIndex = (lastTopicIndex + 1) % topics.length;
  else topicIndex = stableHash(input.seed) % topics.length;

  const seenAt = new Map<string, number>();
  input.history.forEach((shown, index) => {
    if (!seenAt.has(shown.key)) seenAt.set(shown.key, index);
  });
  const wantKind: TriviaKind | null = last ? (last.kind === "fact" ? "quiz" : "fact") : null;

  // Try the chosen topic first, then the others in order, so one exhausted topic never leaves the card empty.
  for (let step = 0; step < topics.length; step += 1) {
    const index = (topicIndex + step) % topics.length;
    const topic = topics[index]!;
    const candidates = topic.cards.filter((card) => card.key !== last?.key);
    if (candidates.length === 0) continue;
    const ofKind = wantKind ? candidates.filter((card) => card.kind === wantKind) : [];
    const pool = ofKind.length > 0 ? ofKind : candidates;
    const ranked = [...pool].sort((a, b) => {
      // Unseen (Infinity) before seen; seen longest ago (largest index) first.
      const seenA = seenAt.get(a.key) ?? Number.POSITIVE_INFINITY;
      const seenB = seenAt.get(b.key) ?? Number.POSITIVE_INFINITY;
      if (seenA !== seenB) return seenB - seenA;
      const nearA = Math.abs(a.difficulty - input.level);
      const nearB = Math.abs(b.difficulty - input.level);
      if (nearA !== nearB) return nearA - nearB;
      return stableHash(`${input.seed}:${a.key}`) - stableHash(`${input.seed}:${b.key}`);
    });
    return { card: ranked[0]!, topic: topic.topic, topicIndex: index };
  }
  return null;
}

/** Right answers in a row, newest first, counting only quizzes that were answered. */
export function quizStreak(history: readonly ShownCard[]): number {
  let streak = 0;
  for (const shown of history) {
    if (shown.kind !== "quiz" || shown.answeredCorrect === null) continue;
    if (!shown.answeredCorrect) break;
    streak += 1;
  }
  return streak;
}

/** "Too hard" makes it one step easier, "too easy" one harder, within 1–3. */
export function adjustLevel(level: TriviaLevel, feedback: "too_hard" | "too_easy"): TriviaLevel {
  return clampLevel(level + (feedback === "too_easy" ? 1 : -1));
}
