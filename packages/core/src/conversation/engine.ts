import type { AutonomyMode } from "../household/autonomy";
import type { PermissionContext } from "../identity/permissions";
import { resolveFixtureIntent } from "./fixtures";
import {
  isConsequential,
  resolveShortReply,
  type HouseholdIntent,
  type PendingProposal,
} from "./intent";
import { extractMemory, type Memory } from "./memory";
import { needsRecording, proposeFromIntent, type ActionPreview, type Proposal } from "./proposal";

/**
 * One turn of conversation, from what was said to what WonderHome says back.
 *
 * Pure: everything it needs arrives as input and everything it decides leaves
 * as output, so the same turn can be run in a request, in a test and in an
 * evaluation and give the same answer. The route around it does the reading
 * and writing.
 *
 * Understanding is deterministic today — `resolveFixtureIntent` — because no
 * language-model provider is configured with credentials, and CLAUDE.md is
 * explicit that a provider is live only once it is. The seam is `understand`:
 * a live provider slots in there and nothing downstream changes, because
 * nothing downstream ever trusted the model with a decision.
 */

/** Below this, a voice transcript is read back before it is acted on. */
export const CONFIRM_TRANSCRIPT_BELOW = 0.6;

/** How long a proposal waits for a yes before a stray yes stops counting. */
export const PROPOSAL_TTL_MINUTES = 10;

export type Understanding = (
  utterance: string,
  context: { actorMemberId: string; channel: "text" | "voice" },
) => HouseholdIntent;

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
    };

export function converse(input: TurnInput): TurnResult {
  const now = input.now ?? new Date();

  // "Yes", "no" and "do it" only mean something against what was just proposed.
  const short = resolveShortReply(input.utterance, input.pending, now);
  switch (short.kind) {
    case "approve":
      return { kind: "approve", actionId: short.actionId, text: "Done — I have your go-ahead and it is on its way." };
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

  const understand = input.understand ?? resolveFixtureIntent;
  const intent = understand(input.utterance, { actorMemberId: input.actor.memberId, channel: input.channel });

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

  const proposed = proposeFromIntent(intent, {
    actor: input.actor,
    autonomy: input.autonomyFor(intent.target.reference ?? null),
    entitled: input.entitledFor(intent),
  });
  const proposal: Proposal =
    proposed.kind === "executed" && !(input.executable?.(intent) ?? false)
      ? { kind: "prepared", preview: proposed.preview }
      : proposed;

  return {
    kind: "reply",
    intent,
    proposal,
    text: replyFor(proposal),
    record: needsRecording(intent, proposal),
    memory: extractMemory(intent, { sessionId: input.sessionId }),
  };
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
      return `I have prepared this, and not done it: ${lower(proposal.preview.summary)}. Say the word and I will.`;
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
