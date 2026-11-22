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
  return line !== null && (line.endsWith("?") || QUESTION_OPENING.test(line));
}

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
  return isSmallTalk(line) || isQuestionLine(line) || isRequestLine(line) ? "hometalk" : "homesend";
}
