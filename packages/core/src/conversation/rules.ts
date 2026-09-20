import type { HouseholdIntent, IntentAction } from "./intent";

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

const WHEN_WORDS = "today|tonight|tomorrow|this (?:week|weekend|morning|afternoon|evening)|next (?:week|weekend)|on \\w+day|\\w+day";

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

function item(value: string): string {
  return value
    .trim()
    .replace(/^(?:a|an|some|the|more)\s+/i, "")
    .replace(/\s+(?:too|as well|also)$/i, "")
    .trim();
}

const RULES: readonly Rule[] = [
  // --- Greetings, thanks, help ---------------------------------------------
  {
    pattern: /^(?:hi|hello|hey|hiya|good (?:morning|afternoon|evening|night)|namaste)(?:\s+(?:there|wonderhome))?$/i,
    read: () => ({ action: "greet", target: { kind: "unspecified" }, parameters: { kind: "greeting" }, confidence: 0.99 }),
  },
  {
    pattern: /^(?:thanks|thank you|thx|cheers|great,? thanks|perfect|awesome|nice)(?:\s+\w+)?$/i,
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
      `^([A-Za-z]+)\\s+(?:won'?t be (?:here|in|around|coming|available)|isn'?t (?:here|coming|available|in)|is (?:away|off|out|unavailable|on leave|not (?:coming|available|here|in|around)|sick|unwell|ill|travelling|traveling)|will be (?:away|off|out|unavailable)|can'?t (?:come|make it)|has (?:the day )?off|is taking (?:the day |a day |leave )?off)(?:\\s+(${WHEN_WORDS}))?$`,
      "i",
    ),
    read: (match) => ({
      action: "record_absence",
      target: { kind: "member", reference: lowerName(match[1]!) },
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
    read: (match) => ({ action: "adjust_schedule", target: { kind: "event", reference: slug(match[1]!) }, parameters: { to: match[2]!.trim().toLowerCase() }, confidence: 0.88 }),
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
      ...read,
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
  "add_to_list",
  "record_absence",
  "make_payment",
  "order_items",
  "plan_event",
  "adjust_schedule",
  "assign_responsibility",
  "set_preference",
];
