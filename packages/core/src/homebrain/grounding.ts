import type { ContextCandidate } from "../ai/privacy";
import { findPotentialConflicts } from "../context/conflicts";
import { freshnessQualifier, isUsable } from "../context/freshness";
import { contentClassFor } from "../context/privacy";
import { sourcesOf } from "../context/provenance";
import { findRelevantFacts } from "../context/retrieval";
import type { ContextDomain, ContextTier, HouseholdContextItem, PrivacyClass } from "../context/types";
import { hopsFor } from "./goal";
import { profileFacts } from "./sleep/profiles";
import { buildHouseholdGraph, neighbours, type EdgeKind } from "./graph";
import { householdInsights } from "./insights";
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
  /** The context item it states, or null for a derived fact (a clash between two items, an inference). */
  itemId: string | null;
  domain: ContextDomain | "conflict" | "insight" | "profile";
  /** An inference's evidence: the `contextId`s of the facts it rests on, every one of them sent with it (§3.5). */
  evidence?: string[];
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
  /** And at most about this many tokens of them (HomeBrain 4.0 §3.4 step 5): a few long facts never crowd out the rest unseen. */
  tokenBudget?: number;
  /** The household's zone and today in it, for the inferences (§3.5). Without them, no inferences are drawn. */
  timezone?: string;
  today?: string;
  /**
   * Records close in meaning to the question (HomeBrain Sleep), item id →
   * similarity, from the household's embeddings. Lifts a record that shares
   * no word with the question; never overrules who or what part of the home
   * the reading named.
   */
  semantic?: ReadonlyMap<string, number>;
};

/** Close enough in meaning to offer to a model; near enough to stand beside a matched fact. */
export const SEMANTIC_RELATED = 0.72;
export const SEMANTIC_CLOSE = 0.8;

/**
 * What a fact one link away from a seed scores (HomeBrain 4.0 §3.4, story
 * 14-028): enough to be offered to a model, below the 0.5 a deterministic
 * answer is made of — so "Asmi's party is on Saturday" brings along the
 * day's other plans and the meal it needs, without a rules answer to "when
 * is the party?" listing them as if they were asked about.
 */
export const LINKED_SCORE = 0.45;
/** About 8k tokens of facts (§3.4), estimated at four characters a token. */
export const FACT_TOKEN_BUDGET = 8000;
/** Only a fact this sure of itself pulls its neighbours in. */
const SEED_SCORE = 0.6;
/** The links worth following. A person's own row is background, so nothing is followed out of it. */
const FOLLOWED: ReadonlySet<EdgeKind> = new Set(["about_person", "same_day", "needs", "responsible_for", "routed_from", "associated"]);
/** A plan or a decision goes one link further, only along what changes a plan: the day's other things, what a meal needs. */
const SECOND_HOP: ReadonlySet<EdgeKind> = new Set(["same_day", "needs"]);
const LINK_WORDS: Record<EdgeKind, string> = {
  about_person: "about someone in",
  same_day: "on the same day as",
  needs: "needed for",
  responsible_for: "looked after for",
  routed_from: "came in with",
  associated: "connected with",
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
  // A parent asking about their own day asks about their children's too —
  // except their health: "my checkup" is never a child's.
  const dependants = new Set(reading.dependants ?? []);
  const concerns = (item: HouseholdContextItem) =>
    item.subjectMemberIds.some((member) => people.has(member) || (item.domain !== "health" && dependants.has(member)));
  // A question about one part of the home ("health appointments") is not
  // answered with everything about the person asking — only the parts it is
  // unmistakably about, what those connect to, and the calendar.
  // A domain the question only reached through a common word ("week") is
  // not one of them when something else is plainly what it asks about.
  const inScope = new Set<ContextDomain>([...(reading.focus.size > 0 ? reading.focus : reading.domains), ...reading.connected]);
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

    // Close in meaning, though not in words (HomeBrain Sleep): "pasta in pink sauce" for "pink pasta".
    const meaning = options.semantic?.get(item.id);
    if (usable && meaning !== undefined && meaning >= SEMANTIC_RELATED) {
      const lifted = meaning >= SEMANTIC_CLOSE ? 0.55 : LINKED_SCORE;
      if (score < lifted) {
        score = lifted;
        reasons.push("close in meaning to the question");
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
      !reading.connected.has(item.domain) &&
      // A question that names a day is linked to what falls on it by the day
      // itself, not by a common word: "what do I need to remember tomorrow?"
      // is about tomorrow's karate class.
      !(reading.time && date && DATED_DOMAINS.has(item.domain) && inWindow(date, reading.time));
    if (weakOnly && score > 0.3) {
      score = 0.3;
      reasons.push("only a common word linked it to the question");
    }

    // A named person narrows personal facts to them — Asmi's question is not
    // answered with Manan's homework. Unassigned facts stay.
    if (score > 0 && people.size > 0 && PERSONAL_DOMAINS.has(item.domain) && item.subjectMemberIds.length > 0 && !concerns(item) && item.tier !== 1) {
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

  followLinks(drafts, items, hopsFor(reading.goal));
  // The person at a glance (HomeBrain Sleep): offered alongside, never what a rules answer is made of.
  // "Tell me about Asmi", "what do you know about Manan": the profile is the answer, so it leads.
  const aboutThePerson = /\b(?:tell me (?:all |everything )?about|what do you know about|what can you tell me about|who is|describe)\b/i.test(reading.retrievalText);
  if (options.today && reading.people.length > 0) {
    for (const profile of profileFacts(items, { memberIds: reading.people.map((person) => person.memberId), today: options.today })) {
      // Leading, the profile already says what its facts say: they step back, still there for a model to read.
      if (aboutThePerson) {
        const covered = new Set(profile.sourceItemIds);
        for (const draft of drafts) {
          if (draft.itemId && covered.has(draft.itemId) && draft.score > LINKED_SCORE) {
            draft.score = LINKED_SCORE;
            draft.reasons.push("said in the person's at-a-glance");
          }
        }
      }
      drafts.push({
        statement: `${profile.statement}.`,
        sourceIds: profile.sourceItemIds,
        confidence: 0.9,
        privacyClass: profile.privacyClass,
        relevant: true,
        score: aboutThePerson ? 0.75 : LINKED_SCORE,
        itemId: null,
        domain: "profile",
        subjectMemberIds: [profile.memberId],
        date: null,
        tier: 2,
        confirmed: true,
        need: "who this person is to the family, at a glance",
        reasons: ["the person the question names, at a glance"],
      });
    }
  }
  const evidenceOf = new Map<Omit<GroundedFact, "contextId">, string[]>();
  if (options.timezone && options.today) drawInferences(drafts, items, evidenceOf, { timezone: options.timezone, today: options.today, question: reading.retrievalText });

  drafts.sort((a, b) => b.score - a.score);
  const tokenBudget = options.tokenBudget ?? FACT_TOKEN_BUDGET;
  let kept = 0;
  let tokens = 0;
  for (const draft of drafts) {
    if (!draft.relevant) continue;
    kept += 1;
    tokens += Math.ceil(draft.statement.length / 4);
    // The first fact always goes, however long: an answer needs something to stand on.
    if (kept > budget || (kept > 1 && tokens > tokenBudget)) {
      draft.relevant = false;
      draft.score = 0;
      draft.reasons = ["less relevant than the facts already chosen"];
    }
  }

  const contextIdOf = new Map(drafts.map((draft, index) => [draft.itemId, `F${index + 1}`]));
  return drafts.map((draft, index) => {
    const evidence = evidenceOf.get(draft);
    return { ...draft, contextId: `F${index + 1}`, ...(evidence ? { evidence: evidence.map((itemId) => contextIdOf.get(itemId)).filter((id): id is string => Boolean(id)) } : {}) };
  });
}

/**
 * Inferences as facts (§3.5): one is relevant when what it rests on is — a
 * little above its strongest evidence, so "Friday's movie night is the night
 * before Asmi's exam" leads an answer about Friday — and then all of its
 * evidence goes with it. One resting on a fact this reading ruled out (about
 * someone else, outside the part of the home asked about) is not drawn.
 */
function drawInferences(
  drafts: Omit<GroundedFact, "contextId">[],
  items: readonly HouseholdContextItem[],
  evidenceOf: Map<Omit<GroundedFact, "contextId">, string[]>,
  options: { timezone: string; today: string; question: string },
): void {
  const byItem = new Map(drafts.filter((draft) => draft.itemId).map((draft) => [draft.itemId as string, draft]));
  for (const insight of householdInsights(items, options)) {
    // "When should we go away?" is answered by the calendar as a whole: the
    // free weekends rest on there being nothing, and what is on the others is
    // sent with them where it was drafted (it is the viewer's own either way).
    if (insight.rule === "free_window") {
      const found = insight.evidence.map((id) => byItem.get(id)).filter((draft): draft is Omit<GroundedFact, "contextId"> => Boolean(draft));
      const draft: Omit<GroundedFact, "contextId"> = {
        statement: insight.statement,
        sourceIds: found.flatMap((entry) => entry.sourceIds),
        confidence: 1,
        privacyClass: insight.privacyClass,
        relevant: true,
        score: insight.evidence.length === 0 ? 0.97 : 0.93,
        itemId: null,
        domain: "insight",
        subjectMemberIds: insight.subjectMemberIds,
        date: insight.date,
        tier: 2,
        confirmed: false,
        need: "when the family is free",
        reasons: [`inference (${insight.rule}) from the family calendar`, "named in the question"],
      };
      drafts.push(draft);
      evidenceOf.set(draft, insight.evidence.filter((id) => byItem.has(id)));
      continue;
    }
    const evidence = insight.evidence.map((id) => byItem.get(id));
    if (evidence.some((draft) => !draft || RULED_OUT.some((reason) => draft.reasons.includes(reason)))) continue;
    const strongest = Math.max(...evidence.map((draft) => (draft!.relevant ? draft!.score : 0)));
    if (strongest < LINKED_SCORE) continue;
    const score = strongest >= 0.5 ? Math.min(1, strongest + 0.05) : LINKED_SCORE;
    for (const draft of evidence) {
      if (draft!.score < LINKED_SCORE) {
        draft!.score = LINKED_SCORE;
        draft!.relevant = true;
        draft!.reasons.push("evidence for an inference");
      }
    }
    const draft: Omit<GroundedFact, "contextId"> = {
      statement: insight.statement,
      sourceIds: evidence.flatMap((entry) => entry!.sourceIds),
      confidence: Math.min(...evidence.map((entry) => entry!.confidence)),
      privacyClass: insight.privacyClass,
      relevant: true,
      score,
      itemId: null,
      domain: "insight",
      subjectMemberIds: insight.subjectMemberIds,
      date: insight.date,
      tier: 2,
      confirmed: false,
      need: "what two records mean together",
      reasons: [
        `inference (${insight.rule}) from ${insight.evidence.length === 1 ? "one record" : `${insight.evidence.length} records`}`,
        // Resting on what the question named, it answers the question too.
        ...(evidence.some((entry) => entry!.reasons.includes("named in the question")) ? ["named in the question"] : []),
      ],
    };
    drafts.push(draft);
    evidenceOf.set(draft, insight.evidence);
  }
}

const RULED_OUT = ["about someone the question did not ask about", "not in the part of the home the question is about"];

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

/**
 * One hop out from the facts the question is plainly about, along the
 * household graph. A fact already ruled out for this question — about
 * someone it did not ask about, or outside the part of the home it names —
 * stays out: a link never overrules the person or the scope a reading set.
 */
function followLinks(drafts: Omit<GroundedFact, "contextId">[], items: readonly HouseholdContextItem[], hops: 1 | 2): void {
  const byItem = new Map(drafts.filter((draft) => draft.itemId).map((draft) => [draft.itemId as string, draft]));
  const kindOf = new Map(items.map((item) => [item.id, item.entityType]));
  let seeds = drafts.filter((draft) => draft.itemId && draft.relevant && draft.score >= SEED_SCORE && kindOf.get(draft.itemId) !== "member").map((draft) => draft.itemId as string);
  if (seeds.length === 0) return;
  const graph = buildHouseholdGraph(items);
  const visited = new Set(seeds);
  for (let hop = 1; hop <= hops && seeds.length > 0; hop += 1) {
    const lifted: string[] = [];
    for (const [itemId, link] of neighbours(graph, seeds, hop === 1 ? FOLLOWED : SECOND_HOP)) {
      if (visited.has(itemId)) continue;
      visited.add(itemId);
      const draft = byItem.get(itemId);
      if (!draft || draft.score >= LINKED_SCORE) continue;
      if (RULED_OUT.some((reason) => draft.reasons.includes(reason))) continue;
      const seed = byItem.get(link.from);
      draft.score = LINKED_SCORE;
      draft.relevant = true;
      draft.reasons.push(`${LINK_WORDS[link.kind]} ${seed ? `"${seed.statement.split(/[.;]/)[0]}"` : "what the question is about"}`);
      if (kindOf.get(itemId) !== "member") lifted.push(itemId);
    }
    seeds = lifted;
  }
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

