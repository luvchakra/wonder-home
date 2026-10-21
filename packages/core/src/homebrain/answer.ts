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
  const answering = answeringFacts(facts, reading);
  if (answering.length === 0) return null;
  // The goal's shape (HomeBrain 4.0 §3.10). To find out, the fact comes
  // first and what the rules noticed about it after — except a count, which
  // is the fact. To decide, what the rules noticed leads: it is what decides.
  // A count, and when the family is free for a trip, are the facts themselves.
  // A sum of the bills due is the same: the figure first, then each bill that makes it up.
  const isTotal = (fact: GroundedFact) => fact.domain === "insight" && fact.reasons.some((reason) => reason.startsWith("inference (total)"));
  const noticed = (fact: GroundedFact) => fact.domain === "insight" && !fact.reasons.some((reason) => reason.startsWith("inference (count)")) && !isTripFact(fact);
  const ordered = [...answering.filter(isTotal), ...answering.filter((fact) => !isTotal(fact))];
  const pool =
    reading.goal === "decide"
      ? [...ordered.filter(noticed), ...ordered.filter((fact) => !noticed(fact))]
      : [...ordered.filter((fact) => !noticed(fact)).slice(0, limit - Math.min(2, ordered.filter(noticed).length)), ...ordered.filter(noticed).slice(0, 2)];

  // "For Kunal" would undersell an answer that also carries his children's plans.
  const who = (reading.dependants ?? []).length > 0 ? "" : reading.people.map((person) => person.displayName.split(/\s+/)[0]).join(" and ");
  const plainLead = answering.every(isTripFact)
    ? "Here is when the family calendar is free:"
    : who && reading.time ? `Here is what is on record for ${who} ${reading.time.label}:` : who ? `Here is what is on record for ${who}:` : reading.time ? `Here is what is on record ${reading.time.label}:` : "Here is what WonderHome has on record:";
  // Yes or no first, then the evidence; and what decides it, said as that.
  // "Yes" only where a fact's being there is the answer ("is there anything on
  // Thursday?"); "did Kunal pay it?" or "do we have milk?" is answered by
  // what the fact says, which the reader sees for themselves.
  const lead = reading.goal === "check" && /\b(?:is there anything|are there any|is anything|anything (?:on|due|planned|happening))\b/i.test(reading.retrievalText) ? `Yes. ${plainLead}` : reading.goal === "decide" ? `Here is what WonderHome has on record that bears on it${reading.time ? ` ${reading.time.label}` : ""}:` : plainLead;
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
    // The household, its people and its pets are background to most answers
    // — but a question about them ("who are the members?", "what pets do we
    // have?") is answered by them (HomeBrain 4.0 §3.2).
    if (fact.domain !== "conflict" && fact.domain !== "insight" && fact.domain !== "profile" && BACKGROUND.has(fact.domain) && !reading.focus.has(fact.domain)) return false;
    // A question about a day is answered with what falls on it: an undated
    // standing fact is never presented as "tomorrow".
    // "Which weekend is free?" names a weekend but asks about all of them.
    if (reading.time && !isTripFact(fact) && !(fact.date && inWindow(fact.date, reading.time))) return false;
    return true;
  });
}

/**
 * The facts a model is shown, narrowed to what the question asked for: a
 * question about a day sees nothing dated on another day, and a question that
 * names a thing ("when is the washing machine due?") sees no other thing of
 * the same kind. A real model (Anthropic, 21 Oct 2026) answered "what have I
 * got on tomorrow?" with Friday's parent-teacher meeting, and the washing
 * machine's service date with the fridge's — both true, neither asked (the
 * first through the asker's own profile line). A fact
 * an inference rests on is always kept with it (§3.5). The rest stay marked
 * not relevant, so the gate still says what was held back.
 */
export function factsForModel(facts: readonly GroundedFact[], reading: BrainReading): GroundedFact[] {
  const named = facts.filter((fact) => fact.relevant && fact.reasons.includes("named in the question"));
  const namedDomains = new Set(named.map((fact) => fact.domain));
  const evidence = new Set(facts.filter((fact) => fact.relevant && fact.domain === "insight").flatMap((fact) => fact.evidence ?? []));
  return facts.map((fact) => {
    if (!fact.relevant || evidence.has(fact.contextId) || fact.domain === "insight" || fact.domain === "conflict") return fact;
    // A person at a glance carries their next things on any day ("next: the
    // parent-teacher meeting on Friday"): it leads "what do you know about
    // her?", never an answer about one day.
    if (fact.domain === "profile") return reading.time ? { ...fact, relevant: false } : fact;
    const otherDay = Boolean(reading.time && fact.date && !inWindow(fact.date, reading.time));
    const sibling = named.length > 0 && namedDomains.has(fact.domain) && !fact.reasons.includes("named in the question");
    return otherDay || sibling ? { ...fact, relevant: false } : fact;
  });
}

/**
 * Whether the answer is a rule's arithmetic (rule 9): a count of replies, a
 * sum of the bills due, the weekends the family is free. Such an answer is
 * told in the rule's own words, which show each term — a real model
 * (Anthropic, 21 Oct 2026) re-told the free weekends and dropped the one
 * Sports Day blocks, and re-told a guest count without its undecided reply.
 */
export function answeredByArithmetic(answering: readonly GroundedFact[]): boolean {
  return answering.some((fact) => fact.domain === "insight" && fact.reasons.some((reason) => /^inference \((?:count|total|free_window)\)/.test(reason)));
}

/**
 * What a rule worked out over a window of its own: the free weekends for "when
 * should we go away?" (14-033, 14-034) and the sum of the bills due this month
 * (H-1). They carry no single day, so the day filter must not drop them.
 */
function isTripFact(fact: GroundedFact): boolean {
  return fact.domain === "insight" && fact.reasons.some((reason) => reason.startsWith("inference (free_window)") || reason.startsWith("inference (total)"));
}

/** What to say when nothing on record answers the question. Honest, specific, and never padded. */
/**
 * A health question from someone who may not read health (a child), whose own
 * appointment is on record: they hear that it is there and who can see it,
 * never what it is. The owner's decision, 2026-10-18. Only ever about the
 * asker's own appointments — another person's stay unmentioned.
 */
export function heldForAdultsAnswer(reading: BrainReading, viewerMemberId: string, count: number): string | null {
  if (count <= 0) return null;
  if (!reading.focus.has("health") && !reading.domains.has("health")) return null;
  if (reading.people.some((person) => person.memberId !== viewerMemberId)) return null;
  const what = count === 1 ? "a health appointment" : `${count} health appointments`;
  return `You have ${what} coming up. The adults in your family can see the details, so ask one of them.`;
}

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
