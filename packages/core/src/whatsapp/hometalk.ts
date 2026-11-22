import type { HomeTalkResponse } from "../hometalk/contract";
import { APP_PLACES, parseReply, type Inline } from "../conversation/reply-format";

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

/** What closes a reply cut short: the rest is in the app, never a sentence cut in half. */
export const WHATSAPP_REST_IN_APP = "The rest is in the WonderHome app.";

/** A list with an item longer than this gets a blank line between items, so each reads as its own paragraph. */
const ROOMY_ITEM = 40;

type Unit = { text: string; list: boolean; hrefs: string[] };

/**
 * HomeTalk's answer as a WhatsApp message, laid out the way the app shows it
 * (the owner, 2026-11-22: "make it same as HomeTalk message formatting").
 * The words come from the one parse the app renders (`parseReply`), so both
 * doors say the same thing; only the markup differs:
 * - WhatsApp's `*bold*`; a list item is "• " and, in a list of sentences, a
 *   paragraph of its own (a blank line between items);
 * - a link to a screen keeps its short label in the sentence ("→ Meals"), and
 *   every screen is written out once at the end ("Meals: https://…", which
 *   WhatsApp turns into a link), with the screen the answer opens;
 * - a link out of the app (a map) is written in full where it stands.
 * A long answer drops whole items from the end, keeps its first and closing
 * lines, and says the rest is in the app; it is never cut mid-sentence.
 */
export function whatsappReplyText(response: Pick<HomeTalkResponse, "displayText" | "navigate">, origin = WHATSAPP_APP_ORIGIN): string {
  const units: Unit[] = [];
  for (const block of parseReply(tidy(response.displayText))) {
    if (block.kind === "paragraph") units.push(unitFor(block.inlines, false, origin));
    else for (const item of block.items) units.push(unitFor(item, true, origin));
  }
  if (units.length === 0) return "I couldn't answer that right now. Nothing was changed.";
  const navigate = response.navigate?.startsWith("/") ? response.navigate : undefined;
  let message = compose(units, navigate, origin);
  if (message.length <= MAX_WHATSAPP_REPLY) return message;

  // Too long: keep the opening and the closing line, drop whole items from the end of the middle.
  const first = units[0]!;
  const closing = units.length > 1 && !units.at(-1)!.list ? units.at(-1)! : undefined;
  const middle = units.slice(1, closing ? -1 : undefined);
  const rest: Unit = { text: WHATSAPP_REST_IN_APP, list: false, hrefs: [] };
  while (middle.length > 0) {
    middle.pop();
    message = compose([first, ...middle, ...(closing ? [closing] : []), rest], navigate, origin);
    if (message.length <= MAX_WHATSAPP_REPLY) return message;
  }
  // One long paragraph: end where a sentence does.
  const room = MAX_WHATSAPP_REPLY - WHATSAPP_REST_IN_APP.length - 200;
  const cut = first.text.slice(0, room);
  const end = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  const shortened = { ...first, text: (end > room / 2 ? cut.slice(0, end + 1) : cut).trim() };
  return compose([shortened, ...(closing && closing.text.length < 200 ? [closing] : []), rest], navigate, origin);
}

/** The markup `parseReply` leaves as text, made plain for WhatsApp; a link out of the app (a map) is written in full where it stands. */
function tidy(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/__([^_]+)__/g, "_$1_").replace(/`([^`]+)`/g, "$1");
}

function unitFor(inlines: Inline[], list: boolean, origin: string): Unit {
  const hrefs: string[] = [];
  const text = inlines
    .map((inline) => {
      if (inline.kind === "bold") return `*${inline.text}*`;
      if (inline.kind === "text") return inline.text;
      hrefs.push(inline.href);
      return inline.label;
    })
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { text: list ? `• ${text}` : text, list, hrefs };
}

function compose(units: Unit[], navigate: string | undefined, origin: string): string {
  const roomy = units.some((unit) => unit.list && unit.text.length > ROOMY_ITEM);
  let body = "";
  units.forEach((unit, index) => {
    const before = units[index - 1];
    if (before) body += unit.list && before.list && !roomy ? "\n" : unit.list || before.list ? "\n\n" : "\n";
    body += unit.text;
  });
  const hrefs = [...new Set([...units.flatMap((unit) => unit.hrefs), ...(navigate ? [navigate] : [])])];
  const links = [...new Map(hrefs.map((href) => [`${origin}${href}`, `${placeLabel(href)}: ${origin}${href}`])).values()];
  return links.length > 0 ? `${body}\n\n${links.join("\n")}` : body;
}

function placeLabel(href: string): string {
  const path = href.split(/[?#]/)[0];
  return APP_PLACES.find((place) => place.href === path)?.label ?? "WonderHome";
}
