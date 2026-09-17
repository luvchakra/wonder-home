import type { HouseholdIntent } from "./intent";

/**
 * Household memory (stories 04-007, 04-008).
 *
 * What WonderHome believes about a family, where each belief came from, and how
 * sure it is. The distinction that matters — and the one module 05 is built on —
 * is between what someone told us and what we worked out ourselves.
 *
 * A confirmed fact is canonical. Inference never silently overwrites it: the
 * new reading is recorded as a candidate and surfaced for review instead, so
 * the family finds out that WonderHome changed its mind rather than discovering
 * it through behaviour.
 */

export type MemoryScope = "household" | "member";
export type MemoryCategory = "preference" | "routine" | "constraint" | "fact" | "relationship";
export type MemorySource = "setup" | "conversation" | "integration" | "observed";
export type MemoryStatus = "learned" | "confirmed" | "rejected" | "superseded";

export type Memory = {
  scope: MemoryScope;
  memberId: string | null;
  category: MemoryCategory;
  key: string;
  value: unknown;
  sourceType: MemorySource;
  sourceId?: string | null;
  confidence: number;
  status: MemoryStatus;
};

/**
 * Turns an explicit statement into structured memory.
 *
 * Only statements the person actually made become memories. An inference drawn
 * from behaviour is a different thing with a different source, and mixing them
 * is how a system ends up confidently wrong about a family.
 */
export function extractMemory(
  intent: HouseholdIntent,
  context: { sessionId: string; householdScope?: boolean },
): Memory | null {
  if (intent.action !== "set_preference") return null;

  const reference = intent.target.reference;
  if (!reference) return null;

  const { corrects: _corrects, ...value } = intent.parameters;

  return {
    scope: context.householdScope === false ? "member" : "household",
    memberId: context.householdScope === false ? intent.actorMemberId : null,
    category: "preference",
    key: reference.replace(/[^a-z0-9_.]/gi, "").toLowerCase(),
    value,
    sourceType: "conversation",
    sourceId: context.sessionId,
    // Someone stating a preference outright is strong evidence, but it is still
    // not a confirmed fact until the household certifies it (module 05).
    confidence: Math.min(0.9, Math.max(0.5, intent.confidence)),
    status: "learned",
  };
}

export type MemoryUpdate =
  | { kind: "create"; memory: Memory }
  | { kind: "supersede"; previous: Memory; memory: Memory }
  | { kind: "needs_review"; existing: Memory; proposed: Memory; reason: string }
  | { kind: "unchanged"; existing: Memory };

/**
 * Decides what a new reading does to what is already believed.
 *
 * The rule the whole trust model rests on: a confirmed fact cannot be replaced
 * by an inference. A person correcting themselves supersedes it; a pattern
 * quietly disagreeing with them does not.
 */
export function reconcileMemory(
  existing: Memory | null,
  proposed: Memory,
  options: { statedByMember: boolean },
): MemoryUpdate {
  if (!existing) return { kind: "create", memory: proposed };

  if (sameValue(existing.value, proposed.value)) {
    return { kind: "unchanged", existing };
  }

  if (existing.status === "confirmed" && !options.statedByMember) {
    return {
      kind: "needs_review",
      existing,
      proposed,
      reason:
        "This contradicts something the household confirmed, so it is waiting for someone to decide.",
    };
  }

  if (options.statedByMember) {
    // A person correcting themselves is the strongest signal there is.
    return {
      kind: "supersede",
      previous: { ...existing, status: "superseded" },
      memory: { ...proposed, confidence: Math.max(proposed.confidence, existing.confidence) },
    };
  }

  // An inference disagreeing with an unconfirmed belief is allowed to win only
  // if it is genuinely more confident.
  return proposed.confidence > existing.confidence
    ? { kind: "supersede", previous: { ...existing, status: "superseded" }, memory: proposed }
    : { kind: "unchanged", existing };
}

/** True when the intent is a person correcting an earlier statement. */
export function isCorrection(intent: HouseholdIntent): boolean {
  return intent.parameters.corrects === true;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
