import { readWhyQuestion } from "../homebrain/why";
import type { AutonomyMode } from "../household/autonomy";
import type { PermissionContext } from "../identity/permissions";
import { answerClarification, clarificationFrom, escalatedQuestion, type PendingClarification } from "./clarify";
import { resolveFixtureIntent } from "./fixtures";
import { needsGrounding, type Grounding } from "./grounding";
import {
  isConsequential,
  resolveShortReply,
  type HouseholdIntent,
  type PendingProposal,
} from "./intent";
import { extractMemory, type Memory } from "./memory";
import { needsRecording, proposeFromIntent, type ActionPreview, type Proposal } from "./proposal";
import type { FocusEntity } from "./references";
import { resolveRuleIntent } from "./rules";

/**
 * One turn of conversation, from what was said to what WonderHome says back.
 *
 * Pure: everything it needs arrives as input and everything it decides leaves
 * as output, so the same turn can be run in a request, in a test and in an
 * evaluation and give the same answer. The route around it does the reading
 * and writing.
 *
 * Understanding defaults to `resolveFixtureIntent` — deterministic, and still
 * exactly right for a household with no model provider configured, per
 * CLAUDE.md's rule that a provider is live only once it is. The seam is
 * `understand`: a live provider (`ai/model-client.ts`'s
 * `createClaudeUnderstanding`) slots in there and nothing downstream changes,
 * because nothing downstream ever trusted the model with a decision — hence
 * `Understanding` may return a promise, but every gate after it still runs on
 * the plain `HouseholdIntent` it resolves to.
 */

/** Below this, a voice transcript is read back before it is acted on. */
export const CONFIRM_TRANSCRIPT_BELOW = 0.6;

/** How long a proposal waits for a yes before a stray yes stops counting. */
export const PROPOSAL_TTL_MINUTES = 10;

/**
 * One earlier turn of the same conversation, for an understanding that can
 * use it. Text only, already minimised and pseudonymised by the caller —
 * this type carries no household identity on purpose.
 */
export type ConversationTurn = { role: "member" | "assistant"; text: string };

/**
 * What the understanding is told about this moment (Wave 4 §17) — never
 * the household itself. Each line is already minimised by the caller: a
 * role, not a name; the local date and time; what is waiting; the labels of
 * the few things the conversation is about (people only as placeholders).
 */
export type RuntimeContext = {
  /** "an adult of the household", "a child", "a helper". */
  role: string;
  /** "Wednesday 23 September 2026, 18:10 (Asia/Kolkata)". */
  localDateTime: string;
  /** The proposal waiting for a yes, or the question just asked, in plain words. */
  pending?: string | null;
  /** What the last few turns were about: "milk", "Tomato pasta". */
  recent?: readonly string[];
};

export type Understanding = (
  utterance: string,
  context: { actorMemberId: string; channel: "text" | "voice"; history?: readonly ConversationTurn[]; runtime?: RuntimeContext },
) => HouseholdIntent | Promise<HouseholdIntent>;

/**
 * Understanding with no model: the taught fixtures first, then the rules.
 * Deterministic, and still the right answer for a household with no
 * provider configured, per CLAUDE.md's rule that a provider is live only
 * once it is.
 */
export function resolveDeterministicIntent(
  utterance: string,
  context: { actorMemberId: string; channel: "text" | "voice" },
): HouseholdIntent {
  const fixture = resolveFixtureIntent(utterance, context);
  if (fixture.action !== "unknown") return { ...fixture, understanding: { source: "fixture" } };
  return resolveRuleIntent(utterance, context);
}

export type TurnInput = {
  utterance: string;
  channel: "text" | "voice";
  /** From the speech recogniser; absent for text. */
  transcriptConfidence?: number;
  actor: PermissionContext & { memberId: string };
  /** The last proposal still waiting for a yes or no, if any. */
  pending: PendingProposal | null;
  /** Autonomy configured for the outcome an intent touches. */
  autonomyFor: (outcomeKey: string | null) => AutonomyMode;
  /** Whether the household's plan includes what the intent needs. */
  entitledFor: (intent: HouseholdIntent) => boolean;
  /**
   * Whether a governed tool exists that can carry this intent out right now.
   * Autonomy may say "execute", but a turn only claims "done" when something
   * actually did it; otherwise the proposal is downgraded to "prepared". Saying
   * done and doing nothing is the one lie this product must never tell.
   */
  executable?: (intent: HouseholdIntent) => boolean;
  sessionId: string;
  understand?: Understanding;
  /** Earlier turns of this session, for an understanding that can use them. */
  history?: readonly ConversationTurn[];
  /** This moment, for an understanding that is a model (§17). */
  runtime?: RuntimeContext;
  /**
   * The question WonderHome asked last turn, if it asked one. This turn is
   * read as the answer to it before it is read as anything else, and the
   * same question is never asked twice (story 04-011).
   */
  clarifying?: PendingClarification | null;
  /**
   * Grounding (Wave 4): turns an understood intent into the household's
   * own records — a member id, a local date, what "that" was — or into one
   * focused question. Runs before any proposal exists, and never
   * authorizes anything. Absent, the intent goes on exactly as understood.
   */
  ground?: (intent: HouseholdIntent) => Grounding | Promise<Grounding>;
  /**
   * What the channel the turn arrived on may ask for (a linked voice
   * assistant's scopes, voice phase 2). Checked as soon as the intent is
   * understood — before grounding asks anything and before any proposal —
   * and it only ever narrows: every other gate still runs on what it lets
   * through. Absent, the channel is the household's own app.
   */
  channelLimits?: { allows: (intent: HouseholdIntent) => boolean; refusal: string };
  now?: Date;
};

export type TurnResult =
  | { kind: "approve"; actionId: string; text: string }
  | { kind: "reject"; actionId: string; text: string }
  | { kind: "confirm_transcript"; text: string; heard: string }
  | {
      kind: "reply";
      intent: HouseholdIntent;
      proposal: Proposal;
      text: string;
      /** A proposal to write down for a later yes or no. */
      record: boolean;
      memory: Memory | null;
      /** Set when this turn asked a question, for the next turn to answer. */
      clarification?: PendingClarification | null;
      /** What this turn was about, for the next turn's "that" (Wave 4 §8, §16). */
      focus?: FocusEntity[];
    };

export async function converse(input: TurnInput): Promise<TurnResult> {
  const now = input.now ?? new Date();

  // "Yes", "no" and "do it" only mean something against what was just proposed.
  const short = resolveShortReply(input.utterance, input.pending, now);
  switch (short.kind) {
    case "approve":
      // Not "done": nothing has run yet. The route carries it out through the
      // governed executor and says what actually happened (Wave 2 §11).
      return { kind: "approve", actionId: short.actionId, text: "Got it — I have your go-ahead." };
    case "reject":
      return { kind: "reject", actionId: short.actionId, text: "Understood. I have left that alone." };
    case "no_pending_proposal":
      return {
        kind: "reply",
        intent: unknownIntent(input),
        proposal: { kind: "clarify", question: "There is nothing waiting for a yes right now. What would you like me to do?" },
        text: "There is nothing waiting for a yes right now. What would you like me to do?",
        record: false,
        memory: null,
      };
    case "expired":
      return {
        kind: "reply",
        intent: unknownIntent(input),
        proposal: { kind: "clarify", question: `That was a while ago, so I did not take it as a yes. Should I still "${short.summary}"?` },
        text: `That was a while ago, so I did not take it as a yes. Should I still "${lower(short.summary)}"?`,
        record: false,
        memory: null,
      };
    case "not_a_short_reply":
      break;
  }

  const understand = input.understand ?? resolveDeterministicIntent;
  const context = { actorMemberId: input.actor.memberId, channel: input.channel, history: input.history, runtime: input.runtime };

  // A question WonderHome asked is a promise to use the answer. Reading
  // this turn against it first is what stops the loop where the same
  // question comes back however clearly somebody answers it.
  // "Why are you asking me this?" is a question about the question, never its answer.
  const answered = input.clarifying && !readWhyQuestion(input.utterance)
    ? answerClarification(input.clarifying, input.utterance, {
        actorMemberId: input.actor.memberId,
        channel: input.channel,
      })
    : null;
  let intent = answered ?? (await understand(input.utterance, context));

  // A model that did not answer, or answered "unknown" for something the
  // rules plainly read, is not the last word: the rules are the safety net
  // under any understanding, so an outage degrades to "works for the
  // ordinary requests" rather than "understands nothing".
  if (!answered && intent.action === "unknown") {
    const fallback = resolveRuleIntent(input.utterance, context);
    if (fallback.action !== "unknown") {
      intent = fallback;
    } else if (intent.understanding?.failure) {
      // Keep the failure on the intent so the reply can say what actually
      // happened — unless the rules have a specific question to ask, which
      // is more useful than "I could not reach my model".
      intent = { ...fallback, understanding: fallback.parameters.clarify ? fallback.understanding : intent.understanding };
    } else if (fallback.parameters.clarify) {
      intent = fallback;
    }
  } else if (!answered && intent.understanding?.source === "model") {
    // The model and the rules can agree on what was asked while the model
    // leaves out a detail the rules read straight from the words — "remind
    // me to pick up coriander this evening" came back from a real model
    // with no day at all, and the turn asked "when?". Where both read the
    // same action, the rules fill only what the model left unsaid; nothing
    // the model did say is overwritten, and nothing is added that the
    // household's own words do not carry.
    const rules = resolveRuleIntent(input.utterance, context);
    if (rules.action === intent.action) {
      const filled: Record<string, unknown> = { ...intent.parameters };
      for (const [key, value] of Object.entries(rules.parameters)) {
        if (key !== "clarify" && (filled[key] === undefined || filled[key] === null)) filled[key] = value;
      }
      intent = { ...intent, parameters: filled };
    }
  }

  // Outside what this channel may ask for: refused before anything is asked
  // or proposed, the way a permission refusal is.
  if (input.channelLimits && !input.channelLimits.allows(intent)) {
    return {
      kind: "reply",
      intent,
      proposal: { kind: "refused", reason: input.channelLimits.refusal },
      text: input.channelLimits.refusal,
      record: false,
      memory: null,
    };
  }

  // A shaky transcript of something consequential is read back, never acted on.
  if (
    input.channel === "voice" &&
    typeof input.transcriptConfidence === "number" &&
    input.transcriptConfidence < CONFIRM_TRANSCRIPT_BELOW &&
    isConsequential(intent.action)
  ) {
    return {
      kind: "confirm_transcript",
      heard: input.utterance,
      text: `I heard "${input.utterance}" but I am not certain. Could you say that again, or type it?`,
    };
  }

  // Grounding (Wave 4 §6–§8): what was meant, given this household. A
  // mention becomes a member, a phrase a date, "that" the thing it was — or
  // the turn asks one focused question. Nothing is proposed from an intent
  // that still carries a guess.
  let focus: FocusEntity[] = [];
  if (input.ground && needsGrounding(intent)) {
    const grounding = await input.ground(intent);
    if (grounding.kind === "clarify") {
      const repeated =
        input.clarifying !== null &&
        input.clarifying !== undefined &&
        input.clarifying.action === grounding.intent.action &&
        input.clarifying.parameters.awaiting === grounding.awaiting;
      const question = repeated ? escalatedQuestion({ ...input.clarifying!, parameters: grounding.intent.parameters }) : grounding.question;
      return {
        kind: "reply",
        intent: grounding.intent,
        proposal: { kind: "clarify", question },
        text: question,
        record: false,
        memory: null,
        clarification: clarificationFrom({ intent: grounding.intent, question, utterance: input.utterance, previous: input.clarifying ?? null }),
        focus: grounding.candidates,
      };
    }
    intent = grounding.intent;
    focus = grounding.focus;
  }

  const proposed = proposeFromIntent(intent, {
    actor: input.actor,
    autonomy: input.autonomyFor(intent.target.reference ?? null),
    entitled: input.entitledFor(intent),
  });
  const proposal: Proposal =
    proposed.kind === "executed" && !(input.executable?.(intent) ?? false)
      ? { kind: "prepared", preview: proposed.preview }
      : proposed;

  // Never the same question twice. If this turn would ask again what the
  // last one asked, it says instead what was understood, what is missing,
  // and the shape of an answer that works.
  let settled = proposal;
  if (proposal.kind === "clarify" && input.clarifying && sameQuestion(proposal.question, input.clarifying)) {
    settled = { kind: "clarify", question: escalatedQuestion(input.clarifying) };
  }

  return {
    kind: "reply",
    intent,
    proposal: settled,
    text: replyFor(settled),
    record: needsRecording(intent, settled),
    memory: extractMemory(intent, { sessionId: input.sessionId }),
    clarification:
      settled.kind === "clarify"
        ? clarificationFrom({
            intent,
            question: settled.question,
            utterance: input.utterance,
            previous: input.clarifying ?? null,
          })
        : null,
    focus,
  };
}

/**
 * Whether this is the question that was just asked.
 *
 * Matched on the subject rather than the wording, because the point is not
 * to repeat the *ask* — re-phrasing the identical request for the identical
 * missing detail is the same failure with different words.
 */
function sameQuestion(question: string, pending: PendingClarification): boolean {
  return question.trim() === pending.question.trim() || pending.action !== "unknown";
}

/** What the assistant says, by what it is prepared to do. Short on purpose. */
export function replyFor(proposal: Proposal): string {
  switch (proposal.kind) {
    case "clarify":
      return proposal.question;
    case "refused":
      return proposal.reason;
    case "answer":
      return proposal.summary;
    case "prepared":
      return `I have prepared this, and not done it: ${lower(proposal.preview.summary)}. It is waiting for you.`;
    case "needs_approval":
      return `Here is what I would do — ${lower(proposal.preview.summary)}. Shall I go ahead?`;
    case "executed":
      return `Done: ${lower(proposal.preview.summary)}.`;
  }
}

/** The preview a proposal carries, when it carries one. */
export function previewOf(proposal: Proposal): ActionPreview | null {
  return "preview" in proposal ? proposal.preview : null;
}

export function pendingFrom(action: {
  id: string;
  summary: string;
  createdAt: Date;
}): PendingProposal {
  return {
    actionId: action.id,
    summary: action.summary,
    expiresAt: new Date(action.createdAt.getTime() + PROPOSAL_TTL_MINUTES * 60_000),
  };
}

function unknownIntent(input: TurnInput): HouseholdIntent {
  return {
    action: "unknown",
    actorMemberId: input.actor.memberId,
    target: { kind: "unspecified" },
    parameters: {},
    confidence: 0,
    channel: input.channel,
    utterance: input.utterance,
  };
}

function lower(sentence: string): string {
  return sentence.charAt(0).toLowerCase() + sentence.slice(1).replace(/\.$/, "");
}
