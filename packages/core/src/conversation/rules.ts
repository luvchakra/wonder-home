import { APPOINTMENT_TYPES, type AppointmentType } from "../health/appointments";
import { readWhyQuestion } from "../homebrain/why";
import { extractItems } from "./clarify";
import type { HouseholdIntent, IntentAction } from "./intent";
import { parsePreference } from "./memory";
import { splitTrailingWhen } from "./temporal";

/**
 * Rule-based understanding of the ordinary ways people ask (module 04, and
 * the product-direction update's "Talk to WonderHome" as a primary control
 * surface).
 *
 * Sits between the exact-match fixtures and a model. The fixtures answer
 * only the sentences they were taught, which is right for a regression
 * suite and wrong for a person — "add a grocery item of milk" and "add
 * coriander to the grocery list" are the same request, and a household
 * that gets "I did not follow that" for the first one stops talking to the
 * product. A model answers both, but only once a key is configured and the
 * provider is reachable; these rules are what holds in between, and the
 * safety net when a model answers "unknown" for something it plainly is.
 *
 * Every rule is a request, never an authorization, exactly like a fixture
 * or a model's output: permission, autonomy and entitlement are decided
 * afterwards on the intent, not here. Confidence is set the way a careful
 * person would set it — high for a plain, harmless request; deliberately
 * below the consequential threshold for "pay it", where guessing costs
 * money — so the existing clarification path still asks rather than acts.
 */

type Rule = {
  pattern: RegExp;
  read: (match: RegExpMatchArray, utterance: string) => Omit<HouseholdIntent, "actorMemberId" | "channel" | "utterance" | "understanding"> | null;
};

const WHEN_WORDS = "today|tonight|tomorrow|this (?:week|weekend|month|morning|afternoon|evening)|next (?:week|weekend|month|\\w+day)|on \\w+day|\\w+day";

const LIST_WORDS = "(?:grocery|groceries|shopping)(?: list)?|list";

/** Strips leading filler ("okay", "please", "can you") so one rule reads many phrasings. */
function core(utterance: string): string {
  return utterance
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/^(?:ok(?:ay)?|so|hey|hi|hello|please|wonderhome|alright|right|um|uh|well)[,\s]+/i, "")
    .replace(/^(?:can|could|would|will) you (?:please )?/i, "")
    .replace(/^(?:please )?/i, "")
    .replace(/\s+please$/i, "")
    .replace(/\s+(?:right now|now|at the moment|at present|currently|for me|for us|these days)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(?:the|a|an|my|our)\s+/, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(".");
}

function lowerName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "Sunita" → "sunita"; "the younger one" keeps its words, for the resolver to read as a relationship or an age. */
function personReference(value: string): string {
  const words = value.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  return words.includes(" ") ? words.replace(/\s+/g, " ") : lowerName(words);
}

/** "dentist" → "dentist"; "my dentist" / "eye" / "skin" → the closest real appointment type; anything else → "other", never invented. */
const APPOINTMENT_TYPE_WORDS: Partial<Record<AppointmentType, readonly string[]>> = {
  dentist: ["dentist", "dental"],
  eye_care: ["eye", "eyes", "optometrist", "ophthalmologist"],
  physiotherapy: ["physio", "physiotherapy", "physiotherapist"],
  dermatology: ["skin", "derm", "dermatologist", "dermatology"],
  vaccination: ["vaccine", "vaccination", "jab", "shot"],
  mental_wellness: ["therapy", "therapist", "counsellor", "counselor", "psychiatrist", "psychologist"],
  diagnostic: ["scan", "x-ray", "xray", "blood test", "lab test", "diagnostic"],
  doctor: ["doctor", "gp", "physician", "checkup", "check-up"],
};

function matchAppointmentType(text: string): AppointmentType {
  const lower = text.toLowerCase();
  for (const type of APPOINTMENT_TYPES) {
    const words = APPOINTMENT_TYPE_WORDS[type];
    if (words?.some((word) => lower.includes(word))) return type;
  }
  return "other";
}

/** "3" or "three" → 3, for "I want to walk three times a week" as readily as the digit form. */
const WORD_COUNTS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function countWord(value: string): number {
  const lower = value.toLowerCase();
  return WORD_COUNTS[lower] ?? Number(lower);
}

function item(value: string): string {
  return value
    .trim()
    .replace(/^(?:a|an|some|the|more)\s+/i, "")
    // "the same milk we bought last week" is the milk — the matcher finds
    // the one already tracked, so "same" never becomes part of a name.
    .replace(/^same\s+/i, "")
    .replace(/\s+(?:that\s+)?(?:we|i)\s+(?:bought|got|had|ordered|always get|usually get)(?:\s+(?:last\s+\w+|before|yesterday|last time))?$/i, "")
    .replace(/\s+(?:too|as well|also)$/i, "")
    .trim();
}

const REMIND_WHEN = `(?:${WHEN_WORDS})(?:\\s+(?:morning|afternoon|evening|night|after school|before dinner))?|after school|before dinner|this (?:morning|afternoon|evening)|in the (?:morning|afternoon|evening)`;

const TIME_WORDS = "\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?|noon|midday";

/** A reminder's parameters: what, and when as the household said it. */
function reminder(what: string, when: string | undefined, time: string | undefined): Record<string, unknown> {
  // "…coriander while I'm on my way back from office", "…the plumber later":
  // a when the pattern could not capture, split off the thing itself.
  const split = when ? null : splitTrailingWhen(what.trim().replace(/[.!]+$/, ""));
  if (split) {
    what = split.what;
    when = split.when;
  }
  return {
    what: what.trim().replace(/[.!]+$/, ""),
    ...(when ? { when: when.trim().toLowerCase() } : {}),
    ...(time ? { time: time.trim().toLowerCase() } : {}),
  };
}

/**
 * "Milk and bananas" is two things to add, not one called "milk and
 * bananas" — split the way an order's items are, so each is matched,
 * added or found already there on its own.
 */
function withItems(intent: Omit<HouseholdIntent, "actorMemberId" | "channel" | "utterance" | "understanding">) {
  if ((intent.action !== "add_to_list" && intent.action !== "remove_from_list") || typeof intent.parameters.item !== "string") return intent;
  if (!/,|;|&|\band\b|\bplus\b/i.test(intent.parameters.item)) return intent;
  const items = extractItems(intent.parameters.item);
  if (items.length < 2) return intent;
  const parameters: Record<string, unknown> = { ...intent.parameters, items };
  delete parameters.item;
  return { ...intent, parameters };
}

const RULES: readonly Rule[] = [
  // --- "Why?" — answered from what was recorded (HomeBrain 2.0, Wave 2 §10) --
  {
    // "Why are you asking for approval?", "Where did this date come from?",
    // "What did I just send you?" are questions about WonderHome's own
    // record, not about the home: read first, so no status rule below takes
    // "what changed since yesterday" for a general catch-up. The answer is
    // assembled from evidence on the server; nothing here decides it.
    pattern: /^.+$/,
    read: (_match, utterance) => {
      const why = readWhyQuestion(utterance);
      if (!why) return null;
      return {
        action: "ask_status",
        target: { kind: "unspecified" },
        parameters: { scope: "explain", explain: why.topic, ...(why.subject ? { subject: why.subject } : {}) },
        confidence: 0.96,
      };
    },
  },

  // --- Greetings, thanks, help ---------------------------------------------
  {
    // A hello in each language WonderHome speaks (story 22-005), so a
    // household answered by the rules alone is still greeted, not puzzled.
    pattern: /^(?:hi|hello|hey|hiya|good (?:morning|afternoon|evening|night)|namaste|namaskar|नमस्ते|नमस्कार|हैलो|hola|buenos días|buenas tardes|bonjour|bonsoir|salut|hallo|guten (?:morgen|tag|abend)|مرحبا|أهلا|السلام عليكم)(?:\s+(?:there|wonderhome))?$/i,
    read: () => ({ action: "greet", target: { kind: "unspecified" }, parameters: { kind: "greeting" }, confidence: 0.99 }),
  },
  {
    pattern: /^(?:thanks|thank you|thx|cheers|great,? thanks|perfect|awesome|nice|धन्यवाद|शुक्रिया|dhanyavad|shukriya|gracias|merci|danke|شكرا)(?:\s+\w+)?$/i,
    read: () => ({ action: "greet", target: { kind: "unspecified" }, parameters: { kind: "thanks" }, confidence: 0.99 }),
  },
  {
    pattern: /^(?:help(?: me)?|what can you do(?: for me)?|what do you do|how do (?:you|i) (?:work|use this)|what can i (?:ask|say)(?: you)?|what are you|who are you)$/i,
    read: () => ({ action: "greet", target: { kind: "unspecified" }, parameters: { kind: "help" }, confidence: 0.99 }),
  },

  // --- Status: what is going on ---------------------------------------------
  {
    pattern: new RegExp(
      `^(?:(?:tell|show|give) me |what(?:'s| is|s) )?(?:what(?:'s| is|s) )?(?:going on|happening|up|new|the status|the summary|the latest|on my plate)(?: (?:in|at|with|around) (?:my |the |our )?(?:home|house|household|family|place))?(?: (${WHEN_WORDS}))?$`,
      "i",
    ),
    read: (match) => ({ action: "ask_status", target: { kind: "unspecified" }, parameters: withWhen({ scope: "home" }, match[1]), confidence: 0.95 }),
  },
  {
    pattern: /^(?:what|anything|is there anything)(?: that)? (?:needs?|requires?) (?:my |our )?(?:attention|doing|looking at|me)(?: (?:today|now|this week))?$|^(?:what|anything|is there anything)(?: that)? (?:do )?(?:i|we) (?:need|should|have) to (?:do|know|look at|handle)(?: (?:today|now|this week|tomorrow))?$|^what are you (?:handling|doing|working on|taking care of)$|^(?:catch me up|update me|status|summary|brief me|how(?:'s| is| are) (?:everything|things|it going|the (?:house|home|family)))$/i,
    read: () => ({ action: "ask_status", target: { kind: "unspecified" }, parameters: { scope: "home" }, confidence: 0.95 }),
  },
  {
    pattern: new RegExp(`^(?:show me |what(?:'s| is|s) (?:on )?|tell me )?(?:my |our |the )?(?:schedule|plan|plans|agenda|calendar|day)(?: (?:for |on ))?(${WHEN_WORDS})?$|^what(?:'s| is|s) (?:on|happening) (${WHEN_WORDS})$|^(?:show me |what(?:'s| is|s) )(${WHEN_WORDS})(?:'s)? (?:schedule|plan|plans|agenda)$`, "i"),
    read: (match) => ({
      action: "ask_status",
      target: { kind: "unspecified" },
      parameters: withWhen({ scope: "schedule" }, match[1] ?? match[2] ?? match[3]),
      confidence: 0.94,
    }),
  },
  {
    pattern: /^(?:how(?:'s| is) )(\w+)(?:'s)? (.+?)(?: (?:going|coming along|doing|getting on))?$/i,
    read: (match) => ({
      action: "ask_status",
      target: { kind: "member", reference: lowerName(match[1]!) },
      parameters: { subject: match[2]!.trim() },
      confidence: 0.85,
    }),
  },
  {
    // "What health appointments do I have this month?" — a health-scoped
    // status question, read exactly like the schedule-scoped one above
    // (story 21-006). Health facts only reach the reply when the asking
    // member's own authorization allows it — this rule only recognizes the
    // question, it decides nothing about what may be shown.
    pattern: new RegExp(`^(?:what(?:'s| is|s)?\\s+)?(?:my |our )?health(?: appointments?| issues?| checkups?| records?)?(?: do (?:i|we) have)?(?: (${WHEN_WORDS}))?\\??$`, "i"),
    read: (match) => ({ action: "ask_status", target: { kind: "unspecified" }, parameters: withWhen({ scope: "health" }, match[1]), confidence: 0.93 }),
  },

  {
    // The everyday questions a household asks in one breath — the voice
    // spec's own examples, and what Gemini Voice's tools and Alexa's carrier
    // phrases send (voice phase 6 golden set): "what's for dinner?", "do we
    // need milk?", "are we out of rice?", "do the kids have homework?",
    // "what homework does Asmi have?". Questions, answered by HomeBrain from
    // the facts; none of them asks for anything to change.
    pattern: new RegExp(
      `^(?:what(?:'s| is|s) for (?:breakfast|lunch|dinner|supper|tea)|what are we (?:having|eating)(?: for (?:breakfast|lunch|dinner|supper))?|do we (?:still )?(?:need|have)(?: enough| any)? .+|are we (?:out of|low on|running low on|running out of) .+|what(?:'s| is| are|s)? (?:running low|low|out of stock|on the (?:${LIST_WORDS}))|what (?:groceries|food|things|items) (?:are|do we|have we)\\b.*|(?:do|does) (?:the kids|the children|\\w+) (?:have|got) (?:any )?(?:homework|exams?|tests?|school ?work|assignments?)\\b.*|what (?:homework|school ?work|exams?|tests?|assignments?) (?:does|do|is|are) .+)(?: (${WHEN_WORDS}))?[?.!]*$`,
      "i",
    ),
    read: (match) => ({ action: "ask_status", target: { kind: "unspecified" }, parameters: withWhen({ scope: "home" }, match[1]), confidence: 0.9 }),
  },

  // --- Agents: run the specialists for real ----------------------------------
  {
    // The literal trigger for 14-007's specialists, made real: unlike
    // "what's going on" (read from the agenda already gathered for this
    // reply), this actually runs the household's agents and reports what
    // they found or did.
    pattern: /^(?:check on things|check my household|run (?:my |a |the )?agents?(?: check)?|what do my agents see|run a check|check for anything my agents can handle)$/i,
    read: () => ({ action: "check_agents", target: { kind: "unspecified" }, parameters: {}, confidence: 0.97 }),
  },

  {
    // The many other ways of asking the same thing — "what is the current
    // situation", "what needs attention right now", "what's going on in my
    // family right now". A question about the home, with none of the verbs
    // that would make it a request, is a status question; the day word and
    // the schedule scope are kept when they were said.
    pattern: /^.+$/,
    read: (_match, utterance) => {
      if (!looksLikeStatusQuestion(utterance)) return null;
      const when = utterance.match(new RegExp(`\\b(${WHEN_WORDS})\\b`, "i"))?.[1];
      const scope = /\b(?:schedule|calendar|agenda|plans?)\b/i.test(utterance) ? "schedule" : "home";
      return { action: "ask_status", target: { kind: "unspecified" }, parameters: withWhen({ scope }, when), confidence: 0.82 };
    },
  },

  {
    // "When is my next checkup?" — a question about the home, answered by
    // HomeBrain from the facts.
    pattern: /^(?:when|what time)(?:'s| is| are| was| will| do| does)\b.+$/i,
    read: () => ({ action: "ask_status", target: { kind: "unspecified" }, parameters: { scope: "home" }, confidence: 0.82 }),
  },

  // --- Meals ---------------------------------------------------------------------
  {
    // The Meals screen's own "Change meal" link says exactly this; a person
    // says it too. With a dish it is a plan to remember; without one it is
    // a question back — never "I did not follow that".
    pattern: /^(?:change|swap|replace|update)\s+(?:the |my |our |today'?s |tomorrow'?s )?(breakfast|lunch|dinner|supper|snack)(?: plan| menu)?(?:\s+(?:on|for)\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|today|tonight|tomorrow|\w+day))?(?:\s+(?:to|with|for)\s+(.+))?$/i,
    read: (match) => {
      const slot = match[1]!.toLowerCase() === "supper" ? "dinner" : match[1]!.toLowerCase();
      const day = describeDay(match[2]);
      const dish = match[3]?.trim().replace(/[.!]+$/, "");
      if (!dish) {
        return {
          action: "unknown",
          target: { kind: "outcome", reference: `meals.${slot}` },
          parameters: { clarify: `What would you like for ${slot}${day ? ` ${day}` : ""}? Tell me the dish and I will note the change.` },
          confidence: 0,
        };
      }
      return {
        action: "set_preference",
        target: { kind: "outcome", reference: `meals.${slot}` },
        parameters: { statement: `${slot}${day ? ` ${day}` : ""}: ${dish}`, ...(match[2] ? { date: match[2].toLowerCase() } : {}) },
        confidence: 0.86,
      };
    },
  },

  // --- Lists: what a meal needs (Wave 4 §11) ---------------------------------
  {
    // "Make sure we have everything" — for the meal just planned, or the one
    // named. Grounding turns it into that recipe's ingredients, or asks.
    pattern: /^(?:make sure|check|see)(?: that| if)? we(?:'ve| have)?(?: got| have)? (?:everything|all the ingredients|what we need)(?: (?:we need )?(?:for|to make) (.+))?$/i,
    read: (match) => ({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { ingredientsOf: match[1] ? item(match[1]) : "that" }, confidence: 0.86 }),
  },
  {
    pattern: new RegExp(`^(?:add|get|buy|put)\\s+(?:everything|all the ingredients|the ingredients|what we need)(?: we need)? (?:for|to make) (.+?)(?:\\s+(?:to|on) (?:the |my |our )?(?:${LIST_WORDS}))?$`, "i"),
    read: (match) => ({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { ingredientsOf: item(match[1]!) }, confidence: 0.9 }),
  },

  // --- Reminders (Wave 4 §10) ---------------------------------------------------
  {
    pattern: new RegExp(`^remind me (?:to|about|that) (.+?)(?:\\s+(${REMIND_WHEN}))?(?:\\s+at\\s+(${TIME_WORDS}))?$`, "i"),
    read: (match) => ({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: reminder(match[1]!, match[2], match[3]), confidence: 0.9 }),
  },
  {
    pattern: new RegExp(`^remind me (${REMIND_WHEN})(?:\\s+at\\s+(${TIME_WORDS}))? (?:to|about|that) (.+)$`, "i"),
    read: (match) => ({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: reminder(match[3]!, match[1], match[2]), confidence: 0.9 }),
  },
  {
    // "Set a reminder to call the plumber tomorrow", "create a reminder about
    // the school meeting" — the same reminder, said the way a voice assistant
    // is usually asked for one.
    pattern: new RegExp(`^(?:set|create|make|add)(?: me)? an? reminder (?:to|about|for|that) (.+?)(?:\\s+(${REMIND_WHEN}))?(?:\\s+at\\s+(${TIME_WORDS}))?$`, "i"),
    read: (match) => ({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: reminder(match[1]!, match[2], match[3]), confidence: 0.9 }),
  },

  // --- Lists: add something --------------------------------------------------
  {
    pattern: new RegExp(`^(?:add|put|get|buy|pick up|we need|need|i need|we're out of|we are out of|out of)\\s+(.+?)\\s+(?:to|on|in|onto|into|for)\\s+(?:the |my |our )?(?:${LIST_WORDS})(?: too| as well| also)?$`, "i"),
    read: (match) => ({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { item: item(match[1]!) }, confidence: 0.96 }),
  },
  {
    pattern: new RegExp(`^(?:add|put|create|make|note)\\s+(?:a |an |new )?(?:grocery|groceries|shopping)(?: list)? (?:item|entry)(?: of| called| named| for|:)?\\s+(.+)$`, "i"),
    read: (match) => ({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { item: item(match[1]!) }, confidence: 0.95 }),
  },
  {
    pattern: /^(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:the |my |our )?list(?: too| as well| also)?$/i,
    read: (match) => ({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { item: item(match[1]!) }, confidence: 0.9 }),
  },
  {
    pattern: /^(?:we(?:'re| are) )?out of\s+(.+)$/i,
    read: (match) => ({ action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { item: item(match[1]!) }, confidence: 0.88 }),
  },
  {
    // "Remove the bananas" / "take milk off the list".
    pattern: new RegExp(`^(?:remove|take|delete|cross out|cross off|strike)\\s+(.+?)(?:\\s+(?:off|from)(?:\\s+(?:the |my |our )?(?:${LIST_WORDS}))?)?(?:\\s+off)?$`, "i"),
    read: (match) => {
      const what = item(match[1]!);
      if (!what || /\b(?:reminder|appointment|event|member|person|responsibility|helper)\b/i.test(what) || what.split(" ").length > 8) return null;
      return { action: "remove_from_list", target: { kind: "list", reference: "groceries" }, parameters: { item: what }, confidence: 0.86 };
    },
  },
  {
    // "Add milk and bananas" — no list named, so only plainly a thing or
    // two: anything with a destination or a time in it is some other request.
    pattern: /^add\s+(?:some |a |an |more )?(.+)$/i,
    read: (match) => {
      const what = item(match[1]!);
      if (/\b(?:to|into|onto|on|in|for|as|at|by|reminder|appointment|event|meeting|note|calendar|tomorrow|today|tonight)\b/i.test(what) || what.split(" ").length > 8) return null;
      return { action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { item: what }, confidence: 0.86 };
    },
  },
  {
    pattern: /^(?:we need|i need|need|buy|get)\s+(?:some |a |an |more )?(.+)$/i,
    read: (match) => {
      const what = item(match[1]!);
      // "get ready for tomorrow" is not a shopping request.
      if (/^(?:ready|going|started|back|out|up|home|to |it |that |this |the )/i.test(what) || what.split(" ").length > 5) return null;
      return { action: "add_to_list", target: { kind: "list", reference: "groceries" }, parameters: { item: what }, confidence: 0.78 };
    },
  },

  // --- Absence ------------------------------------------------------------------
  {
    pattern: new RegExp(
      `^((?:the |my |our )?(?:[A-Za-z]+)(?: one| kid| child| boy| girl)?)\\s+(?:won'?t be (?:here|in|around|coming|available|home|at home|back)|isn'?t (?:here|coming|available|in|home)|is (?:off sick|out sick|home sick|away|off|out|unavailable|on leave|not (?:coming|available|here|in|around|home)|sick|unwell|ill|travelling|traveling)|will be (?:away|off|out|unavailable)|can'?t (?:come|make it)|has (?:the day )?off|is taking (?:the day |a day |leave )?off)(?:\\s+(${WHEN_WORDS}))?$`,
      "i",
    ),
    read: (match) => ({
      action: "record_absence",
      target: { kind: "member", reference: personReference(match[1]!) },
      parameters: withWhen({}, match[2] ?? "today"),
      confidence: 0.92,
    }),
  },
  {
    pattern: new RegExp(`^(?:record|mark|note)(?: that)?\\s+([A-Za-z]+)(?:'s| is| as)?\\s+(?:away|off|absent|on leave|unavailable|leave)(?:\\s+(${WHEN_WORDS}))?$`, "i"),
    read: (match) => ({
      action: "record_absence",
      target: { kind: "member", reference: lowerName(match[1]!) },
      parameters: withWhen({}, match[2] ?? "today"),
      confidence: 0.92,
    }),
  },

  // --- Bills ----------------------------------------------------------------------
  {
    pattern: /^pay (?:the |my |our )?(.+?) bill$/i,
    read: (match) => ({ action: "make_payment", target: { kind: "bill", reference: slug(match[1]!) }, parameters: {}, confidence: 0.9 }),
  },
  {
    pattern: /^pay (?:it|that|them|this|the bill|the bills)$/i,
    read: () => ({ action: "make_payment", target: { kind: "unspecified" }, parameters: {}, confidence: 0.42 }),
  },

  // --- Orders ---------------------------------------------------------------------
  {
    pattern: /^(?:order|reorder) (?:the )?(?:usual|same|regular|normal)(?: stuff| things| items| order)?$/i,
    read: () => ({ action: "order_items", target: { kind: "unspecified" }, parameters: {}, confidence: 0.55 }),
  },
  {
    pattern: /^(?:order|reorder)\s+(.+)$/i,
    read: (match) => ({ action: "order_items", target: { kind: "list", reference: "groceries" }, parameters: { items: item(match[1]!) }, confidence: 0.82 }),
  },
  {
    /**
     * The way people actually ask, which is rarely a command starting with
     * the verb: "I want you to add 3 eggs for order and a packet of milk
     * for order". Anchoring on "order"/"reorder" at the start missed all of
     * it, and the household then got asked what to order — by a product
     * that had just been told (story 04-011).
     */
    pattern:
      /^(?:i\s+(?:just\s+|already\s+)?(?:want|need|would like|said|told you)(?:\s+you)?(?:\s+to)?\s+)?(?:please\s+)?(?:can you\s+|could you\s+)?(?:add|order|reorder|buy|get|purchase|put)\s+(.+?)\s+(?:for|to|on|into)\s+(?:the\s+)?(?:order|orders|shopping(?:\s+list)?|grocery(?:\s+list)?|groceries|list|basket|cart)\b.*$/i,
    read: (match) => ({
      action: "order_items",
      target: { kind: "list", reference: "groceries" },
      parameters: { items: extractItems(match[0]!) },
      confidence: 0.86,
    }),
  },

  // --- Planning and schedule --------------------------------------------------
  {
    pattern: new RegExp(`^plan (?:a |an |some |something )?(.*?)(?:\\s+(?:for|on))?\\s*(${WHEN_WORDS})?$`, "i"),
    read: (match) => {
      const what = match[1]?.trim() ?? "";
      const window = match[2]?.trim();
      if (!what && !window) return null;
      return {
        action: "plan_event",
        target: { kind: "event", reference: what ? slug(what) : "family_time" },
        parameters: withWhen(what ? { what } : {}, window, "window"),
        confidence: 0.86,
      };
    },
  },
  {
    pattern: /^(?:move|shift|reschedule|change|push)\s+(.+?)\s+(?:to|for)\s+(.+)$/i,
    // The words as said ("Manan's science project") ride along, so grounding
    // can find the one school item they name.
    read: (match) => ({ action: "adjust_schedule", target: { kind: "event", reference: slug(match[1]!) }, parameters: { to: match[2]!.trim().toLowerCase(), what: match[1]!.trim() }, confidence: 0.88 }),
  },
  {
    // "Protect Saturday evening for family time" — a protected block on the
    // family calendar, not a vague plan.
    pattern: /^(?:protect|block(?: out| off)?|keep|reserve|hold)\s+(.+?)\s+(?:free\s+)?for\s+(.+)$/i,
    read: (match) => ({
      action: "plan_event",
      target: { kind: "event", reference: slug(match[2]!) },
      parameters: { what: match[2]!.trim().replace(/^(?:some|a bit of)\s+/i, ""), window: match[1]!.trim().toLowerCase(), protected: true },
      confidence: 0.88,
    }),
  },

  // --- School: done ------------------------------------------------------------
  {
    pattern: /^(?:mark|tick off|set)\s+(?:([A-Za-z]+)'s\s+)?(.+?)\s+(?:as\s+)?(?:complete|completed|done|finished)$/i,
    read: (match) => ({
      action: "complete_school_item",
      target: match[1] ? { kind: "member", reference: lowerName(match[1]) } : { kind: "outcome", reference: "school" },
      parameters: { title: item(match[2]!) },
      confidence: 0.9,
    }),
  },
  {
    pattern: /^([A-Za-z]+)\s+(?:has\s+)?(?:finished|completed|done)\s+(?:(?:her|his|their)\s+)?(.+)$/i,
    read: (match) =>
      /^(?:i|we|you|they|it|that)$/i.test(match[1]!)
        ? null
        : { action: "complete_school_item", target: { kind: "member", reference: lowerName(match[1]!) }, parameters: { title: item(match[2]!) }, confidence: 0.85 },
  },

  // --- Home: something needs a repair ------------------------------------------
  {
    pattern: /^(?:raise|log|open|create|book|file)\s+(?:a\s+)?(?:service|repair|maintenance)\s+(?:request|call|ticket)(?:\s+for\s+(?:the\s+|our\s+|my\s+)?(.+))?$/i,
    read: (match) => ({ action: "raise_service_request", target: { kind: "outcome", reference: "home" }, parameters: match[1] ? { asset: match[1].trim() } : { asset: "it" }, confidence: 0.9 }),
  },
  {
    pattern: /^(?:the\s+|our\s+|my\s+)?([a-z][a-z ]{2,40}?)\s+((?:is|keeps)\s+making\s+(?:a|that|the|some|this|an?\s+\w+)?\s*(?:noise|sound)|is\s+(?:broken|leaking|not working|acting up|dripping)|isn'?t working|stopped working|won'?t\s+(?:start|turn on|work|drain|spin|cool)|keeps\s+\w+ing)(?:\s+again)?$/i,
    read: (match) => ({ action: "raise_service_request", target: { kind: "outcome", reference: "home" }, parameters: { asset: match[1]!.trim(), symptom: match[2]!.trim().toLowerCase() }, confidence: 0.8 }),
  },

  // --- Payments: prepare ------------------------------------------------------------
  {
    pattern: /^(?:prepare|set up|get ready|line up)\s+(?:the |my |our )?(.+?)\s+(?:payment|bill)$/i,
    read: (match) => ({ action: "make_payment", target: { kind: "bill", reference: slug(match[1]!) }, parameters: {}, confidence: 0.9 }),
  },

  // --- Responsibilities --------------------------------------------------------
  {
    pattern: /^([A-Za-z]+) (?:handles|takes|takes over|is responsible for|will do|does|owns|looks after|is in charge of|will handle)\s+(.+?)(?:\s+from now on| now| going forward)?$/i,
    read: (match) => ({
      action: "assign_responsibility",
      target: { kind: "member", reference: lowerName(match[1]!) },
      parameters: { outcomeKey: slug(match[2]!) },
      confidence: 0.86,
    }),
  },
  {
    pattern: /^(?:make|put|assign)\s+([A-Za-z]+)\s+(?:responsible for|in charge of|on)\s+(.+)$/i,
    read: (match) => ({
      action: "assign_responsibility",
      target: { kind: "member", reference: lowerName(match[1]!) },
      parameters: { outcomeKey: slug(match[2]!) },
      confidence: 0.86,
    }),
  },

  // --- Health (story 21-006) ------------------------------------------------------
  // Never a diagnosis, and never a direct write from this file — a rule only
  // ever produces an intent; the governed health service (createAppointment,
  // createIssue, setIssueStatus) is what actually records anything, exactly
  // the same "request, not authorization" shape every other rule already
  // keeps. Placed before "Preferences" below, since "I have X" would
  // otherwise be read as a stated preference rather than a symptom.
  {
    pattern: new RegExp(
      `^i(?:'ve| have)(?: got)? (?:a |an )?(.+?) appointment(?:\\s+(?:on\\s+|for\\s+)?(${WHEN_WORDS}|\\d{4}-\\d{2}-\\d{2}))?(?:\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?))?$`,
      "i",
    ),
    read: (match) => {
      const appointmentType = matchAppointmentType(match[1]!);
      const parameters: Record<string, unknown> = { typeText: match[1]!.trim(), appointmentType };
      if (match[2]) parameters.when = match[2].trim().toLowerCase();
      if (match[3]) parameters.time = match[3].trim().toLowerCase();
      return { action: "record_health_appointment", target: { kind: "member", reference: "self" }, parameters, confidence: 0.88 };
    },
  },
  {
    pattern: /^my (blood pressure|bp|weight|heart rate|pulse|temperature|blood sugar|sugar) (?:was|is)\s+(.+)$/i,
    read: (match) => ({
      action: "log_vital",
      target: { kind: "member", reference: "self" },
      parameters: { vital: match[1]!.toLowerCase(), reading: match[2]!.trim().replace(/[.!]+$/, "") },
      confidence: 0.9,
    }),
  },
  {
    pattern: /^(?:log|record) my (blood pressure|bp|weight|heart rate|pulse|temperature|blood sugar|sugar) as\s+(.+)$/i,
    read: (match) => ({
      action: "log_vital",
      target: { kind: "member", reference: "self" },
      parameters: { vital: match[1]!.toLowerCase(), reading: match[2]!.trim().replace(/[.!]+$/, "") },
      confidence: 0.9,
    }),
  },
  {
    pattern: /^i want to (.+?) (\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) times? a (day|week|month)$/i,
    read: (match) => ({
      action: "set_fitness_goal",
      target: { kind: "member", reference: "self" },
      parameters: { activity: match[1]!.trim(), timesPer: match[3]!.toLowerCase(), count: countWord(match[2]!) },
      confidence: 0.88,
    }),
  },
  {
    pattern: /^my (.+?) (?:is|are|has|have) (?:gone|better|resolved|cleared up|cleared|over|done|fine now)$/i,
    read: (match) => ({
      action: "resolve_health_issue",
      target: { kind: "member", reference: "self" },
      parameters: { label: match[1]!.trim() },
      confidence: 0.87,
    }),
  },
  {
    pattern: /^i(?:'ve| have)(?: had)? (?:a |an )?(.+?)(?:\s+since\s+(.+))?$/i,
    read: (match) => {
      const label = item(match[1]!);
      // The same discipline the grocery "i need X" rule already uses: a
      // short symptom-shaped noun, not a sentence about something else
      // that happens to start with "I have" or "I've had".
      if (
        label.split(" ").length > 5 ||
        /^(?:a |an )?(?:meeting|appointment|call|deadline|exam|test|idea|feeling|plan|question|thought)\b/i.test(label)
      ) {
        return null;
      }
      const params: Record<string, unknown> = { label };
      if (match[2]) params.since = match[2].trim().toLowerCase();
      return { action: "log_health_issue", target: { kind: "member", reference: "self" }, parameters: params, confidence: 0.83 };
    },
  },

  // --- Preferences ---------------------------------------------------------------
  {
    pattern: /^(?:actually,?\s+)?(?:we|i|the family|the kids)\s+(?:prefer|like|usually|always|want|have|eat|do)\s+(.+)$/i,
    read: (match, utterance) => preference(match[1]!, /^actually/i.test(utterance)),
  },
  {
    pattern: /^(?:remember|note|keep in mind)(?: that)?\s+(.+)$/i,
    read: (match, utterance) => preference(match[1]!, /^actually/i.test(utterance)),
  },
  {
    pattern: /^(?:actually,?\s+)(.+?) (?:is|are) (?:at|on) (.+)$/i,
    read: (match) => preference(`${match[1]} at ${match[2]}`, true),
  },
  {
    // "Asmi doesn't like mushrooms", "Dad is allergic to peanuts", "actually
    // Asmi is okay with mushrooms now" — one person's stance on one thing,
    // keyed so a later change of mind replaces the earlier one (Wave 2 §8).
    // Last, so every more specific rule above reads its sentence first.
    pattern: /^.+$/,
    read: (_match, utterance) => {
      const parsed = parsePreference(utterance);
      if (!parsed) return null;
      const statement = utterance.trim().replace(/^actually,?\s+/i, "").replace(/[.!]+$/, "");
      return {
        action: "set_preference",
        target: { kind: "outcome", reference: parsed.key },
        parameters: { statement, ...(parsed.corrects ? { corrects: true } : {}) },
        confidence: 0.88,
      };
    },
  },
];

/**
 * A question about how the home is doing, in any of the ways people put it,
 * that carries none of the verbs that would make it a request. The specific
 * status rules above read the common phrasings precisely (and set the
 * schedule scope); this is the wide net under them.
 */
export function looksLikeStatusQuestion(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (/^(?:add|put|pay|order|buy|get|move|shift|reschedule|plan|remember|note|make|assign|record|mark|change|swap|replace|cancel|remove|delete|schedule|book|send|call|set|turn|remind)\b/.test(t)) return false;
  if (/^(?:we|i)\s+(?:need|want|prefer|like)\b/.test(t)) return false;
  const topic =
    /\b(?:going on|happening|situation|status|state of|overview|summary|latest|update|catch me up|what'?s up|attention|on my plate|to-?do|pending|outstanding|urgent|due|worry about|need(?:s|ed)? (?:me |my |our |us )?(?:to )?(?:do|know|look|handl|sort|attend|deal)|should (?:i|we) (?:know|do|worry|look)|how (?:are|is|'s) (?:things|everything|it going|the (?:house|home|family|household)|my (?:home|house|family)|our (?:home|house|family)|we doing))\b/;
  if (topic.test(t)) return true;
  return /^(?:what|how|is there|anything|are there|any)\b/.test(t) && /\b(?:home|house|household|family|today|tonight|now|week|weekend|tomorrow|day)\b/.test(t);
}

/** "2026-09-20" → "on Sat 20 Sep"; "tomorrow" → "tomorrow"; nothing → "". */
function describeDay(raw: string | undefined): string {
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return raw.toLowerCase();
  const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12));
  if (Number.isNaN(date.getTime())) return raw;
  // Fixed names rather than Intl: ICU versions disagree on "Sep" vs "Sept".
  return `on ${DAY_NAMES[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function withWhen(parameters: Record<string, unknown>, when: string | undefined, key = "when"): Record<string, unknown> {
  if (!when) return parameters;
  return { ...parameters, [key]: when.trim().toLowerCase().replace(/^on /, "") };
}

/** A stated preference becomes memory under a key the household could find again. */
function preference(statement: string, corrects: boolean): ReturnType<Rule["read"]> {
  const text = statement.trim().replace(/[.!]+$/, "");
  const meal = text.match(/\b(breakfast|lunch|dinner|supper|snack|tea)\b/i)?.[1]?.toLowerCase();
  const time = text.match(/\b(?:at|by|around)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)?.[1];
  const key = meal ? `meals.${meal === "supper" ? "dinner" : meal}` : /\bbedtime\b/i.test(text) ? "kids.bedtime" : `household.${slug(text).split(".").slice(0, 3).join(".") || "preference"}`;

  const parameters: Record<string, unknown> = { statement: text };
  if (time) parameters.time = normaliseTime(time);
  if (corrects) parameters.corrects = true;

  return { action: "set_preference", target: { kind: "outcome", reference: key }, parameters, confidence: 0.9 };
}

/** "8", "8pm", "7:30 pm" → "20:00", "19:30". A bare hour ≤ 11 with no am/pm is read as evening for meals — the usual household reading of "dinner at 8". */
function normaliseTime(raw: string): string {
  const match = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = match[2] ?? "00";
  const meridiem = match[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 11) hour += 12;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/**
 * Reads an utterance against the rules, first match wins. Returns `unknown`
 * — the same shape a fixture miss produces — when nothing applies, so the
 * caller's clarification path is unchanged.
 */
export function resolveRuleIntent(
  utterance: string,
  context: { actorMemberId: string; channel: "text" | "voice" },
): HouseholdIntent {
  const text = core(utterance);

  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const read = rule.read(match, text);
    if (!read) continue;
    return {
      ...withItems(read),
      actorMemberId: context.actorMemberId,
      channel: context.channel,
      utterance,
      understanding: { source: "rules" },
    };
  }

  return {
    action: "unknown",
    actorMemberId: context.actorMemberId,
    target: { kind: "unspecified" },
    parameters: {},
    confidence: 0,
    channel: context.channel,
    utterance,
    understanding: { source: "rules" },
  };
}

/** The actions the rules can produce — for tests that assert coverage. */
export const RULE_ACTIONS: readonly IntentAction[] = [
  "greet",
  "ask_status",
  "check_agents",
  "add_to_list",
  "set_reminder",
  "remove_from_list",
  "complete_school_item",
  "raise_service_request",
  "record_absence",
  "make_payment",
  "order_items",
  "plan_event",
  "adjust_schedule",
  "assign_responsibility",
  "record_health_appointment",
  "log_vital",
  "set_fitness_goal",
  "resolve_health_issue",
  "log_health_issue",
  "set_preference",
];
