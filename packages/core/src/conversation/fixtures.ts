import type { HouseholdIntent, IntentAction } from "./intent";

/**
 * Deterministic household utterances (stories 04-001, 04-002, 04-005, 04-008).
 *
 * Every story in module 04 asks for "representative household utterances as
 * deterministic regression fixtures". These are they — and they are also what
 * lets the whole module be built and tested before any provider key exists.
 *
 * The resolver below is not a model and does not pretend to be one. It is a
 * fixture lookup: it answers exactly these utterances and returns `unknown` for
 * anything else, so a test can never accidentally depend on it generalizing.
 * When a real provider is configured it replaces the resolver, and these same
 * fixtures become its regression suite.
 */

export type UtteranceFixture = {
  utterance: string;
  action: IntentAction;
  target: HouseholdIntent["target"];
  parameters: Record<string, unknown>;
  confidence: number;
  /** Why this is the expected reading, in the household's terms. */
  note: string;
};

export const UTTERANCE_FIXTURES: readonly UtteranceFixture[] = [
  {
    utterance: "Sunita won't be here tomorrow.",
    action: "record_absence",
    target: { kind: "member", reference: "sunita" },
    parameters: { when: "tomorrow" },
    confidence: 0.94,
    note: "The screens' canonical example. Recording the absence is the start; the household impact analysis follows from it.",
  },
  {
    utterance: "Add coriander to the grocery list.",
    action: "add_to_list",
    target: { kind: "list", reference: "groceries" },
    parameters: { item: "coriander" },
    confidence: 0.97,
    note: "Low risk and unambiguous, so it is simply done.",
  },
  {
    utterance: "How is Anaya's project coming along?",
    action: "ask_status",
    target: { kind: "member", reference: "anaya" },
    parameters: { subject: "school project" },
    confidence: 0.92,
    note: "A question changes nothing and needs no approval.",
  },
  {
    utterance: "Plan a family outing this weekend.",
    action: "plan_event",
    target: { kind: "event", reference: "family_time" },
    parameters: { window: "this weekend" },
    confidence: 0.88,
    note: "Planning produces a proposal, not a booking.",
  },
  {
    utterance: "Show me tomorrow's schedule.",
    action: "ask_status",
    target: { kind: "unspecified" },
    parameters: { when: "tomorrow" },
    confidence: 0.95,
    note: "An unspecified target is fine for a question; it means the whole day.",
  },
  {
    utterance: "Pay the electricity bill.",
    action: "make_payment",
    target: { kind: "bill", reference: "electricity" },
    parameters: {},
    confidence: 0.91,
    note: "Confident about what was meant — and still never executed without a person.",
  },
  {
    utterance: "Pay it.",
    action: "make_payment",
    target: { kind: "unspecified" },
    parameters: {},
    confidence: 0.42,
    note: "Consequential and ambiguous. This must produce a question, not a payment.",
  },
  {
    utterance: "Order the usual.",
    action: "order_items",
    target: { kind: "unspecified" },
    parameters: {},
    confidence: 0.55,
    note: "'The usual' is a guess dressed as a request; ask what it means.",
  },
  {
    utterance: "Priya handles the school run from now on.",
    action: "assign_responsibility",
    target: { kind: "member", reference: "priya" },
    parameters: { outcomeKey: "school.run" },
    confidence: 0.86,
    note: "Changing who is responsible is a household change, and the actor must be allowed to make it.",
  },
  {
    utterance: "We prefer dinner at 8.",
    action: "set_preference",
    target: { kind: "outcome", reference: "meals.dinner" },
    parameters: { time: "20:00" },
    confidence: 0.93,
    note: "An explicit statement of preference becomes household memory (story 04-007).",
  },
  {
    utterance: "Actually, dinner is at 7:30.",
    action: "set_preference",
    target: { kind: "outcome", reference: "meals.dinner" },
    parameters: { time: "19:30", corrects: true },
    confidence: 0.9,
    note: "A correction supersedes the earlier memory rather than adding a contradictory one (story 04-008).",
  },
  {
    utterance: "Move Aarav's karate class to Thursday.",
    action: "adjust_schedule",
    target: { kind: "event", reference: "karate.class" },
    parameters: { to: "thursday" },
    confidence: 0.89,
    note: "Consequential: other plans may depend on it, so it is previewed before it happens.",
  },
];

/**
 * Resolves a fixture utterance to an intent.
 *
 * Matching is exact, case- and punctuation-insensitive, and nothing else. A
 * near-miss returns `unknown`, which routes to a clarifying question — the same
 * thing a real provider should do when it is not sure.
 */
export function resolveFixtureIntent(
  utterance: string,
  context: { actorMemberId: string; channel: "text" | "voice" },
): HouseholdIntent {
  const normalized = normalize(utterance);
  const fixture = UTTERANCE_FIXTURES.find((entry) => normalize(entry.utterance) === normalized);

  if (!fixture) {
    return {
      action: "unknown",
      actorMemberId: context.actorMemberId,
      target: { kind: "unspecified" },
      parameters: {},
      confidence: 0,
      channel: context.channel,
      utterance,
    };
  }

  return {
    action: fixture.action,
    actorMemberId: context.actorMemberId,
    target: fixture.target,
    parameters: fixture.parameters,
    confidence: fixture.confidence,
    channel: context.channel,
    utterance,
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
}
