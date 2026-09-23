import type { ContextCandidate } from "../ai/privacy";
import { findPotentialConflicts } from "../context/conflicts";
import { freshnessQualifier, isUsable } from "../context/freshness";
import { contentClassFor } from "../context/privacy";
import { sourcesOf } from "../context/provenance";
import { findRelevantFacts } from "../context/retrieval";
import type { ContextDomain, ContextTier, HouseholdContextItem, PrivacyClass } from "../context/types";
import { inWindow, type BrainReading } from "./question";

/**
 * The grounded fact contract (Wave 2 §6).
 *
 * Everything a model may say about the home arrives as one of these, and
 * nothing else does. Each carries an opaque id the model cites ("F3") — never
 * a row id — plus where it came from, how sure WonderHome is, and how private
 * it is, so the consent gate, the validator and the "why?" answers all work
 * from the same list the model was given.
 */
export type GroundedFact = {
  /** "F1", "F2" … in order of relevance. The only id a model ever sees. */
  contextId: string;
  /** The fact in the household's own words, real names included — pseudonymised at the gate. */
  statement: string;
  /** Where it came from: `table:id`, the HomeSend intake behind it, and so on. Never sent. */
  sourceIds: string[];
  confidence: number;
  privacyClass: PrivacyClass;

  /** Whether this question needs it. The rest still go to the gate, marked not relevant, so it can say what was held back. */
  relevant: boolean;
  score: number;
  /** The context item it states, or null for a derived fact (a clash between two items). */
  itemId: string | null;
  domain: ContextDomain | "conflict";
  subjectMemberIds: string[];
  /** The day it is about, when it is about one. */
  date: string | null;
  tier: ContextTier;
  confirmed: boolean;
  /** Why an answer would want it, in one phrase — the gate's disclosure line. */
  need: string;
  /** Why it was chosen, for the household's "what did you look at?" — never sent. */
  reasons: string[];
};

/** Domains whose facts are about a particular person, so a question about someone else can leave them out. */
const PERSONAL_DOMAINS: ReadonlySet<ContextDomain> = new Set(["school", "calendar", "health", "absences", "laundry"]);
/** Domains whose facts are about a particular day, so a question about another day can rank them lower. */
const DATED_DOMAINS: ReadonlySet<ContextDomain> = new Set(["school", "calendar", "health", "meals", "bills", "absences"]);

export type GroundingOptions = {
  /** Most facts to mark relevant. The consent gate still applies its own budget. */
  budget?: number;
};

/**
 * Ranks every fact this viewer may see against one reading of a question.
 *
 * Starts from Wave 1's relevance (tier, mention, domain), then applies what
 * the reading added: connected domains are pulled in, a named person narrows
 * personal facts to them, a time window lifts what falls in it, and a
 * question about a clash gets the clashes themselves — already phrased
 * without private detail ("an appointment").
 */
export function groundFacts(items: readonly HouseholdContextItem[], reading: BrainReading, options: GroundingOptions = {}): GroundedFact[] {
  const budget = options.budget ?? 40;
  const ranked = findRelevantFacts({ items: [...items] }, reading.retrievalText, { budget: items.length });
  const people = new Set(reading.people.map((person) => person.memberId));
  // A question about one part of the home ("health appointments") is not
  // answered with everything about the person asking — only the parts it is
  // unmistakably about, what those connect to, and the calendar.
  const inScope = new Set<ContextDomain>([...reading.domains, ...reading.connected]);
  const asked = new Set(meaningfulWords(reading.retrievalText));

  const drafts: Omit<GroundedFact, "contextId">[] = [];
  for (const entry of ranked) {
    const { item } = entry;
    let score = entry.score;
    const reasons = [...entry.reasons];
    const usable = isUsable(item);
    const date = typeof item.attributes.date === "string" ? item.attributes.date.slice(0, 10) : null;
    // A replaced or out-of-date fact is not a candidate at all — the same line Wave 1 draws.
    if (!usable && score <= 0) continue;

    // A fact that says what the question says — "when do the children go to
    // bed?" and "the children are in bed by 9pm" — is about it, whichever
    // domain it sits in and whether or not it has an alias to match.
    if (usable && item.tier !== 1 && score < 0.65) {
      const shared = meaningfulWords(item.summary).filter((word) => asked.has(word));
      if (shared.length >= 2) {
        score = 0.65;
        reasons.push("says what the question asks about");
      }
    }

    if (usable && item.tier <= 2 && reading.connected.has(item.domain) && score < 0.6) {
      score = 0.6;
      reasons.push("connected to what the question is about");
    }

    if (score > 0 && reading.focus.size > 0 && item.tier !== 1 && !inScope.has(item.domain) && !entry.reasons.includes("named in the question")) {
      score = 0;
      reasons.splice(0, reasons.length, "not in the part of the home the question is about");
    }

    // Linked to the question only by a word too common to mean much ("what
    // does Asmi have" is not about who does what): still offered to a model,
    // low down, but never a lead fact in a deterministic answer.
    const weakOnly =
      entry.reasons.includes("in the part of the home the question is about") &&
      !entry.reasons.includes("named in the question") &&
      !entry.reasons.includes("about someone or something named in the question") &&
      item.tier !== 1 &&
      !reading.focus.has(item.domain) &&
      !reading.connected.has(item.domain);
    if (weakOnly && score > 0.3) {
      score = 0.3;
      reasons.push("only a common word linked it to the question");
    }

    // A named person narrows personal facts to them — Asmi's question is not
    // answered with Manan's homework. Unassigned facts stay.
    if (score > 0 && people.size > 0 && PERSONAL_DOMAINS.has(item.domain) && item.subjectMemberIds.length > 0 && !item.subjectMemberIds.some((member) => people.has(member)) && item.tier !== 1) {
      score = 0;
      reasons.splice(0, reasons.length, "about someone the question did not ask about");
    }

    if (score > 0 && reading.time && date && DATED_DOMAINS.has(item.domain)) {
      if (inWindow(date, reading.time)) {
        score = Math.min(1, score + 0.15);
        reasons.push(`falls ${reading.time.label}`);
      } else {
        score = Math.max(0.05, score * 0.5);
        reasons.push(`not ${reading.time.label}`);
      }
    }

    drafts.push({
      statement: statementOf(item),
      sourceIds: sourcesOf(item).map((ref) => `${ref.type}:${ref.sourceId ?? "summary"}`),
      confidence: item.confidence,
      privacyClass: item.privacyClass,
      relevant: score > 0,
      score,
      itemId: item.id,
      domain: item.domain,
      subjectMemberIds: item.subjectMemberIds,
      date,
      tier: item.tier,
      confirmed: item.confirmed,
      need: item.need,
      reasons,
    });
  }

  if (reading.wantsConflicts) {
    for (const conflict of findPotentialConflicts(items)) {
      if (conflict.kind === "contradictory_facts") continue;
      if (people.size > 0 && !conflict.subjectMemberIds.some((member) => people.has(member))) continue;
      const involved = items.filter((item) => conflict.itemIds.includes(item.id));
      drafts.push({
        statement: conflict.summary,
        sourceIds: involved.flatMap((item) => sourcesOf(item).map((ref) => `${ref.type}:${ref.sourceId ?? "summary"}`)),
        confidence: Math.min(...involved.map((item) => item.confidence), 1),
        // The clash is phrased without what an appointment is for; what it
        // still carries is who and when — a child's time is a child's.
        privacyClass: involved.some((item) => item.privacyClass === "child") ? "child" : "general",
        relevant: true,
        score: 0.9,
        itemId: null,
        domain: "conflict",
        subjectMemberIds: conflict.subjectMemberIds,
        date: involved.map((item) => (typeof item.attributes.date === "string" ? item.attributes.date : null)).find(Boolean) ?? null,
        tier: 2,
        confirmed: involved.every((item) => item.confirmed),
        need: "whether things clash",
        reasons: ["the question asks whether things clash"],
      });
    }
  }

  drafts.sort((a, b) => b.score - a.score);
  let kept = 0;
  for (const draft of drafts) {
    if (!draft.relevant) continue;
    kept += 1;
    if (kept > budget) {
      draft.relevant = false;
      draft.score = 0;
      draft.reasons = ["less relevant than the facts already chosen"];
    }
  }

  return drafts.map((draft, index) => ({ ...draft, contextId: `F${index + 1}` }));
}

/** The consent gate's candidates: the fact's own id, so what the model cites is what the gate let through. */
export function gateCandidates(facts: readonly GroundedFact[]): ContextCandidate[] {
  return facts.map((fact) => ({
    id: fact.contextId,
    contentClass: contentClassFor(fact.privacyClass),
    need: fact.need,
    text: fact.statement,
    subjects: fact.subjectMemberIds,
    relevant: fact.relevant,
  }));
}

/** Relevant facts only, most relevant first. */
export function relevantFacts(facts: readonly GroundedFact[]): GroundedFact[] {
  return facts.filter((fact) => fact.relevant);
}

function statementOf(item: HouseholdContextItem): string {
  return `${item.summary.replace(/\.$/, "")}${freshnessQualifier(item)}.`.replace(/\.\.$/, ".");
}

/** Words too common to say what a sentence is about. */
const COMMON = new Set([
  "the", "and", "for", "are", "was", "were", "has", "have", "had", "does", "did", "what", "when", "where", "which", "who", "why", "how",
  "this", "that", "with", "from", "into", "our", "your", "their", "his", "her", "its", "any", "all", "some", "there", "here", "about",
  "will", "would", "can", "could", "should", "is", "not", "yet", "today", "tomorrow", "week", "now", "on", "at", "in", "by", "of", "to",
  "go", "do", "get", "got", "be", "been", "being", "me", "my", "we", "us", "you", "it", "a", "an", "or", "so", "up", "out",
]);

function meaningfulWords(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length >= 3 && !COMMON.has(word)))];
}

