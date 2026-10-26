/**
 * HomeTalk's replies, warm and laid out for a phone (the owner, 2026-10-26:
 * "use emojis wherever you can, keep it professional, friendly, cheerful";
 * then "make the responses nicely structured, and use emojis. build these
 * deeply into HomeTalk").
 *
 * Applied after the reply is composed and validated, never asked of a model,
 * so `homebrain/validate.ts` checks exactly what it always did and no emoji
 * carries a fact. What it does:
 *  - leads a confirmation with what was done (🛒, ⏰, 📅 … else ✅), a
 *    question with what it is about (🛒 … else 🤔), a preview with 📝, and
 *    a greeting, a place or a screen with 👋 📍 👉; closes a one-line
 *    answer with 😊 and leads a longer one with 📋;
 *  - puts each hint ("For example …", "Or say …", "You can also …") on its
 *    own line, the first led by 💡, and the Undo line on its own line;
 *  - unfolds a run of three or more things joined by semicolons into a line
 *    each (`unfold`), whoever wrote it, a model included.
 * Never an emoji on a refusal, a failure or the "Why?" evidence (still laid
 * out, plainly). A reply about money, health or a child is led by a neutral
 * mark for its topic (🧾, 🩺, 🎒, 📋), never closed with a smile.
 * Spoken output drops every emoji and reads each line as a sentence
 * (`speech.ts`).
 */

import type { ContentClass } from "../ai/privacy";
import type { IntentAction } from "./intent";
import type { Proposal } from "./proposal";
import { replyClassesFor } from "./reply-language";

/**
 * A real emoji: one drawn as a picture, or a symbol asked to be one (U+FE0F).
 * "★4.8" in a place's rating is a symbol, not warmth (2026-10-26: it kept a
 * place answer from its 📍).
 */
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\u{FE0F}/u;
const SENSITIVE: ReadonlySet<ContentClass> = new Set(["health", "child", "financial"]);

/** The Undo line, said after something HomeTalk did because it was asked. */
export const UNDO_LINE = "Say **undo** to take it back ↩️";

/** What leads a confirmation or a question, by what it is about; else ✅ (done) or 🤔 (asked). */
const DONE: Partial<Record<IntentAction, string>> = {
  add_to_list: "🛒",
  remove_from_list: "🛒",
  mark_bought: "🛒",
  set_stock: "📦",
  use_stock: "📦",
  set_reminder: "⏰",
  plan_event: "📅",
  adjust_schedule: "📅",
  plan_meal: "🍽️",
  record_absence: "🗓️",
  set_preference: "👍",
  assign_responsibility: "🤝",
  raise_service_request: "🔧",
  file_with_homesend: "📥",
  complete_homesend_item: "📥",
  fill_homesend_details: "📥",
  add_bill: "🧾",
  record_bill_payment: "🧾",
  set_bill_amount: "🧾",
  make_payment: "🧾",
  order_items: "🛒",
  complete_school_item: "🎒",
  record_health_appointment: "🩺",
  log_health_issue: "🩺",
  resolve_health_issue: "🩺",
  log_vital: "🩺",
  set_fitness_goal: "🏃",
  find_places: "📍",
};

/** What an answer is about, from the first screen it links to. */
const SCREEN: readonly [RegExp, string][] = [
  [/^\/(?:calendar|today)\b/, "📅"],
  [/^\/groceries\b/, "🛒"],
  [/^\/meals\b/, "🍽️"],
  [/^\/bills\b/, "🧾"],
  [/^\/school\b/, "🎒"],
  [/^\/health\b/, "🩺"],
  [/^\/places\b/, "📍"],
  [/^\/home-send\b/, "📥"],
  [/^\/(?:househelper|household)\b/, "🏠"],
];

/** …or, with no link, from the words of its opening line. */
const WORDS: readonly [RegExp, string][] = [
  [/\b(?:calendar|weekends?|holidays?|events?|plans?|free)\b/i, "📅"],
  [/\b(?:grocer(?:y|ies)|shopping list)\b/i, "🛒"],
  [/\b(?:meals?|dinner|lunch|breakfast)\b/i, "🍽️"],
  [/\bbills?\b/i, "🧾"],
  [/\b(?:school|homework)\b/i, "🎒"],
  [/\bplaces?\b/i, "📍"],
];

function topicOf(text: string): string | null {
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const found = SCREEN.find(([pattern]) => pattern.test(match[1]!));
    if (found) return found[1];
  }
  const first = text.split("\n")[0] ?? "";
  return WORDS.find(([pattern]) => pattern.test(first))?.[1] ?? null;
}

/** What leads an answer, by what was asked; anything else closes with 😊. */
const ANSWER: Partial<Record<IntentAction, string>> = {
  greet: "👋",
  find_places: "📍",
  open_screen: "👉",
};

/** A sentence that suggests what to say or do next. */
const HINT = /^(?:For example|Or say|Or just say|You can also|You could also|Or you can|Try saying|Save the ones you like)\b/;

export type WarmthInput = {
  action: IntentAction | null;
  proposal: Proposal["kind"] | null;
  /** False when the action was tried and did not go through, or the model could not be reached. */
  ok: boolean;
  /** The "Why?" evidence: it comes from evidence, never style, and is left exactly as it is. */
  explained?: boolean;
  /** What the reply carries beyond the action's own classes (a HomeBrain answer's facts). */
  classes?: Iterable<ContentClass>;
};

/**
 * Each hint on its own line, the first led by 💡 when emoji are welcome, and
 * the Undo line on its own. A bullet line is never split.
 */
export function shapeReply(text: string, options: { emoji: boolean } = { emoji: true }): string {
  const lines: string[] = [];
  let hinted = false;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n").flatMap((line) => unfold(line.trim()))) {
    const line = raw.trim();
    if (/^(?:[-*•◦]|\d+[.)])\s/.test(line) || !line) {
      lines.push(line);
      continue;
    }
    const withUndo = line.includes(UNDO_LINE) && line !== UNDO_LINE ? line.replace(UNDO_LINE, "\n" + UNDO_LINE) : line;
    for (const part of withUndo.split("\n")) {
      const sentences = part.trim().split(/(?<=[.?!]["”]?)\s+(?=[A-Z])/);
      let current: string[] = [];
      for (const sentence of sentences) {
        if (HINT.test(sentence)) {
          if (current.length > 0) lines.push(current.join(" "));
          current = [];
          lines.push(options.emoji && !hinted && !EMOJI.test(sentence) ? `💡 ${sentence}` : sentence);
          hinted = true;
        } else current.push(sentence);
      }
      if (current.length > 0) lines.push(current.join(" "));
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * A run of three or more things joined by semicolons, one per line under its
 * label: "Guests: Riya said yes; Dev said yes; Meera said maybe" becomes
 * "Guests:" and a "◦" line each (HomeTalk's reply rule, 2026-10-26). A line
 * with no label before the run is left as it is.
 */
export function unfold(line: string): string[] {
  const parts = line.split(/;\s+/);
  const label = parts[0]!.lastIndexOf(": ");
  if (parts.length < 3 || label < 0) return [line];
  return [parts[0]!.slice(0, label + 1), ...[parts[0]!.slice(label + 2), ...parts.slice(1)].map((part) => `◦ ${part.trim()}`)];
}

/** The reply, warm and laid out, or exactly as it was where neither belongs. */
export function warmReply(text: string, input: WarmthInput): string {
  const trimmed = text.trim();
  if (!trimmed || input.explained) return text;
  const plain = !input.ok || !input.action || !input.proposal || input.proposal === "refused";
  const sensitive = !input.action || [...replyClassesFor(input.action), ...(input.classes ?? [])].some((kind) => SENSITIVE.has(kind));
  // Already warm (a catalog word, a model's own): its layout still helps.
  const warm = EMOJI.test(trimmed.replace(UNDO_LINE, ""));
  const shaped = shapeReply(trimmed, { emoji: !plain });
  if (plain || warm) return shaped;
  const action = input.action!;
  switch (input.proposal) {
    case "executed":
      return `${DONE[action] ?? "✅"} ${shaped}`;
    case "clarify":
      return `${DONE[action] ?? topicOf(shaped) ?? "🤔"} ${shaped}`;
    case "answer": {
      const lead = ANSWER[action] ?? topicOf(shaped);
      if (lead) return `${lead} ${shaped}`;
      // A one-line answer about ordinary things closes with a smile; anything longer, or about money, health or a child, is led.
      return shaped.includes("\n") || sensitive || action === "check_agents" ? `📋 ${shaped}` : `${shaped} 😊`;
    }
    case "prepared":
    case "needs_approval":
      return `📝 ${shaped}`;
    default:
      return shaped;
  }
}

/** "Undo" worked: said with the same warmth. */
export function warmUndo(text: string): string {
  return EMOJI.test(text) ? text : `↩️ ${text.trim()}`;
}
