import { resolveRuleIntent } from "./rules";
import type { IntentAction } from "./intent";

/**
 * Whether a sentence is a request for HomeTalk to do or show something,
 * rather than an answer to a question HomeTalk asked.
 *
 * Ask me about family and the welcome both take the next turn as the answer
 * to their question. A question back already went to the ordinary turn; a
 * request did not, so "remind me to call the plumber in 10 minutes" was read
 * as how Manan is related to you, failed, and the question was asked again
 * (the owner, 2026-10-23). A request goes to the ordinary turn instead, and
 * the waiting question rests until it is asked for again.
 *
 * Two readings, both rules:
 * - the rule reader names an action that only a request carries;
 * - or the sentence opens the way a request does ("call the plumber
 *   tomorrow", "I need to buy milk"), for what only a model would read.
 *
 * Actions an answer can also read as stay answers: a food like or dislike
 * (`set_preference`), who does a duty (`assign_responsibility`), a helper's
 * days (`adjust_schedule`, `record_absence`) and a health note.
 */
const REQUEST_ACTIONS: ReadonlySet<IntentAction> = new Set<IntentAction>([
  "ask_status",
  "check_agents",
  "add_to_list",
  "set_reminder",
  "remove_from_list",
  "set_stock",
  "use_stock",
  "mark_bought",
  "complete_school_item",
  "raise_service_request",
  "make_payment",
  "add_bill",
  "record_bill_payment",
  "set_bill_amount",
  "order_items",
  "plan_event",
  "plan_meal",
  "record_health_appointment",
  "log_vital",
  "set_fitness_goal",
  "find_places",
  "open_screen",
]);

const REQUEST_OPENING =
  /^(?:please\s+|hey\s+wonderhome[,\s]+|wonderhome[,\s]+)?(?:remind|add|put|buy|plan|schedule|book|cancel|delete|remove|reschedule|create|show|open|take me|go to|navigate|find|search|look up|order|pay|send|invite|call|text|message|tell me|help me|set (?:a|an|up)\b|make (?:a|an)\b|i (?:need|want|have) to\b|we (?:need|have) to\b)/i;

export function readsAsRequest(utterance: string): boolean {
  const text = utterance.trim();
  if (!text) return false;
  if (REQUEST_OPENING.test(text)) return true;
  const read = resolveRuleIntent(text, { actorMemberId: "speaker", channel: "text" });
  return REQUEST_ACTIONS.has(read.action);
}
