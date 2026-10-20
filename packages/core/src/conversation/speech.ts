import { parseReply } from "./reply-format";

/**
 * A reply as a person would say it out loud.
 *
 * A written reply carries things a reader skims past but a voice must not
 * read: "Settings → AI Assistant" (the arrow is read as "right arrow"), a
 * bullet list, `**bold**`, a link's address, "·" between facts, emoji. This
 * turns all of that into plain, spoken sentences: an arrow between two
 * places becomes "then", a list becomes one item per sentence, a link is its
 * words, and units are said in full. The written reply is untouched; only
 * what is spoken changes. Every voice path in HomeTalk speaks through this.
 */

const ARROWS = /\s*(?:→|➜|➔|⟶|⇒|->|=>|›|»|➡️?)\s*/g;
const STRAY_SYMBOLS = /[←↑↓↗↘↖↙⇐⇑⇓•▪▸►▶◆◇■□●○★☆✓✔✗✘✱✳※†‡§¶#|~^`_*\\]/g;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** Endings a sentence already has, so a list item is not given a second one. */
const ENDS_SENTENCE = /[.!?…:;]$/;

export function speakable(text: string): string {
  if (!text.trim()) return "";
  const sentences: string[] = [];
  for (const block of parseReply(text)) {
    if (block.kind === "paragraph") sentences.push(inlineText(block.inlines));
    else for (const item of block.items) sentences.push(inlineText(item));
  }
  return sentences
    .map((sentence) => tidy(sentence))
    .filter(Boolean)
    .map((sentence) => (ENDS_SENTENCE.test(sentence) ? sentence : `${sentence}.`))
    .join(" ");
}

function inlineText(inlines: readonly { kind: string; text?: string; label?: string }[]): string {
  return inlines.map((inline) => (inline.kind === "link" ? (inline.label ?? "") : (inline.text ?? ""))).join("");
}

function tidy(raw: string): string {
  return (
    raw
      .replace(URL, "")
      // "Settings → AI Assistant": a path through screens, said the way a person gives directions.
      .replace(ARROWS, ", then ")
      .replace(/(^|\s), then /g, "$1")
      // "4.4 km", "450 m", "★4.5": units and ratings said in full, before emoji go.
      .replace(/★\s?(\d(?:\.\d)?)/g, "rated $1")
      .replace(/(\d)\s?km\b/g, "$1 kilometres")
      .replace(/(\d)\s?m\b(?!\w)/g, "$1 metres")
      .replace(EMOJI, "")
      .replace(/\s*·\s*/g, ", ")
      .replace(/\s+&\s+/g, " and ")
      .replace(/\be\.g\.\s*/gi, "for example ")
      .replace(/\bi\.e\.\s*/gi, "that is ")
      .replace(/\betc\.?(?=\s|$)/gi, "and so on")
      .replace(STRAY_SYMBOLS, " ")
      // Brackets read as asides; quotation marks are not read at all.
      .replace(/[()[\]{}]/g, ", ")
      .replace(/["“”]/g, "")
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,;:—-]+|[\s,;:—-]+$/g, "")
      .trim()
  );
}

/** Words that mark a browser voice as one of the good ones, rather than a robotic fallback. */
const NATURAL_VOICE = /natural|neural|online|enhanced|premium|siri|google|wavenet|studio/i;
const ROBOTIC_VOICE = /espeak|compact|festival|mbrola|novelty|bad news|bells|boing|bubbles|cellos|deranged|hysterical|trinoids|whisper|zarvox|albert|jester|organ|superstar/i;

/** How natural a browser voice is likely to sound: higher is better. */
export function voiceQuality(voice: { name: string; localService?: boolean }): number {
  let score = 0;
  if (NATURAL_VOICE.test(voice.name)) score += 2;
  if (ROBOTIC_VOICE.test(voice.name)) score -= 5;
  return score;
}

/**
 * A spoken reply in the pieces it is synthesised in, in order: the first
 * sentence on its own, so it can start playing while the rest is still being
 * made, then the rest in a few pieces of whole sentences. A sentence is never
 * split, and a piece too short to be worth a request of its own joins the one
 * after it. Text with one sentence comes back as itself.
 */
export function speechChunks(text: string, options: { first?: number; rest?: number } = {}): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [clean];
  const firstMin = options.first ?? 24;
  const restMax = options.rest ?? 320;
  const chunks: string[] = [];
  let index = 0;
  let first = "";
  while (index < sentences.length && (first.length < firstMin || first === "")) first = `${first} ${sentences[index++]}`.trim();
  chunks.push(first);
  let piece = "";
  for (; index < sentences.length; index += 1) {
    const next = sentences[index]!;
    if (piece && piece.length + next.length + 1 > restMax) {
      chunks.push(piece);
      piece = next;
    } else piece = `${piece} ${next}`.trim();
  }
  if (piece) chunks.push(piece);
  return chunks;
}

/** A reply this many spoken words or fewer is read out whole. */
export const SPOKEN_WHOLE_WORDS = 40;
/** At most this many of a list's items are named when a long reply is summarised. */
const SUMMARY_ITEMS = 5;

/**
 * A long reply, heard (the owner, 2026-10-20: "writing a message like this is
 * okay, but while reading it out, just give a concise summary").
 *
 * The written reply stays whole on screen; only what is spoken shrinks. A
 * short reply is read as it is. A longer one is read as its opening sentence
 * and then what its list is about — each item's bold lead ("Today", "Food",
 * "Birthday") or, without one, its words up to a dash or colon — named once,
 * five at most, then `tail` ("The rest is on screen.") in the reader's own
 * language. Nothing is invented: every word spoken is a word of the reply.
 */
export function spokenSummary(text: string, options: { language?: string; tail?: string; more?: (count: number) => string } = {}): string {
  const whole = speakable(text);
  if (whole.split(/\s+/).filter(Boolean).length <= SPOKEN_WHOLE_WORDS) return whole;

  const blocks = parseReply(text);
  const firstParagraph = blocks.find((block) => block.kind === "paragraph");
  const opening = firstParagraph && firstParagraph.kind === "paragraph" ? tidy(inlineText(firstParagraph.inlines)) : "";
  // The opening sentence only, and never more than about thirty words of it.
  const firstSentence = opening.match(/^.*?[.!?:](?=\s|$)/)?.[0] ?? opening;
  const lead = firstSentence.split(/\s+/).length > 30 ? `${firstSentence.split(/\s+/).slice(0, 30).join(" ")}…` : firstSentence;

  const heads: string[] = [];
  for (const block of blocks) {
    if (block.kind !== "list") continue;
    for (const item of block.items) {
      const first = item[0];
      const head = first && first.kind === "bold" ? first.text : (inlineText(item).split(/\s+[—–-]\s+|:\s/)[0] ?? "").split(/\s+/).slice(0, 6).join(" ");
      const said = tidy(head).replace(/[.,;:]+$/, "");
      if (said && !heads.includes(said)) heads.push(said);
    }
  }
  if (heads.length === 0) {
    // No list to name: the opening and the tail, or the first sentences up to the limit.
    const sentences = whole.match(/[^.!?]+[.!?]+/g) ?? [whole];
    let spoken = "";
    for (const sentence of sentences) {
      const next = `${spoken} ${sentence.trim()}`.trim();
      if (next.split(/\s+/).length > SPOKEN_WHOLE_WORDS && spoken) break;
      spoken = next;
    }
    return [spoken, options.tail].filter(Boolean).join(" ");
  }

  const named = heads.slice(0, SUMMARY_ITEMS);
  const left = heads.length - named.length;
  let list: string;
  try {
    list = new Intl.ListFormat(options.language ?? "en", { style: "long", type: "conjunction" }).format(left > 0 && options.more ? [...named, options.more(left)] : named);
  } catch {
    list = named.join(", ");
  }
  const leadSaid = lead ? (/[.!?:]$/.test(lead) ? lead : `${lead}:`) : "";
  return [leadSaid, `${list}.`, options.tail].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
