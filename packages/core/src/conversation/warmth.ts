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
 *    own line, the first led by 💡, and the Undo line on its own line.
 * Never an emoji on a refusal, a failure, the "Why?" evidence, or a reply
 * about money, health or a child (those are still laid out, plainly).
 * Spoken output drops every emoji and reads each line as a sentence
 * (`speech.ts`).
 */

import type { ContentClass } from "../ai/privacy";
import type { IntentAction } from "./intent";
import type { Proposal } from "./proposal";
import { replyClassesFor } from "./reply-language";

const EMOJI = /\p{Extended_Pictographic}/u;
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
};

/** What leads an answer, by what was asked; anything else closes with 😊. */
const ANSWER: Partial<Record<IntentAction, string>> = {
  greet: "👋",
  find_places: "📍",
  open_screen: "👉",
};

/** A sentence that suggests what to say or do next. */
const HINT = /^(?:For example|Or say|Or just say|You can also|You could also|Or you can|Try saying)\b/;

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
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (/^(?:[-*•]|\d+[.)])\s/.test(line) || !line) {
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

/** The reply, warm and laid out, or exactly as it was where neither belongs. */
export function warmReply(text: string, input: WarmthInput): string {
  const trimmed = text.trim();
  if (!trimmed || input.explained) return text;
  const plain = !input.ok || !input.action || !input.proposal || input.proposal === "refused";
  const sensitive = !input.action || [...replyClassesFor(input.action), ...(input.classes ?? [])].some((kind) => SENSITIVE.has(kind));
  // Already warm (a catalog word, a model's own): its layout still helps.
  const warm = EMOJI.test(trimmed.replace(UNDO_LINE, ""));
  const shaped = shapeReply(trimmed, { emoji: !plain && !sensitive });
  if (plain || warm) return shaped;
  const action = input.action!;
  switch (input.proposal) {
    case "executed":
      return `${DONE[action] ?? "✅"} ${shaped}`;
    case "clarify":
      return sensitive ? shaped : `${DONE[action] ?? "🤔"} ${shaped}`;
    case "answer": {
      if (sensitive || action === "check_agents") return shaped;
      const lead = ANSWER[action];
      if (lead) return `${lead} ${shaped}`;
      return shaped.includes("\n") ? `📋 ${shaped}` : `${shaped} 😊`;
    }
    case "prepared":
    case "needs_approval":
      return sensitive ? shaped : `📝 ${shaped}`;
    default:
      return shaped;
  }
}

/** "Undo" worked: said with the same warmth. */
export function warmUndo(text: string): string {
  return EMOJI.test(text) ? text : `↩️ ${text.trim()}`;
}
