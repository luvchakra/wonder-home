import { inWindow, type BrainReading } from "./question";
import type { GroundedFact } from "./grounding";
import { describeViolations, validateAnswer, type ValidationContext, type Violation } from "./validate";

/**
 * Composing an answer HomeBrain can stand behind (Wave 2 §5, §7, §11).
 *
 *   grounded facts → model draft → validation
 *     → accepted, or
 *     → one regeneration with tighter context and the problems named, or
 *     → a deterministic answer composed here from the same facts, or
 *     → an honest "WonderHome does not know that yet".
 *
 * An unsupported answer is never silently accepted: every path out of this
 * file is either a draft that passed validation or text assembled from the
 * facts themselves.
 */

/** What a model returns for one question. */
export type ModelDraft = {
  text: string;
  /** "answer" when the facts answer it; "clarify" when one thing must be asked first; "unknown" when the facts do not cover it. */
  mode: "answer" | "clarify" | "unknown";
  grounded: boolean;
  usedFacts: string[];
};

/** A fact as it was actually sent: its id and its pseudonymised text. */
export type SentFact = { id: string; text: string };

export type DraftRequest = {
  facts: readonly SentFact[];
  /** Set on a regeneration: what was wrong with the last draft, in terms of what it said. */
  problems: readonly string[];
};

export type Composer = (request: DraftRequest) => Promise<ModelDraft | null>;

export type ComposeOutcome =
  | { status: "accepted"; draft: ModelDraft; attempts: number; rejected: Violation[] }
  | { status: "rejected"; attempts: number; rejected: Violation[] }
  | { status: "no_answer"; attempts: number; rejected: Violation[] };

/**
 * Draft, validate, and — once — draft again with less to work from.
 *
 * The second draft gets only the facts the first one said it used (or the
 * most relevant half, if it cited none), and is told plainly what it said
 * that no fact supports. It is validated against that smaller set: a
 * regeneration may not lean on facts it was no longer given.
 */
export async function composeGrounded(input: {
  facts: readonly SentFact[];
  compose: Composer;
  validation: Omit<ValidationContext, "facts">;
  maxAttempts?: number;
}): Promise<ComposeOutcome> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
  const rejected: Violation[] = [];
  let facts = input.facts;
  let problems: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const draft = await input.compose({ facts, problems });
    if (!draft) return { status: "no_answer", attempts: attempt, rejected };

    const result = validateAnswer(draft, { ...input.validation, facts });
    if (result.ok) return { status: "accepted", draft, attempts: attempt, rejected };

    rejected.push(...result.violations);
    problems = describeViolations(result.violations);
    const cited = facts.filter((fact) => draft.usedFacts.includes(fact.id));
    facts = cited.length > 0 ? cited : facts.slice(0, Math.max(6, Math.ceil(facts.length / 2)));
  }
  return { status: "rejected", attempts: maxAttempts, rejected };
}

/** Facts about the household itself — its name, its people, its pets. True, but never the answer to a question. */
const BACKGROUND = new Set(["household", "people", "pets"]);

/**
 * An answer assembled from the facts alone, with no model: the few most
 * relevant things on record for what was asked, in their own words.
 *
 * Null when nothing specific is on record — the caller then says so rather
 * than padding a reply with the household's name and headcount.
 */
export function composeFromFacts(facts: readonly GroundedFact[], reading: BrainReading, options: { limit?: number } = {}): string | null {
  const limit = options.limit ?? 6;
  const pool = answeringFacts(facts, reading);
  if (pool.length === 0) return null;

  // "For Kunal" would undersell an answer that also carries his children's plans.
  const who = (reading.dependants ?? []).length > 0 ? "" : reading.people.map((person) => person.displayName.split(/\s+/)[0]).join(" and ");
  const lead = who && reading.time ? `Here is what is on record for ${who} ${reading.time.label}:` : who ? `Here is what is on record for ${who}:` : reading.time ? `Here is what is on record ${reading.time.label}:` : "Here is what WonderHome has on record:";
  return `${lead}\n${pool.slice(0, limit).map((fact) => `- ${fact.statement}`).join("\n")}`;
}

/**
 * The facts that actually answer the question: relevant, specific (not the
 * household's name or headcount), and — for a question about a day — on
 * that day. What a deterministic answer is made of, and what a model's
 * answer must not be missing.
 */
export function answeringFacts(facts: readonly GroundedFact[], reading: BrainReading): GroundedFact[] {
  const pool = relevantAnswers(facts, reading);
  // A question that names the thing ("what time is the parent-teacher
  // meeting?") is answered by that thing. What merely connects to it — the
  // groceries a school event might need, another child's Sports Day — is
  // still offered to a model, but is not what the answer is, and a fact
  // withheld from the model among those is no reason to drop the model.
  const named = pool.filter((fact) => fact.reasons.includes("named in the question"));
  return named.length > 0 ? named : pool;
}

function relevantAnswers(facts: readonly GroundedFact[], reading: BrainReading): GroundedFact[] {
  return facts.filter((fact) => {
    if (!fact.relevant || fact.score < 0.5) return false;
    if (fact.domain !== "conflict" && BACKGROUND.has(fact.domain)) return false;
    // A question about a day is answered with what falls on it: an undated
    // standing fact is never presented as "tomorrow".
    if (reading.time && !(fact.date && inWindow(fact.date, reading.time))) return false;
    return true;
  });
}

/** What to say when nothing on record answers the question. Honest, specific, and never padded. */
export function unknownAnswer(reading: BrainReading): string {
  const who = reading.people.map((person) => person.displayName.split(/\s+/)[0]).join(" and ");
  const about = [who ? `for ${who}` : "", reading.time ? reading.time.label : ""].filter(Boolean).join(" ");
  return `WonderHome does not have anything on record about that${about ? ` ${about}` : ""} yet. If you tell me, I will keep track of it.`;
}

// ---------------------------------------------------------------------------
// Modes (§11)
// ---------------------------------------------------------------------------

/**
 * The five things a HomeBrain reply can be. "Done" is reserved for a reply
 * after a governed executor confirmed the change — never for a proposal, and
 * never for an answer.
 */
export const BRAIN_MODES = ["answer", "clarify", "prepare", "approval", "done"] as const;
export type BrainMode = (typeof BRAIN_MODES)[number];

/**
 * The mode of a reply, from what the engine proposed and what actually ran.
 * `executed` is the execution result, not the proposal: a proposal marked
 * "executed" whose write failed is an answer about the failure, not "done".
 */
export function modeFor(kind: string, executed: boolean | null = null): BrainMode {
  switch (kind) {
    case "clarify":
    case "confirm_transcript":
      return "clarify";
    case "prepared":
      return "prepare";
    case "needs_approval":
      return "approval";
    case "executed":
    case "approve":
      return executed === true ? "done" : "answer";
    default:
      return "answer";
  }
}
