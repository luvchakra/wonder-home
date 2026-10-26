/**
 * A warm emoji on HomeTalk's replies (the owner, 2026-10-26: "use emojis
 * wherever you can, keep it professional, friendly, cheerful").
 *
 * Added after the reply is composed and validated, never asked of a model,
 * so `homebrain/validate.ts` checks exactly what it always did and the
 * emoji carries no fact. One per reply, two at most with the Undo line.
 * Never on a question, a refusal (safety, permissions, a plan), a failure,
 * the "Why?" evidence, or an answer about money, health or a child: those
 * stay plain. Spoken output drops every emoji (`speech.ts`).
 */

import type { ContentClass } from "../ai/privacy";
import type { IntentAction } from "./intent";
import type { Proposal } from "./proposal";
import { replyClassesFor } from "./reply-language";

const EMOJI = /\p{Extended_Pictographic}/u;
const SENSITIVE: ReadonlySet<ContentClass> = new Set(["health", "child", "financial"]);

/** The Undo line, said after something HomeTalk did because it was asked. */
export const UNDO_LINE = "Say **undo** to take it back ↩️";

/** What leads a confirmation, by what was done; anything else gets ✅. */
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
};

/** What leads an answer, by what was asked; anything else closes with 😊. */
const ANSWER: Partial<Record<IntentAction, string>> = {
  greet: "👋",
  find_places: "📍",
  open_screen: "👉",
};

export type WarmthInput = {
  action: IntentAction | null;
  proposal: Proposal["kind"] | null;
  /** False when the action was tried and did not go through. */
  ok: boolean;
  /** The "Why?" evidence: it comes from evidence, never style. */
  explained?: boolean;
  /** What the reply carries beyond the action's own classes (a HomeBrain answer's facts). */
  classes?: Iterable<ContentClass>;
};

/** The reply with its one warm emoji, or as it was where none belongs. */
export function warmReply(text: string, input: WarmthInput): string {
  const trimmed = text.trim();
  if (!trimmed || !input.ok || input.explained || !input.action || !input.proposal) return text;
  // Already warm (the Undo line, a catalog word): one is enough.
  if (EMOJI.test(trimmed.replace(UNDO_LINE, ""))) return text;
  const sensitive = [...replyClassesFor(input.action), ...(input.classes ?? [])].some((kind) => SENSITIVE.has(kind));
  switch (input.proposal) {
    case "executed":
      return `${DONE[input.action] ?? "✅"} ${trimmed}`;
    case "answer": {
      if (sensitive || input.action === "check_agents") return text;
      const lead = ANSWER[input.action];
      return lead ? `${lead} ${trimmed}` : `${trimmed} 😊`;
    }
    case "prepared":
    case "needs_approval":
      return sensitive ? text : `📝 ${trimmed}`;
    default:
      return text;
  }
}

/** "Undo" worked: said with the same warmth. */
export function warmUndo(text: string): string {
  return EMOJI.test(text) ? text : `↩️ ${text.trim()}`;
}
