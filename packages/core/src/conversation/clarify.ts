import { carriesPlaceDetail } from "../homeplaces/request";
import type { DetailField } from "../homesend/completeness";
import type { HomeSendKind } from "../homesend/items";
import { readDetailAnswer } from "../hometalk/detail-answers";
import type { HouseholdIntent, IntentTarget } from "./intent";
import { readItemAmount } from "./quantity";
import { chooseCandidate, readFocus } from "./references";

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
  // HomeTalk's question about a HomeSend item (`hometalk/intake-questions.ts`).
  if (pending.action === "complete_homesend_item") return answerIntakeDetail(pending, utterance, context);

  // "How much coconut oil should I add?"
  if (pending.parameters.awaiting === "quantity") return answerQuantity(pending, utterance, context);

  // A grounding question (Wave 4): who, which day, or which of these.
  const awaiting = pending.parameters.awaiting;
  if (awaiting === "member" || awaiting === "day" || awaiting === "referent") {
    return answerGroundingQuestion(pending, utterance, context);
  }

  switch (pending.action) {
    // A free answer to "which dish?", "what needs a repair?" or "which piece
    // of school work?" when there was nothing on record to offer.
    case "plan_meal":
    case "raise_service_request":
    case "complete_school_item": {
      const answer = stripFiller(utterance).replace(/[.!?]+$/, "").replace(/^(?:the|a|an)\s+/i, "").trim();
      if (!answer || answer.split(/\s+/).length > 6 || NEW_REQUEST.test(answer)) return null;
      const rest = withoutGroundingState(pending.parameters);
      const named =
        pending.action === "plan_meal"
          ? { what: answer, mealName: answer.charAt(0).toUpperCase() + answer.slice(1), diet: undefined }
          : pending.action === "raise_service_request"
            ? { asset: answer }
            : { title: answer };
      return {
        actorMemberId: context.actorMemberId,
        channel: context.channel,
        utterance,
        action: pending.action,
        target: pending.target,
        parameters: Object.fromEntries(Object.entries({ ...rest, ...named }).filter(([, value]) => value !== undefined)),
        confidence: 0.9,
      };
    }

    // A place question HomeTalk left open — "whose school?", or "say dinner,
    // a park or a mall to narrow it" — answered with a few words that carry
    // a kind, a day, where or a child's name. The route reads them together
    // with the request that asked (the owner's report, 2026-10-21: "dinner
    // nearby home" was read alone and got the same question back).
    case "find_places": {
      const answer = stripFiller(utterance).replace(/^(?:what|how) about\s+/i, "").replace(/[.!?]+$/, "").trim();
      const names = Array.isArray(pending.parameters.children) ? pending.parameters.children.filter((name): name is string => typeof name === "string") : [];
      if (!answer || answer.split(/\s+/).length > 8 || NEW_REQUEST.test(answer) || !carriesPlaceDetail(answer, names)) return null;
      return {
        actorMemberId: context.actorMemberId,
        channel: context.channel,
        utterance,
        action: "find_places",
        target: { kind: "unspecified" },
        parameters: { request: answer, followUp: true },
        confidence: 0.9,
      };
    }

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
        // One named thing is one item — the shape the grocery write takes.
        // The named things replace whatever stood in for them — "that", or
        // "everything for the pasta" when no recipe said what that was.
        parameters: { ...withoutItems(withoutGroundingState(pending.parameters)), items, ...(items.length === 1 ? { item: items[0] } : {}) },
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

/** How long an answer to each grounding question can plausibly be. */
const awaitingWordLimit: Record<string, number> = { member: 4, day: 5, referent: 6, quantity: 8 };

/** "That's enough", "none", "no thanks": leave the list as it is. */
const ENOUGH = /^(?:no|nope|none|nothing|nothing more|no more|no need|no thanks?|no,? thank you|enough|that'?s enough|it'?s enough|that'?s fine|that'?s all|fine as it is|leave it|leave it as it is|leave them|skip|skip it|don'?t add (?:it|them|any(?:thing)?)|cancel)(?:,?\s*(?:thanks|thank you))?$/i;

/** Lowercase, without a plural "s"/"es", for matching an answer's item to the one asked about. */
function itemKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/(?:es|s)$/, "");
}

/**
 * The answer to "How much coconut oil should I add?" (the owner,
 * 2026-10-26): "2 litres", "1 bottle", "3", "a dozen", "2 of each", or
 * "1 litre coconut oil and 6 eggs" for several. Each amount is read by the
 * rules (`quantity.ts`) and put back in front of the item it is for, so the
 * add runs exactly as if it had been said in the first place. "That's
 * enough" leaves the list as it is. A short answer that carries no amount
 * comes back unchanged, so grounding asks again — the second time
 * differently. A new request is somebody moving on (null).
 */
function answerQuantity(pending: PendingClarification, utterance: string, context: { actorMemberId: string; channel: "text" | "voice" }): HouseholdIntent | null {
  const asked = Array.isArray(pending.parameters.quantityFor) ? (pending.parameters.quantityFor as unknown[]).filter((name): name is string => typeof name === "string") : [];
  const raw = utterance.trim().replace(/[.!]+$/, "").trim();
  if (!raw || asked.length === 0) return null;
  const base = { actorMemberId: context.actorMemberId, channel: context.channel, utterance, action: pending.action, target: pending.target, confidence: 0.9 };
  const rest = withoutGroundingState(pending.parameters);
  if (ENOUGH.test(raw)) return { ...base, parameters: { ...rest, keepAsIs: true } };

  const filled = stripFiller(raw);
  const said = filled.replace(ORDER_VERBS, "").replace(DESTINATION, " ").replace(/\s{2,}/g, " ").replace(/\s+(?:of\s+)?each$/i, "").trim();
  if (!said || said.split(/\s+/).length > awaitingWordLimit.quantity!) return null;

  const amounts = new Map<string, string>();
  const parts = said.split(CONNECTORS).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const read = readItemAmount(part);
    if (read.amount && read.item) {
      const meant = asked.find((name) => itemKey(name) === itemKey(read.item)) ?? asked.find((name) => itemKey(name).includes(itemKey(read.item)) || itemKey(read.item).includes(itemKey(name)));
      if (meant) amounts.set(meant, part);
      continue;
    }
    // An amount on its own is for the one item asked about, or "2 of each".
    if (parts.length === 1) {
      for (const name of asked) {
        const composed = `${part} ${name}`;
        const back = readItemAmount(composed);
        if (back.amount && itemKey(back.item) === itemKey(name)) amounts.set(name, composed);
      }
    }
  }
  // Nothing readable: a request of its own is somebody moving on; anything
  // else is the same question, which grounding asks again differently.
  if (amounts.size === 0) {
    if (NEW_REQUEST.test(filled)) return null;
    return { ...base, parameters: rest };
  }
  const names = typeof pending.parameters.item === "string" ? [pending.parameters.item] : Array.isArray(pending.parameters.items) ? (pending.parameters.items as unknown[]).filter((name): name is string => typeof name === "string") : asked;
  const items = names.map((name) => amounts.get(name) ?? name);
  // An item still without an amount is asked about again, alone.
  return { ...base, parameters: { ...withoutItems(rest), items, ...(items.length === 1 ? { item: items[0] } : {}) } };
}

/** Words that make a reply a request of its own rather than an answer. */
const NEW_REQUEST = /\b(?:is|are|was|were|will|won'?t|isn'?t|can'?t|add|put|pay|order|need|remind|move|plan|book|remove|mark|log|record|cancel|what|when|who|how|why)\b/i;

/**
 * Whether what was just said is a whole new request rather than an attempt to
 * answer the open question: it asks for something itself, or is longer than
 * an answer would be. Asking the question again after a fresh request is not
 * the household repeating itself (the owner, 2026-10-26: "Add 3 litres of oil
 * to the groceries" twice met "I still cannot tell which items you mean").
 */
export function isFreshRequest(utterance: string, awaiting: unknown): boolean {
  const said = stripFiller(utterance).replace(/[.!?]+$/, "").trim();
  return NEW_REQUEST.test(said) || said.split(/\s+/).length > (awaitingWordLimit[String(awaiting)] ?? 4);
}

/**
 * The answer to "When is it due?", "How much should I get?" or "Who is it
 * for — Asmi or Manan?" about a HomeSend item. Taken only when it reads as
 * that detail (or as "skip"); a new request ("add milk", "what's on
 * tomorrow?") is somebody moving on and is read as that request instead.
 * The executor reads the value again, in the household's own time.
 */
function answerIntakeDetail(pending: PendingClarification, utterance: string, context: { actorMemberId: string; channel: "text" | "voice" }): HouseholdIntent | null {
  const said = utterance.trim().replace(/[.!]+$/, "").trim();
  const field = pending.parameters.field as DetailField | undefined;
  const kind = pending.parameters.kind as HomeSendKind | undefined;
  if (!said || !field || !kind || said.split(/\s+/).length > 8) return null;
  const skip = readDetailAnswer(kind, "title", said, { timezone: "UTC", now: new Date() }) === "skip";
  if (!skip && NEW_REQUEST.test(stripFiller(said))) return null;
  // A short reply that isn't a new request is an attempt at the answer even when it can't be read
  // ("lots"): the executor reads it again and asks once more, politely (design §5).
  if ((field === "child" || field === "person") && said.split(/\s+/).length > 4) return null;
  return {
    action: "complete_homesend_item",
    actorMemberId: context.actorMemberId,
    channel: context.channel,
    utterance,
    target: { kind: "unspecified" },
    parameters: { ...pending.parameters, answer: said },
    confidence: 0.95,
  };
}

/** A pending clarification's bookkeeping, which must not ride into the answered intent. */
function withoutGroundingState(parameters: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...parameters };
  delete rest.awaiting;
  delete rest.candidates;
  delete rest.quantityFor;
  return rest;
}

/** What stood in for the items, which a named answer replaces. */
function withoutItems(parameters: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...parameters };
  delete rest.item;
  delete rest.items;
  delete rest.ingredientsOf;
  return rest;
}

/**
 * The answer to "Who did you mean?", "Which day?" or "Do you mean X or Y?",
 * folded back into the request that asked it. The answer is not trusted as
 * resolved here — the next grounding pass resolves it like any other
 * mention, so a second unclear answer gets the escalated question, never a
 * guess.
 */
function answerGroundingQuestion(
  pending: PendingClarification,
  utterance: string,
  context: { actorMemberId: string; channel: "text" | "voice" },
): HouseholdIntent | null {
  const answer = stripFiller(utterance)
    .replace(/[.!?]+$/, "")
    .replace(/^(?:no,?\s+)?(?:i meant|i mean|it'?s|it is|for)\s+/i, "")
    .trim();
  // An answer names someone, a day or one of the choices. A whole new request
  // ("Sunita is away next Friday") is somebody moving on, and must be read
  // as that request — never swallowed as the answer to the last question.
  if (!answer || answer.split(/\s+/).length > (awaitingWordLimit[String(pending.parameters.awaiting)] ?? 4) || NEW_REQUEST.test(answer)) return null;
  const { awaiting, candidates } = pending.parameters;
  const rest = withoutGroundingState(pending.parameters);
  const base = { actorMemberId: context.actorMemberId, channel: context.channel, utterance, action: pending.action, confidence: 0.9 };

  if (awaiting === "member") {
    const choice = chooseCandidate(answer, readFocus(candidates));
    const reference = choice?.label ?? answer;
    return { ...base, target: { kind: "member", reference: reference.toLowerCase() }, parameters: { ...rest, ...(choice?.entityId ? { memberId: choice.entityId } : {}) } };
  }
  if (awaiting === "day") {
    return { ...base, target: pending.target, parameters: { ...rest, when: answer } };
  }
  // A choice between named candidates.
  const choice = chooseCandidate(answer, readFocus(candidates));
  if (!choice) return null;
  if (pending.action === "make_payment" || pending.action === "record_bill_payment" || pending.action === "set_bill_amount") {
    return { ...base, target: { kind: "bill", reference: choice.label }, parameters: { ...rest, billLabel: choice.label, ...(choice.entityId ? { billId: choice.entityId } : {}) } };
  }
  // The chosen record, by the id the question offered — which grounding
  // checks again against what is actually open before anything is done.
  if (pending.action === "complete_school_item" || pending.action === "adjust_schedule") {
    return { ...base, target: pending.target, parameters: { ...rest, title: choice.label, ...(choice.entityId ? { schoolItemId: choice.entityId } : {}) } };
  }
  if (pending.action === "raise_service_request") {
    return { ...base, target: pending.target, parameters: { ...rest, asset: choice.label } };
  }
  if (pending.action === "plan_meal") {
    const withoutDiet = { ...rest };
    delete withoutDiet.diet;
    return { ...base, target: pending.target, parameters: { ...withoutDiet, what: choice.label, mealName: choice.label, ...(choice.entityId ? { recipeId: choice.entityId } : {}) } };
  }
  return { ...base, target: pending.target, parameters: { ...rest, item: choice.label } };
}

/**
 * The second ask, which must not be the first ask again.
 *
 * Says what was heard, names what is missing, and shows the shape of an
 * answer that works. A household that has already repeated itself is owed
 * a different question, not a louder one.
 */
export function escalatedQuestion(pending: PendingClarification): string {
  switch (pending.parameters.awaiting) {
    case "member":
      return 'Sorry, I still couldn\'t tell who you mean. Could you say their name as your household has it — for example "Asmi"? I\'ll take it from there.';
    case "day":
      return [
        "Sorry, I still couldn't pin down when. Could you say it one of these ways?",
        '- "later today" or "in 2 hours"',
        '- "tomorrow at 9am" or "next Friday"',
        '- a date, like "2 Oct"',
      ].join("\n");
    case "quantity": {
      const asked = Array.isArray(pending.parameters.quantityFor) ? (pending.parameters.quantityFor as unknown[]).filter((name): name is string => typeof name === "string") : [];
      const what = asked.length === 1 ? ` of ${asked[0]!.toLowerCase()}` : "";
      return [
        `Sorry, I didn't catch how much${what}. Could you say it one of these ways?`,
        '- "2 litres" or "500 g"',
        '- "1 bottle" or "2 packets"',
        '- just a number, like "3"',
        `Or say "that's enough" to leave ${asked.length > 1 ? "them" : "it"}.`,
      ].join("\n");
    }
    case "referent": {
      const named = readFocus(pending.parameters.candidates).map((candidate) => `- ${candidate.label}`);
      return named.length > 0
        ? ["Sorry, I still couldn't tell which one you mean. Could you pick one?", ...named, "Or name the thing itself."].join("\n")
        : "Sorry, I still couldn't tell which one you mean. Could you name the thing itself? I'll take it from there.";
    }
  }
  const choices = readFocus(pending.parameters.candidates).map((candidate) => `- ${candidate.label}`);
  switch (pending.action) {
    case "order_items":
    case "add_to_list":
      return [
        choices.length > 0 ? "Sorry, I still couldn't tell which one you'd like. Could you pick one?" : "Sorry, I still couldn't tell which items you'd like. Could you name each one with how much you need? For example:",
        ...(choices.length > 0 ? choices : ["- 3 eggs", "- 1 packet of milk"]),
        "You can also add them yourself on the Groceries screen.",
      ].join("\n");
    case "make_payment":
      return [
        "Sorry, I still don't have enough to pay anything safely. Could you tell me:",
        "- the bill, by name",
        "- the amount",
        'For example "pay the electricity bill, 2400". Nothing is paid until you confirm it.',
      ].join("\n");
    case "assign_responsibility":
      return "Sorry, I still don't know who should take it on. Could you give me a name from your household? I'll set it up.";
    case "adjust_schedule":
      return [
        "Sorry, I still need two things. Could you tell me:",
        "- what moves",
        "- and when to",
        'For example "move karate to Friday at 5".',
      ].join("\n");
    default:
      return "Sorry, I'm still not following. Could you say it another way, or tell me which part of the home it's about? I'll take it from there.";
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
