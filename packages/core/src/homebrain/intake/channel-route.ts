import { isUndo } from "../../conversation/consent";
import { isLeaveIt } from "../../conversation/leave-it";

/**
 * Talk or keep: whether a message that arrived on a channel (WhatsApp, a
 * spoken note) is said *to* WonderHome — a hello, a thank-you, a question, an
 * everyday request — or is something to keep in HomeSend (a forward, a
 * notice, a photo, a document, a bill).
 *
 * Deterministic on purpose (2026-11-22): the decision needs no model, so a
 * key that is missing, refused or slow never turns "hello" into a HomeSend
 * item. On 22 Nov the owner's WhatsApp "hello" was read by the model as
 * nothing to keep and answered "I kept that. WonderHome couldn't read
 * anything in it" — the old router knew questions and requests but no
 * greeting, and its `any\b` missed "anything due this week".
 *
 * HomeBrain decides; the channel only passes the text in and the answer out
 * (owner, 2026-11-22).
 */

/** A line that asks. "anything", "anyone", "upcoming" ask too. */
const QUESTION_OPENING =
  /^(?:what|what's|whats|wat|when|when's|where|where's|who|who's|whose|which|how|how's|why|is|are|am|was|were|do|does|did|can|could|should|shall|will|would|has|have|any|anything|anyone|anybody|upcoming|tell me|show me|give me)\b/i;

/** An everyday request HomeTalk does on its own: the list, a reminder, something to remember. */
const REQUEST_OPENING = /^(?:add|remove|put|take|remind me|set a reminder|remember)\b/i;

/**
 * A hello, a thank-you, a goodbye, "how are you", "help": said to WonderHome,
 * never content. Each may carry a name or "WonderHome" and trailing
 * punctuation or emoji ("hi there!", "thanks wonderhome 🙏").
 */
const SMALL_TALK = new RegExp(
  "^(?:" +
    [
      "h+i+|hii+|hello+|helo|hey+|hiya|yo|heya|howdy|namaste|namaskar|नमस्ते|नमस्कार|हैलो|hola|bonjour|hallo|salut|مرحبا|أهلا|السلام عليكم",
      "good (?:morning|afternoon|evening|night|day)|gm|gn|morning|evening",
      "how are you(?: doing)?|how r u|how's it going|hows it going|what's up|whats up|wassup|sup",
      "thanks?|thank you(?: so much| very much)?|thanku|thankyou|thx|ty|tysm|cheers|much appreciated|great,? thanks|ok(?:ay)?,? thanks|धन्यवाद|शुक्रिया|dhanyavad|shukriya|gracias|merci|danke|شكرا",
      "ok(?:ay)?|okk+|k|cool|nice|great|awesome|perfect|got it|noted|alright|all right|fine|sounds good|lol|haha+|hmm+|👍|🙏|😊|🙂|❤️",
      "bye|good ?bye|see you|see ya|ttyl|take care",
      "help|help me|what can you do(?: for me)?|what do you do|who are you|what are you",
    ].join("|") +
    ")(?:[\\s,]+(?:there|wonderhome|wonder home|buddy|friend|bot|again|all))?[\\s.!?🙏😊🙂👋❤️👍]*$",
  "iu",
);

export type ChannelMessage = {
  /** The typed words, or a voice note's transcript; null for a file or photo with no words. */
  text: string | null;
  /** WhatsApp marked it forwarded: passed on, so content however it reads. */
  forwarded?: boolean;
  /** A photo, document or other file came with it. */
  media?: boolean;
};

export type ChannelRoute = "hometalk" | "homesend";

/** One short line with no link: the only kind of text that can be said to WonderHome rather than kept. */
export function shortLine(text: string | null | undefined): string | null {
  const line = (text ?? "").trim();
  if (!line || line.length > 160 || /\n/.test(line) || /https?:\/\/|www\./i.test(line)) return null;
  return line;
}

/** A hello, thank-you, goodbye, "ok" or "help": small talk, never content. */
export function isSmallTalk(text: string): boolean {
  const line = shortLine(text);
  return line !== null && SMALL_TALK.test(line);
}

/** One short line that asks ("what's the plan for the morning", "anything due this week", "is there milk?"). */
export function isQuestionLine(text: string): boolean {
  const line = shortLine(text);
  return line !== null && (line.endsWith("?") || QUESTION_OPENING.test(line) || HINGLISH_QUESTION.test(line));
}

/** Hinglish asks with its question word anywhere: "kal ka plan kya hai", "fees kab due hai". */
const HINGLISH_QUESTION = /\b(?:kya|kyaa|kab|kaun|kaunsa|kitna|kitne|kitni|kahan|kaha|kaise|kyun)\b/i;

/** A plain correction of what WonderHome just did ("no, it's on the 12th", "actually make it 5"). */
const CORRECTION_OPENING = /^(?:no|nope|nah|not|actually|sorry|oops|wait)\b[,.!]?\s+\S/i;

/** A one-line everyday request ("add milk to the list", "remind me to call the plumber at 5"). */
export function isRequestLine(text: string): boolean {
  const line = shortLine(text);
  return line !== null && REQUEST_OPENING.test(line);
}

/**
 * Where a channel message goes, without a model. Files, photos and forwards
 * are content. One short line that greets, thanks, asks or makes an everyday
 * request goes to HomeTalk; anything else is HomeSend's to read.
 */
export function routeChannelMessage(message: ChannelMessage): ChannelRoute {
  if (message.media || message.forwarded) return "homesend";
  const line = shortLine(message.text);
  if (!line) return "homesend";
  return isSmallTalk(line) || isQuestionLine(line) || isRequestLine(line) || CORRECTION_OPENING.test(line) || isUndo(line) || REPLY_TO_HOMETALK.test(line) || isLeaveIt(line) ? "hometalk" : "homesend";
}

/**
 * A reply to what HomeTalk just said: "undo" after "Say undo to take it
 * back", or a yes or no to its question. It means nothing to HomeSend — on
 * 2026-10-26 an "undo" was kept as content and "failed safely" while the
 * milk it meant stayed on the list.
 */
const REPLY_TO_HOMETALK = /^(?:yes|yeah|yep|yup|no|nope|ok|okay|sure|go ahead|do it|don't|do not|cancel)[.!]?$/i;

/**
 * Whether a channel text is said to WonderHome rather than something to
 * keep: one short line that asks ("what's the plan", "anything due this
 * week?") or greets, thanks or says goodbye ("hello", "thanks"). A forwarded
 * notice, a list or anything with a link is content, however it begins.
 * HomeBrain decides (`homebrain/intake/channel-route.ts`), with no model.
 */
export function isQuestionForWonderHome(text: string): boolean {
  return isQuestionLine(text) || isSmallTalk(text);
}

/** A question or small talk, a one-line everyday request ("add milk to the list", "remind me to call the plumber at 5"), or a reply to HomeTalk ("undo", "yes", "skip"). */
export function isForHomeTalk(text: string): boolean {
  const line = shortLine(text);
  return line !== null && routeChannelMessage({ text: line }) === "hometalk";
}

/**
 * The names in a bare shopping list sent on its own ("milk, eggs and bread"):
 * two to eight short names split by commas, "and" or "&", nothing else on the
 * line. Null for anything else. Whether each is really a grocery is checked
 * against the catalog (`intake.ts`), so "Asmi, Manan and Kunal" stays content.
 */
export function groceryListNames(text: string): string[] | null {
  const line = shortLine(text);
  if (!line || line.length > 100 || isForHomeTalk(line)) return null;
  const names = line
    .replace(/[.!]+$/, "")
    .split(/\s*(?:,|&|\band\b|\+)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length < 2 || names.length > 8) return null;
  return names.every((name) => /^[\p{L}][\p{L}' -]*$/u.test(name) && name.split(/\s+/).length <= 3) ? names : null;
}

/** Whether a catalog entry's name holds every word of what was typed, as whole words ("eggs" in "Eggs, Brown"; never "asmi" in "Jasmine"). */
export function namesTheSameThing(typed: string, catalogName: string): boolean {
  const words = (value: string) => value.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean).map((word) => word.replace(/(?:es|s)$/, ""));
  const have = new Set(words(catalogName));
  const want = words(typed);
  return want.length > 0 && want.every((word) => have.has(word));
}

/** The longest a note on the message before it is ("it's for Asmi on Sunday"). */
export const NOTE_MAX_WORDS = 6;
const NOTE_DAY_OR_TIME =
  /\b(?:today|tonight|tomorrow|tmrw|yesterday|morning|afternoon|evening|night|noon|midnight|weekend|week|month|due|am|pm|(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?|jan(?:uary)?|feb(?:ruary)?|april|apr|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const NOTE_AMOUNT = /\d|\b(?:litres?|liters?|kgs?|grams?|ml|dozen|packets?|packs?|pieces?|pcs|bottles?|boxes?)\b/i;

/**
 * A short note on the message sent just before it: up to six words naming a
 * household member, a day or time, or an amount, with no request or question
 * of its own ("for Manan", "Asmi Sunday", "due Friday", "2 litres"). Pure.
 */
export function isShortNote(text: string, names: readonly string[]): boolean {
  const line = text.trim();
  if (!line || /\n/.test(line) || line.includes("?") || isForHomeTalk(line)) return false;
  const words = line.split(/\s+/);
  if (words.length > NOTE_MAX_WORDS) return false;
  const said = new Set(words.map((word) => word.toLowerCase().replace(/['’]s$/, "").replace(/[^\p{L}]/gu, "")));
  const names_ = names.map((name) => name.toLowerCase()).filter((name) => name.length >= 2);
  return names_.some((name) => said.has(name)) || NOTE_DAY_OR_TIME.test(line) || NOTE_AMOUNT.test(line);
}

const NOTE_FILLER = /^(?:for|it|its|it's|is|this|that|that's|on|at|by|the|a|an|and|&|next|of|to|in)$/i;

/**
 * Whether a short note says nothing but who, when or how much ("for Manan",
 * "Asmi Sunday", "due Friday"): alone, it is about something not sent, never
 * content of its own ("2 litres mustard oil" is content). Pure.
 */
export function isBareDetail(text: string, names: readonly string[]): boolean {
  if (!isShortNote(text, names)) return false;
  const known = new Set(names.map((name) => name.toLowerCase()));
  return text
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/['’]s$/, "").replace(/[.,!]+$/, ""))
    .filter(Boolean)
    .every((word) => NOTE_FILLER.test(word) || known.has(word.toLowerCase()) || NOTE_DAY_OR_TIME.test(word) || NOTE_AMOUNT.test(word));
}

