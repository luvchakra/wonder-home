import type { Translate, TranslationKey } from "../i18n/translate";
import type { Memory } from "./memory";

/**
 * HomeTalk's welcome (task: the conversation after family setup is done).
 *
 * Once setup is finished, HomeTalk opens with a welcome: who is in the
 * household as WonderHome has it, what it will look after, the three ways to
 * talk to it — then a few questions, one at a time, whose answers it keeps as
 * the household's own statements. Every word is the catalog's and every rule
 * is here, so it costs no model call and says the same thing in every
 * language. An answer is never interpreted: it is kept as said, under a
 * topic, for the household to correct in HomeBrain Review.
 */

export const WELCOME_TOPICS = ["food", "dislikes", "together", "pets"] as const;
export type WelcomeTopic = (typeof WELCOME_TOPICS)[number];

export type WelcomeHousehold = {
  /** The person being welcomed, by the name they go by. */
  name: string;
  /** Everyone in the household other than helpers, in the order they were added. */
  people: string[];
  helpers: string[];
  pets: string[];
};

/** "Asmi, Manan and Kunal", in the reader's language. */
export function listOf(names: readonly string[], language: string): string {
  try {
    return new Intl.ListFormat(language, { type: "conjunction", style: "long" }).format(names);
  } catch {
    return names.join(", ");
  }
}

/** The opening messages, in order: who we are and who you are, then how to talk, then the first question. */
export function welcomeOpening(t: Translate, language: string, household: WelcomeHousehold): string[] {
  const about = [t("welcome.intro", { name: household.name })];
  if (household.people.length > 0) about.push(t("welcome.household", { people: listOf(household.people, language) }));
  if (household.pets.length > 0) about.push(t("welcome.pets", { pets: listOf(household.pets, language) }));
  if (household.helpers.length > 0) about.push(t("welcome.helpers", { helpers: listOf(household.helpers, language), count: household.helpers.length }));
  about.push(t("welcome.what"));
  return [about.join(" "), `${t("welcome.howTo")} ${t("welcome.getToKnow")}`, welcomeQuestion(t, language, "food", household)];
}

export function welcomeQuestion(t: Translate, language: string, topic: WelcomeTopic, household: Pick<WelcomeHousehold, "pets">): string {
  if (topic === "pets") {
    if (household.pets.length === 0) return t("welcome.q.noPets");
    if (household.pets.length === 1) return t("welcome.q.petOne", { pet: household.pets[0]! });
    return t("welcome.q.petMany", { pets: listOf(household.pets, language) });
  }
  return t(`welcome.q.${topic}` as TranslationKey);
}

export function nextTopic(topic: WelcomeTopic): WelcomeTopic | null {
  const index = WELCOME_TOPICS.indexOf(topic);
  return WELCOME_TOPICS[index + 1] ?? null;
}

/** "Skip", "later", "not now", "stop" — the person would rather not, so the welcome ends. */
export function isSkip(utterance: string): boolean {
  return SKIP.test(utterance.normalize("NFC").trim());
}

/**
 * The whole utterance is a skip: English, plus the word each catalog's
 * "welcome.getToKnow" tells a person to say, and a natural "later"/"not now".
 * Compared in NFC so a Devanagari nukta matches however it was typed.
 */
const SKIP = new RegExp(
  "^(?:" +
    [
      "skip|skip it|skip this|later|not now|maybe later|stop|no thanks|no thank you|let'?s skip|enough",
      "छोड़ो|छोड़ दो|बाद में|अभी नहीं", // hi
      "वगळा|वगळ|नंतर|आत्ता नको|आता नको", // mr
      "überspringen|später|jetzt nicht", // de
      "saltar|sáltalo|luego|más tarde|ahora no", // es
      "passer|on passe|plus tard|pas maintenant", // fr
      "跳过|以后再说|下次吧|先不了", // zh
      "تخطي|تخطى|تخطَّ|لاحقا|لاحقًا|ليس الآن", // ar
    ].join("|").normalize("NFC") +
    ")[.!।。！]*$",
  "iu",
);

/** "No", "nothing", "none" — an answer, but nothing to remember. */
export function isNothing(utterance: string): boolean {
  return /^(?:no|nope|nothing|none|not really|nothing really|no one|nobody|n\/a|na)[.!]*$/i.test(utterance.trim());
}

const STATEMENT: Record<WelcomeTopic, string> = {
  food: "The family loves to eat",
  dislikes: "Not eaten or not liked in the family",
  together: "The family enjoys doing together",
  pets: "About the household's pets",
};

/**
 * The answer as a belief: the household's own words under its topic,
 * learned (not confirmed) until someone certifies it, and stated by the
 * person — so a later answer to the same question replaces it.
 */
export function welcomeMemory(topic: WelcomeTopic, answer: string, sessionId: string): Memory | null {
  const said = answer.trim().replace(/\s+/g, " ").slice(0, 280);
  if (!said || isNothing(said)) return null;
  return {
    scope: "household",
    memberId: null,
    category: "preference",
    key: `household.welcome.${topic}`,
    value: { statement: `${STATEMENT[topic]}: ${said}`, topic, said },
    sourceType: "conversation",
    sourceId: sessionId,
    confidence: 0.9,
    // Confirmed from the start, like everything a member tells HomeTalk (the owner, 2026-10-19).
    status: "confirmed",
  };
}

export type WelcomeStep = {
  /** What to say back, in the reader's language. */
  reply: string;
  /** The same, in English — the record. */
  english: string;
  /** The question now waiting, or null when the welcome is over. */
  topic: WelcomeTopic | null;
  memory: Memory | null;
};

/** An answer to the welcome's question: kept, then the next question — or the end. */
export function answerWelcome(
  input: { topic: WelcomeTopic; answer: string; sessionId: string; household: Pick<WelcomeHousehold, "pets"> },
  words: { t: Translate; language: string; english: Translate },
): WelcomeStep {
  const step = (t: Translate, language: string, memory: Memory | null, next: WelcomeTopic | null, skipped: boolean) => {
    if (skipped) return t("welcome.skipped");
    const ack = memory ? t("welcome.ack") : t("welcome.ackNone");
    return next ? `${ack} ${welcomeQuestion(t, language, next, input.household)}` : `${ack} ${t("welcome.done")}`;
  };
  const skipped = isSkip(input.answer);
  const memory = skipped ? null : welcomeMemory(input.topic, input.answer, input.sessionId);
  const next = skipped ? null : nextTopic(input.topic);
  return {
    reply: step(words.t, words.language, memory, next, skipped),
    english: step(words.english, "en", memory, next, skipped),
    topic: next,
    memory,
  };
}
