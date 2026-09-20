import type { HouseholdIntent, IntentTarget } from "./intent";

/**
 * Answering the question WonderHome just asked (story 04-011).
 *
 * The defect this exists to kill: the assistant asked "What would you like
 * me to order?", the household answered, and it asked the identical
 * question again. And again. Every turn was read as a fresh request, so
 * nothing connected the answer to the question, and nothing noticed that
 * the same words had already failed once.
 *
 * Two rules follow, and they are both absolute:
 *
 *   1. **A clarifying question is a promise to use the answer.** What was
 *      asked, and what had already been understood, are carried forward;
 *      the next turn is read as the answer to it before it is read as
 *      anything else.
 *   2. **The same question is never asked twice.** If the answer still
 *      does not resolve it, the second attempt must say what *was*
 *      understood, name exactly what is missing, and show the shape of an
 *      answer that would work. A person repeating themselves louder is a
 *      product failing, not a person failing.
 *
 * Kept deterministic and separate from the model on purpose. This is the
 * path that has to work when a provider is slow, refused or not
 * configured, and "did you mean X" is precisely where a household loses
 * patience fastest.
 */

export type PendingClarification = {
  /** What we were trying to do, when we knew. */
  action: HouseholdIntent["action"];
  target: IntentTarget;
  parameters: Record<string, unknown>;
  /** The exact words asked, so they are never said a second time. */
  question: string;
  /** What the household said that prompted the question. */
  utterance: string;
  /** How many times this has now been asked. The second time reads differently. */
  asked: number;
};

/**
 * Conversational scaffolding that carries no meaning.
 *
 * "I just said", "I told you already" — a person only says these when the
 * assistant has failed them, so they show up in exactly the turns that
 * matter most and must not be mistaken for the thing being ordered.
 */
const FILLER = [
  /^(?:i (?:just |already )?(?:said|told you|asked for|want|wanted|need|would like)(?: you)?(?: to)?)\b/i,
  /^(?:as i said|like i said|again|no,?|yes,?|please|can you|could you|will you|would you|why don'?t you)\b/i,
  /^(?:it'?s|its|that'?s|thats)\b/i,
];

/** Verbs that mean "put this on a list", not part of what is being listed. */
const ORDER_VERBS = /^(?:order|reorder|buy|get|add|put|purchase|pick up|grab)\b(?:\s+(?:me|us))?\b/i;

/** Where the thing is going, said after it rather than before. */
const DESTINATION =
  /\b(?:for|to|on|in|into)\s+(?:the\s+)?(?:order|orders|list|lists|shopping(?:\s+list)?|groceries|grocery(?:\s+list)?|basket|cart)\b/gi;

const CONNECTORS = /\s*(?:,|;|\band\b|\balso\b|\bplus\b|&)\s*/i;

/** Plain "yes, that" answers, which say nothing new and must not look like an item. */
const CONTENTLESS = /^(?:that|those|it|them|the same|same|usual|the usual|ditto|as before)$/i;

export function stripFiller(utterance: string): string {
  let text = utterance.trim();
  // Repeatedly, because a frustrated person stacks them: "no, I just said…".
  for (let pass = 0; pass < 4; pass += 1) {
    const before = text;
    for (const pattern of FILLER) text = text.replace(pattern, "").trim();
    text = text.replace(/^[,:;-]\s*/, "").trim();
    if (text === before) break;
  }
  return text;
}

/**
 * The things a person named, from however they happened to say it.
 *
 * Deliberately forgiving about word order, because the way somebody says
 * this is not stable: "order 3 eggs and milk", "add 3 eggs for order and a
 * packet of milk for order", "3 eggs, milk". What matters is the nouns and
 * the quantities, not the sentence they arrived in.
 */
export function extractItems(utterance: string): string[] {
  let text = stripFiller(utterance);
  text = text.replace(ORDER_VERBS, "").trim();
  // "for order" / "to the shopping list" says where, not what. Removing it
  // before splitting is what stops "milk for order" becoming an item called
  // "milk for order".
  text = text.replace(DESTINATION, " ").replace(/\s{2,}/g, " ").trim();
  text = text.replace(/^[,:;-]\s*/, "").replace(/[.!?]+$/, "").trim();

  return text
    .split(CONNECTORS)
    .map((part) => part.replace(ORDER_VERBS, "").trim())
    .map((part) => part.replace(/^(?:a|an|the|some|of)\s+/i, "").trim())
    .map((part) => part.replace(/[.!?,;]+$/, "").trim())
    .filter((part) => part.length > 0 && part.length <= 80)
    .filter((part) => !CONTENTLESS.test(part))
    // A bare number is a quantity that lost its noun, never an item.
    .filter((part) => !/^\d+$/.test(part))
    .slice(0, 20);
}

/**
 * The answer, folded into the question it answers.
 *
 * Returns null when the new turn genuinely does not answer it — somebody
 * changing the subject mid-clarification is allowed, and their new request
 * must not be swallowed as an answer to the old one.
 */
export function answerClarification(
  pending: PendingClarification,
  utterance: string,
  context: { actorMemberId: string; channel: "text" | "voice" },
): HouseholdIntent | null {
  switch (pending.action) {
    case "order_items":
    case "add_to_list": {
      const items = extractItems(utterance);
      if (items.length === 0) return null;
      return {
        actorMemberId: context.actorMemberId,
        channel: context.channel,
        utterance,
        action: pending.action,
        // A list was implied by the question; saying which one is what the
        // question was for, so the answer inherits it.
        target:
          pending.target.kind === "unspecified"
            ? { kind: "list", reference: "groceries" }
            : pending.target,
        parameters: { ...pending.parameters, items },
        // High, and deliberately so: the household has now said this twice.
        // Treating a repeated answer as still uncertain is the behaviour
        // that made this loop in the first place.
        confidence: 0.9,
      };
    }

    default:
      return null;
  }
}

/**
 * The second ask, which must not be the first ask again.
 *
 * Says what was heard, names what is missing, and shows the shape of an
 * answer that works. A household that has already repeated itself is owed
 * a different question, not a louder one.
 */
export function escalatedQuestion(pending: PendingClarification): string {
  switch (pending.action) {
    case "order_items":
    case "add_to_list":
      return (
        "I still cannot tell which items you mean. Name them one by one and I will add them — " +
        'for example "3 eggs, 1 packet of milk". You can also add them directly on the Groceries screen.'
      );
    case "make_payment":
      return (
        "I still do not have enough to pay anything safely. Tell me the bill by name and the amount — " +
        'for example "pay the electricity bill, 2400". Nothing is paid until you confirm it.'
      );
    case "assign_responsibility":
      return "I still do not know who should take it on. Give me a name from your household and I will set it up.";
    case "adjust_schedule":
      return 'I still do not have both halves. Tell me what moves and when — for example "move karate to Friday at 5".';
    default:
      return (
        "I am still not following, and asking the same thing again will not help. " +
        "Say it in a different way, or tell me which part of the home it is about and I will take it from there."
      );
  }
}

/** What to carry into the next turn when a question was asked. */
export function clarificationFrom(input: {
  intent: HouseholdIntent;
  question: string;
  utterance: string;
  previous: PendingClarification | null;
}): PendingClarification {
  // Asking about the same thing again increments the count, which is what
  // `escalatedQuestion` reads. A different subject starts at one.
  const continuing = input.previous?.action === input.intent.action;
  return {
    action: input.intent.action,
    target: input.intent.target,
    parameters: input.intent.parameters,
    question: input.question,
    utterance: input.utterance,
    asked: continuing ? input.previous!.asked + 1 : 1,
  };
}
