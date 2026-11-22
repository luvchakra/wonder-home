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
 * What a message is, and where it goes, is HomeBrain's to decide
 * (`homebrain/intake/channel-decide.ts`); this file only renders the answer.
 */

/** The address a reply's links are written against. */
export const WHATSAPP_APP_ORIGIN = "https://home.wonderapps.biz";

/** The longest reply sent in one message; WhatsApp's own limit is 4,096. */
export const MAX_WHATSAPP_REPLY = 1500;

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
