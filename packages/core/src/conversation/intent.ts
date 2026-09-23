/**
 * Typed household intents (stories 04-001, 04-002, 04-003).
 *
 * The story's requirement is that "the same household request is represented by
 * a typed intent with actor, target, parameters and requested action regardless
 * of whether it arrived as text or speech". So speech and text converge here,
 * before anything is decided: there is one engine, and the channel is metadata
 * on the way in rather than a second code path.
 *
 * An intent is a *request*, never an authorization. What happens to it is
 * decided afterwards by permission, autonomy policy and entitlement — none of
 * which the model gets a vote on.
 */

export const INTENT_ACTIONS = [
  "record_absence",
  "add_to_list",
  "ask_status",
  /** "Check on things" — runs the household's specialists for real (14-007). */
  "check_agents",
  "plan_event",
  /** "Plan pasta for tonight" — a real meal on the household's plan, with its recipe's ingredients (Wave 4 §11). */
  "plan_meal",
  /** "Remind me to buy them tomorrow" — a real in-app reminder to the speaker, due at that time (Wave 4 §10). */
  "set_reminder",
  "adjust_schedule",
  "set_preference",
  "make_payment",
  "order_items",
  "assign_responsibility",
  /** "I have a dentist appointment next Tuesday at 4" — books a real appointment via the governed health service. */
  "record_health_appointment",
  /** "I've had a headache since yesterday" — records a real health issue, never a diagnosis. */
  "log_health_issue",
  /** "My headache is gone" — resolves an open health issue for the speaker. */
  "resolve_health_issue",
  /** "My BP was 128 over 82 this morning" — records a real vital reading via the governed health service. */
  "log_vital",
  /** "I want to walk three times a week" — sets a real, consistency-oriented fitness goal via the governed health service; never scored, never a leaderboard entry. */
  "set_fitness_goal",
  /** A hello, a thank-you, or "what can you do?" — answered warmly, never as a failure to understand. */
  "greet",
  "unknown",
] as const;
export type IntentAction = (typeof INTENT_ACTIONS)[number];

/**
 * How an intent came to be understood. Never a decision input — every gate
 * downstream runs the same whatever produced the intent — but the honest
 * reply depends on it: "I did not follow that" and "I could not reach my
 * model" are different sentences, and only one of them is true at a time.
 */
export type UnderstandingTrace = {
  source: "fixture" | "rules" | "model";
  provider?: "anthropic" | "google" | "openai";
  /** Set when a model was asked and did not answer usably. */
  failure?: "provider_error" | "unparseable";
};

export type IntentTarget = {
  /** What the request is about: an outcome key, a member, a list. */
  kind: "outcome" | "member" | "list" | "event" | "bill" | "unspecified";
  reference?: string;
};

export type HouseholdIntent = {
  action: IntentAction;
  actorMemberId: string;
  target: IntentTarget;
  parameters: Record<string, unknown>;
  /** 0–1. Low confidence on a consequential action means asking, not guessing. */
  confidence: number;
  /** The channel it arrived on. Metadata, never a behavioural fork. */
  channel: "text" | "voice";
  /** What the person actually said, kept for the action preview. */
  utterance: string;
  /** Where the understanding came from. Informational only. */
  understanding?: UnderstandingTrace;
};

/** Actions where guessing wrong costs the household something real. */
const CONSEQUENTIAL: ReadonlySet<IntentAction> = new Set([
  "make_payment",
  "order_items",
  "assign_responsibility",
  "adjust_schedule",
]);

export function isConsequential(action: IntentAction): boolean {
  return CONSEQUENTIAL.has(action);
}

/**
 * Below this, a consequential intent is not acted on. Ambiguity resolves to a
 * clarifying question rather than a confident mistake — the product would
 * rather ask than quietly pay the wrong bill.
 */
export const CLARIFY_BELOW_CONFIDENCE = 0.75;

export type IntentDisposition = { kind: "clarify"; question: string } | { kind: "proceed" };

/** What the assistant can be asked, in the household's words — offered whenever it did not follow. */
export const WHAT_I_CAN_DO =
  "You can ask what needs attention, add something to the groceries, tell me who is away, ask about a bill, or say what the family prefers.";

export function disposeIntent(intent: HouseholdIntent): IntentDisposition {
  if (intent.action === "unknown") {
    // The rules understood the topic but not the one detail that makes it
    // actionable ("change dinner on Saturday" — to what?). A specific question
    // beats "I did not follow that", which is not true.
    if (typeof intent.parameters.clarify === "string" && intent.parameters.clarify.trim()) {
      return { kind: "clarify", question: intent.parameters.clarify };
    }
    if (intent.understanding?.failure) {
      return {
        kind: "clarify",
        question: "I could not reach my model just now, so I did not understand that. Try again in a moment, or say it another way.",
      };
    }
    return {
      kind: "clarify",
      question: `I did not follow that. ${WHAT_I_CAN_DO} What would you like?`,
    };
  }

  if (isConsequential(intent.action) && intent.confidence < CLARIFY_BELOW_CONFIDENCE) {
    return { kind: "clarify", question: clarifyingQuestionFor(intent) };
  }

  if (intent.target.kind === "unspecified" && intent.action !== "ask_status" && intent.action !== "check_agents") {
    return { kind: "clarify", question: "Which one did you mean?" };
  }

  return { kind: "proceed" };
}

function clarifyingQuestionFor(intent: HouseholdIntent): string {
  switch (intent.action) {
    case "make_payment":
      return "Which bill would you like me to pay, and for how much?";
    case "order_items":
      return "What would you like me to order?";
    case "assign_responsibility":
      return "Who should take that on?";
    case "adjust_schedule":
      return "What should move, and to when?";
    default:
      return "Could you say a little more about what you would like?";
  }
}

/**
 * Short replies (story 04-003).
 *
 * "Yes", "no" and "do it" only mean something in the context of what was just
 * proposed. Resolving them here — rather than sending them to a model as if
 * they were fresh requests — is what stops a stray "yes" approving something
 * the person has forgotten about.
 */
export type PendingProposal = {
  actionId: string;
  summary: string;
  /** Proposals do not wait indefinitely; a stale yes is not consent. */
  expiresAt: Date;
};

export type ShortReply = "affirm" | "decline" | "unclear";

export function classifyShortReply(utterance: string): ShortReply {
  const normalized = utterance.trim().toLowerCase().replace(/[.!]+$/, "");

  if (/^(yes|yep|yeah|sure|ok|okay|do it|go ahead|please do|confirm)$/.test(normalized)) {
    return "affirm";
  }
  if (/^(no|nope|don'?t|cancel|stop|not now|leave it)$/.test(normalized)) return "decline";
  return "unclear";
}

export type ShortReplyResolution =
  | { kind: "approve"; actionId: string }
  | { kind: "reject"; actionId: string }
  | { kind: "no_pending_proposal" }
  | { kind: "expired"; summary: string }
  | { kind: "not_a_short_reply" };

export function resolveShortReply(
  utterance: string,
  pending: PendingProposal | null,
  now: Date = new Date(),
): ShortReplyResolution {
  const reply = classifyShortReply(utterance);
  if (reply === "unclear") return { kind: "not_a_short_reply" };

  if (!pending) return { kind: "no_pending_proposal" };
  if (pending.expiresAt <= now) return { kind: "expired", summary: pending.summary };

  return reply === "affirm"
    ? { kind: "approve", actionId: pending.actionId }
    : { kind: "reject", actionId: pending.actionId };
}
