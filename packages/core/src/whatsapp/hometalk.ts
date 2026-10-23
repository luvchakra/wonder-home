import type { HomeTalkResponse } from "../hometalk/contract";

/**
 * WhatsApp as a door into HomeTalk (the owner, 2026-10-24: "Should WhatsApp
 * answer questions itself, through HomeTalk the way Alexa does?" — "yes").
 *
 * A linked adult's question or everyday request goes through the same
 * gateway as Alexa (`hometalk/gateway.ts`), under their own session, on
 * channel `whatsapp` with `WHATSAPP_SCOPES`. WhatsApp only proves who is
 * writing (the verified link) and renders the answer; it never decides what
 * happened. Anything to keep — a notice, a list, a photo — is still HomeSend.
 */

/** The address a reply's links are written against. */
export const WHATSAPP_APP_ORIGIN = "https://home.wonderapps.biz";

/** The longest reply sent in one message; WhatsApp's own limit is 4,096. */
export const MAX_WHATSAPP_REPLY = 1500;

const QUESTION_OPENING =
  /^(?:what|what's|whats|when|when's|where|where's|who|who's|whose|which|how|how's|why|is|are|am|was|were|do|does|did|can|could|should|shall|will|would|has|have|any|tell me|show me|give me)\b/i;

/** An everyday request HomeTalk does on its own: the list, a reminder, something to remember. */
const REQUEST_OPENING = /^(?:add|remove|put|take|remind me|set a reminder|remember)\b/i;

/**
 * Whether a WhatsApp text is a question for WonderHome rather than something
 * to keep: one short line that asks ("what's the plan for the morning",
 * "is there milk?"). A forwarded notice, a list or anything with a link is
 * content, however it begins.
 */
export function isQuestionForWonderHome(text: string): boolean {
  const line = shortLine(text);
  return line !== null && (line.endsWith("?") || QUESTION_OPENING.test(line));
}

/** A question, or a one-line everyday request ("add milk to the list", "remind me to call the plumber at 5"). */
export function isForHomeTalk(text: string): boolean {
  const line = shortLine(text);
  return line !== null && (isQuestionForWonderHome(line) || REQUEST_OPENING.test(line));
}

function shortLine(text: string): string | null {
  const line = text.trim();
  if (!line || line.length > 160 || /\n/.test(line) || /https?:\/\/|www\./i.test(line)) return null;
  return line;
}

/**
 * HomeTalk's answer as a WhatsApp message: its own words (`displayText`),
 * WhatsApp's bold, links written out in full, and the screen it opens as a
 * link. Never cut mid-sentence: a long answer ends where a sentence does and
 * says the rest is in the app.
 */
export function whatsappReplyText(response: Pick<HomeTalkResponse, "displayText" | "navigate">, origin = WHATSAPP_APP_ORIGIN): string {
  const absolute = (href: string) => (href.startsWith("/") ? `${origin}${href}` : href);
  let text = response.displayText
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => `${label} (${absolute(href)})`)
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/__([^_]+)__/g, "_$1_")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const link = response.navigate && !text.includes(absolute(response.navigate)) ? `\n\n${absolute(response.navigate)}` : "";
  if (text.length + link.length > MAX_WHATSAPP_REPLY) {
    const room = MAX_WHATSAPP_REPLY - link.length - 60;
    const cut = text.slice(0, room);
    const end = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
    text = `${(end > room / 2 ? cut.slice(0, end + 1) : cut).trim()}\n\nThe rest is in the WonderHome app.`;
  }
  return text ? `${text}${link}` : "I couldn't answer that right now. Nothing was changed.";
}
