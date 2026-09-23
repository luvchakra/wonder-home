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
  // A statement about someone's likes keeps one key per person and thing, so
  // "Asmi doesn't like mushrooms" and, later, "actually Asmi is okay with
  // mushrooms now" are the same belief — and the second replaces the first
  // (Wave 2 §8) — whether the rules or a model read the sentence.
  const parsed = typeof value.statement === "string" ? parsePreference(value.statement) : null;

  return {
    scope: context.householdScope === false ? "member" : "household",
    memberId: context.householdScope === false ? intent.actorMemberId : null,
    category: "preference",
    key: parsed?.key ?? reference.replace(/[^a-z0-9_.]/gi, "").toLowerCase(),
    value: parsed ? { ...value, subject: parsed.subject, object: parsed.object, stance: parsed.stance } : value,
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

// ---------------------------------------------------------------------------
// Someone's likes, dislikes and allergies (Wave 2 §8)
// ---------------------------------------------------------------------------

export type PreferenceStance = "likes" | "dislikes" | "okay_with" | "allergic" | "avoids" | "prefers";

export type ParsedPreference = {
  /** Who it is about, in the words used: "Asmi", "Dad". */
  subject: string;
  /** What about: "mushrooms", "spicy food". */
  object: string;
  stance: PreferenceStance;
  /** `pref.<subject>.<object>` — the same for every way of saying it. */
  key: string;
  /** Whether the words themselves mark a change of mind ("now", "anymore", "no longer", "okay with"). */
  corrects: boolean;
};

const STANCES: readonly { pattern: string; stance: PreferenceStance }[] = [
  { pattern: "(?:doesn'?t|does not|don'?t|do not) like|dislikes?|hates?|can'?t stand|no longer likes?", stance: "dislikes" },
  { pattern: "is allergic to|are allergic to|has an allergy to", stance: "allergic" },
  { pattern: "(?:is|are) (?:okay|ok|fine|alright|all right) with|(?:doesn'?t|does not) mind|now eats?", stance: "okay_with" },
  { pattern: "(?:can'?t|cannot|doesn'?t|does not|don'?t|do not|won'?t|will not|no longer) (?:eat|drink|have)s?|avoids?", stance: "avoids" },
  { pattern: "prefers?", stance: "prefers" },
  { pattern: "likes?|loves?|enjoys?|adores?", stance: "likes" },
];

/** People words a preference is never keyed on: "we", "it", "someone". */
const NOT_A_SUBJECT = new Set(["i", "we", "you", "it", "this", "that", "he", "she", "they", "someone", "somebody", "everyone", "everybody", "nobody", "the", "family", "kids", "children"]);

/**
 * "Asmi doesn't like mushrooms" → { subject: "Asmi", object: "mushrooms", stance: "dislikes", key: "pref.asmi.mushrooms" }.
 * Null for anything that is not one person's stance on one thing.
 */
export function parsePreference(statement: string): ParsedPreference | null {
  const text = statement.trim().replace(/[.!?]+$/, "").replace(/^actually,?\s+/i, "");
  for (const { pattern, stance } of STANCES) {
    const match = text.match(new RegExp(`^([A-Za-z][A-Za-z'-]*)\\s+(?:really\\s+|still\\s+|actually\\s+)?(?:${pattern})\\s+(.+)$`, "i"));
    if (!match) continue;
    const subject = match[1]!.trim();
    if (NOT_A_SUBJECT.has(subject.toLowerCase())) return null;
    const trailing = /\s+(?:now|any ?more|these days|again)$/i;
    const object = match[2]!.replace(trailing, "").replace(/^(?:the|a|an|some|any)\s+/i, "").trim();
    if (!object) return null;
    const subjectKey = keyPart(subject);
    const objectKey = keyPart(object).split(".").slice(0, 3).join(".");
    if (!subjectKey || !objectKey) return null;
    const key = `pref.${subjectKey}.${objectKey}`.slice(0, 61);
    const corrects = /\b(?:now|any ?more|no longer|these days|again)\b/i.test(statement) || stance === "okay_with" || /^actually\b/i.test(statement.trim());
    return { subject, object, stance, key, corrects };
  }
  return null;
}

function keyPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word))
    .join(".");
}

/**
 * The person a memory is about, when its subject names one of the
 * household's own people — so a child's preference is a child's (member
 * scope, the stricter privacy class) rather than an anonymous household note.
 */
export function attributeMemory(memory: Memory, people: readonly { id: string; displayName: string; nickname?: string | null; relationship?: string | null }[]): Memory {
  const value = memory.value as Record<string, unknown> | null;
  const subject = typeof value?.subject === "string" ? value.subject.toLowerCase() : null;
  if (!subject) return memory;
  const person = people.find((entry) => {
    const names = [entry.displayName, entry.displayName.split(/\s+/)[0], entry.nickname, entry.relationship].filter((name): name is string => Boolean(name)).map((name) => name.toLowerCase());
    return names.includes(subject);
  });
  return person ? { ...memory, scope: "member", memberId: person.id } : memory;
}

/** Whether a memory says anything a household could agree or disagree with. An empty one is not put up for review. */
export function isReviewable(memory: Pick<Memory, "value">): boolean {
  const value = memory.value;
  if (value === null || value === undefined) return false;
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some((entry) => entry !== null && entry !== undefined && entry !== "");
  return String(value).trim() !== "";
}

/** A belief as a sentence the household can agree or disagree with — what HomeBrain Review shows. */
export function claimFor(memory: Pick<Memory, "key" | "value">): string {
  const value = memory.value as Record<string, unknown> | null;
  const statement = typeof value?.statement === "string" ? value.statement.trim() : null;
  const text = statement || `${memory.key.replace(/[._]+/g, " ")}`;
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return (/[.!?]$/.test(sentence) ? sentence : `${sentence}.`).slice(0, 300);
}

export const REVIEW_CATEGORIES = ["family_roles", "home_routines", "education", "finance", "lifestyle", "safety"] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

/** Which part of HomeBrain Review a belief belongs in, and how much being wrong about it would cost. */
export function reviewPlacementFor(memory: Pick<Memory, "key" | "value">): { category: ReviewCategory; risk: "low" | "medium" | "high" } {
  const value = memory.value as Record<string, unknown> | null;
  if (value?.stance === "allergic") return { category: "safety", risk: "high" };
  if (/^(?:meals|kids|household\.(?:bedtime|routine|schedule))\b/.test(memory.key)) return { category: "home_routines", risk: "low" };
  if (/^(?:school|homework)\b/.test(memory.key)) return { category: "education", risk: "low" };
  if (/^(?:bills|money|finance|budget)\b/.test(memory.key)) return { category: "finance", risk: "medium" };
  return { category: "lifestyle", risk: "low" };
}

