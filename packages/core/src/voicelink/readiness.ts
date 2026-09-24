import { resolveDeterministicIntent } from "../conversation/engine";
import { INTENT_ACTIONS, type IntentAction } from "../conversation/intent";
import { ALEXA_STATUS_INTENT, alexaTurn } from "./alexa";
import { VOICE_CAPABILITIES } from "./capabilities";
import { GEMINI_LIVE_TOOL_NAMES, utteranceForToolCall } from "./gemini-live";
import { VOICE_SCOPES, voiceAllowsAction } from "./scopes";

/**
 * The voice release gate (voice integration phase 6, "Release gates"),
 * decided deterministically, with no model and no network:
 *
 *   - every golden Gemini tool call becomes a sentence HomeTalk's own rules
 *     read as the action the tool promised (so a structured call never
 *     silently falls back to a model, or lands on the wrong action);
 *   - every golden Alexa carrier phrase does the same;
 *   - every HomeTalk action is placed in the capability matrix exactly once,
 *     and every Gemini tool is named there;
 *   - every capability the matrix keeps in the app is refused over voice by
 *     the gate itself, whatever scopes a link holds.
 *
 * The provider end-to-end runs (a real Gemini Live session, a real Alexa
 * skill) are not decided here — they need a person's account — and the
 * gate's evidence says so rather than claiming them.
 */

export type VoiceGolden = { name: string; args: Record<string, unknown>; action: IntentAction; parameters?: Record<string, unknown> };

export const GEMINI_GOLDEN: readonly VoiceGolden[] = [
  { name: "get_household_status", args: {}, action: "ask_status" },
  { name: "get_today_agenda", args: {}, action: "ask_status" },
  { name: "get_upcoming_events", args: { when: "tomorrow" }, action: "ask_status" },
  { name: "get_upcoming_events", args: {}, action: "ask_status" },
  { name: "get_meal_plan", args: { when: "tonight" }, action: "ask_status" },
  { name: "get_grocery_status", args: { item: "milk" }, action: "ask_status" },
  { name: "get_grocery_status", args: {}, action: "ask_status" },
  { name: "get_school_items", args: { child: "Asmi" }, action: "ask_status" },
  { name: "get_school_items", args: {}, action: "ask_status" },
  { name: "get_bill_status", args: {}, action: "ask_status" },
  { name: "get_recent_household_activity", args: {}, action: "ask_status" },
  { name: "add_grocery_item", args: { item: "bananas" }, action: "add_to_list", parameters: { item: "bananas" } },
  { name: "add_grocery_item", args: { item: "milk", quantity: "2 litres" }, action: "add_to_list" },
  { name: "create_reminder", args: { what: "call the plumber", when: "tomorrow at 9am" }, action: "set_reminder", parameters: { what: "call the plumber", when: "tomorrow", time: "9am" } },
  { name: "create_reminder", args: { what: "buy milk", when: "tomorrow" }, action: "set_reminder", parameters: { what: "buy milk", when: "tomorrow" } },
];

export const ALEXA_GOLDEN: readonly { intent: string; slot: string; action: IntentAction }[] = [
  { intent: "WonderHomeWhatsIntent", slot: "for dinner", action: "ask_status" },
  { intent: "WonderHomeAddIntent", slot: "bananas to the grocery list", action: "add_to_list" },
  { intent: "WonderHomeRemindMeIntent", slot: "to buy milk tomorrow", action: "set_reminder" },
  { intent: "WonderHomeQueryIntent", slot: "what's happening tomorrow", action: "ask_status" },
  { intent: ALEXA_STATUS_INTENT, slot: "", action: "ask_status" },
  { intent: "WonderHomeSetIntent", slot: "a reminder to call the plumber tomorrow", action: "set_reminder" },
  { intent: "WonderHomeCreateIntent", slot: "a reminder about the school meeting", action: "set_reminder" },
  { intent: "WonderHomeAnythingIntent", slot: "I need to do today", action: "ask_status" },
];

/** What HomeTalk hears for an Alexa intent — through the adapter's own mapping, not a copy of it. */
export function alexaText(intent: string, slot: string): string {
  const turn = alexaTurn({ requestId: "golden", timestamp: "", type: "IntentRequest", intent, utterance: slot || null, applicationId: null, accessToken: null, sessionId: null, locale: null });
  return turn.kind === "hometalk" ? turn.text : "";
}

const read = (text: string) => resolveDeterministicIntent(text, { actorMemberId: "golden", channel: "voice" });

function matches(parameters: Record<string, unknown>, expected: Record<string, unknown> | undefined): boolean {
  return !expected || Object.entries(expected).every(([key, value]) => parameters[key] === value);
}

export function voiceReadiness(): { pass: boolean; evidence: string; failures: string[] } {
  const failures: string[] = [];

  let geminiPassed = 0;
  for (const golden of GEMINI_GOLDEN) {
    const call = utteranceForToolCall(golden.name, golden.args);
    if (!("text" in call) || !call.structured) {
      failures.push(`${golden.name}: not a structured sentence`);
      continue;
    }
    const intent = read(call.text);
    if (intent.action === golden.action && intent.confidence >= 0.8 && matches(intent.parameters, golden.parameters)) geminiPassed += 1;
    else failures.push(`${golden.name} "${call.text}" → ${intent.action} (${intent.confidence})`);
  }

  let alexaPassed = 0;
  for (const golden of ALEXA_GOLDEN) {
    const action = read(alexaText(golden.intent, golden.slot)).action;
    if (action === golden.action) alexaPassed += 1;
    else failures.push(`${golden.intent} "${golden.slot}" → ${action}`);
  }

  const unplaced = INTENT_ACTIONS.filter((action) => VOICE_CAPABILITIES.filter((capability) => capability.actions.includes(action)).length !== 1);
  if (unplaced.length > 0) failures.push(`actions not placed exactly once in the capability matrix: ${unplaced.join(", ")}`);
  const named = new Set(VOICE_CAPABILITIES.flatMap((capability) => capability.geminiTools));
  const unnamed = GEMINI_LIVE_TOOL_NAMES.filter((tool) => !named.has(tool));
  if (unnamed.length > 0) failures.push(`Gemini tools missing from the matrix: ${unnamed.join(", ")}`);

  const appOnly = VOICE_CAPABILITIES.filter((capability) => capability.policy.alexa === "app_only" || capability.policy.gemini_voice === "app_only").flatMap((capability) => capability.actions);
  const leaking = appOnly.filter((action) => voiceAllowsAction(action, [...VOICE_SCOPES]));
  if (leaking.length > 0) failures.push(`app-only actions allowed over voice: ${leaking.join(", ")}`);

  const pass = failures.length === 0;
  const evidence =
    `${geminiPassed}/${GEMINI_GOLDEN.length} Gemini tool sentences and ${alexaPassed}/${ALEXA_GOLDEN.length} Alexa phrases read as the promised action; ` +
    `${INTENT_ACTIONS.length - unplaced.length}/${INTENT_ACTIONS.length} actions placed in the capability matrix; ` +
    `${appOnly.length - leaking.length}/${appOnly.length} app-only actions refused over voice. ` +
    `A real Gemini Live and Alexa run need a person's account and are not decided here.` +
    (pass ? "" : ` Failing: ${failures.join("; ")}.`);
  return { pass, evidence, failures };
}
