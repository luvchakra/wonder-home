import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContextCandidate } from "../ai/privacy";
import type { HouseholdMembership } from "../identity/schemas";
import type { PersonalView } from "../identity/views";
import { findPotentialConflicts } from "./conflicts";
import { isUsable } from "./freshness";
import { findPotentialMatches, matchIncoming } from "./matching";
import { normalizeText } from "./normalize";
import { toCandidates } from "./privacy";
import { describeProvenance, explainProvenance, sourcesOf } from "./provenance";
import { loadHouseholdContext, type ContextSnapshot, type GatherOptions } from "./repository";
import { mentionedItems, resolveEntity, resolvePerson, resolvePet, resolveReference, type ReferenceContext } from "./resolution";
import type { ContextDomain, ContextScope, HouseholdContextItem, IncomingFact, SourceRef } from "./types";

/**
 * Retrieval: what this person needs for this moment (Wave 1 §5, §8).
 *
 * "HomeBrain should know the home broadly, but send the model only what this
 * user needs for this moment." The snapshot knows the home broadly; this file
 * decides what a question needs:
 *
 *   Tier 1 — always: the household, its people and pets, what needs a
 *            person, what is waiting for a yes.
 *   Tier 2 — the household's current state in the domains the question is
 *            about, or about the people and things it names. A broad
 *            question ("what's going on?") is about all of it.
 *   Tier 3 — history (paid bills, finished homework, past purchases,
 *            HomeSend and HomeTalk context): only when the question points
 *            at it by name or by domain — never for a broad question.
 *   Tier 4 — source evidence: only through `getSupportingEvidence`, on
 *            purpose, never as a fact.
 *
 * Everything not needed is still handed to the consent gate — marked not
 * relevant — so the gate can tell the household honestly what was held back
 * and why.
 */

/** The words that put a question in a domain. */
export const DOMAIN_WORDS: Partial<Record<ContextDomain, readonly string[]>> = {
  bills: ["bill", "bills", "pay", "paid", "payment", "due", "electricity", "rent", "fee", "fees", "emi", "insurance", "subscription", "money", "owe", "spend", "spent", "amount"],
  school: ["homework", "school", "exam", "test", "project", "worksheet", "teacher", "assignment", "study", "studies", "class", "tuition"],
  groceries: ["grocery", "groceries", "milk", "buy", "shop", "shopping", "stock", "supplies", "run", "running", "out", "need", "needs", "order"],
  orders: ["order", "orders", "delivery", "delivered", "arrive", "arriving"],
  meals: ["dinner", "lunch", "breakfast", "meal", "meals", "cook", "cooking", "eat", "food", "recipe", "menu", "snack"],
  calendar: ["calendar", "schedule", "event", "events", "plan", "plans", "weekend", "party", "match", "today", "tomorrow", "week", "when", "busy", "free"],
  absences: ["away", "off", "leave", "available", "holiday", "travel", "travelling", "traveling", "around", "here"],
  health: ["health", "doctor", "dentist", "appointment", "appointments", "checkup", "medicine", "sick", "unwell", "bp", "blood", "pressure", "weight", "vital", "fitness", "exercise", "walk", "headache", "fever"],
  pets: ["pet", "pets", "dog", "cat", "vet"],
  pet_care: ["vet", "grooming", "litter", "pet", "walk", "dog", "cat"],
  home: ["repair", "service", "ac", "fridge", "plumber", "electrician", "maintenance", "warranty", "appliance", "broken", "fix"],
  laundry: ["laundry", "uniform", "clothes", "wash", "washing", "ironing"],
  responsibilities: ["responsible", "responsibility", "handles", "handle", "charge", "owner", "owns", "who", "does"],
  outcomes: ["track", "going", "outcome", "outcomes", "progress"],
  preferences: ["prefer", "prefers", "preference", "like", "likes", "usually", "always", "rule", "rules", "favourite", "favorite", "allergy", "allergic"],
  notifications: ["notification", "notifications", "alert", "alerts", "reminder", "reminders", "told", "notice"],
  homesend: ["homesend", "sent", "photo", "forwarded", "forward", "uploaded", "upload", "email", "document"],
  hometalk: ["asked", "earlier", "proposal", "proposed", "said", "approve", "approved"],
  agents: ["agent", "agents", "check", "checked", "automatic", "automatically"],
  integrations: ["connected", "connection", "connections", "integration", "sync", "synced", "account"],
  attention: ["attention", "urgent", "pending", "overdue", "late", "problem", "problems", "wrong"],
};

/** Words that ask about the past, which is what opens Tier 3's history. */
const HISTORY_WORDS = ["last", "before", "previous", "previously", "history", "ago", "earlier", "used", "did", "was", "were", "paid", "finished", "done", "completed", "past"];

export type RankedFact = { item: HouseholdContextItem; score: number; reasons: string[] };

export type RelevanceOptions = {
  /** Most facts to mark relevant. The consent gate still applies its own budget. */
  budget?: number;
};

/** Which domains a question is about, and which people or things it names. */
export function readQuestion(question: string, items: readonly HouseholdContextItem[]): { domains: Set<ContextDomain>; mentioned: HouseholdContextItem[]; history: boolean; broad: boolean } {
  const said = new Set(normalizeText(question).split(" ").filter(Boolean));
  const domains = new Set<ContextDomain>();
  for (const [domain, words] of Object.entries(DOMAIN_WORDS) as [ContextDomain, readonly string[]][]) {
    if (words.some((word) => said.has(word))) domains.add(domain);
  }
  const mentioned = mentionedItems(question, items);
  const history = HISTORY_WORDS.some((word) => said.has(word));
  // Only calendar-ish time words, or nothing at all, means "tell me about the home".
  const substantive = [...domains].filter((domain) => domain !== "calendar" && domain !== "attention");
  const broad = substantive.length === 0 && mentioned.filter((item) => item.entityType !== "household").length === 0;
  return { domains, mentioned, history, broad };
}

/**
 * Ranks every usable fact against a question. Returns them all, most
 * relevant first, each with a score (0 means not needed) and the reasons.
 */
export function findRelevantFacts(snapshot: Pick<ContextSnapshot, "items">, question: string | null, options: RelevanceOptions = {}): RankedFact[] {
  const budget = options.budget ?? 60;
  const items = snapshot.items;

  if (question === null) {
    // No question: the home's current state, which is what HomeBrain has always been told.
    return items.filter((item) => isUsable(item) && item.tier <= 2).map((item) => ({ item, score: item.tier === 1 ? 1 : 0.5, reasons: ["current household state"] }));
  }

  const read = readQuestion(question, items);
  const mentionedIds = new Set(read.mentioned.map((item) => item.id));
  const mentionedMembers = new Set(read.mentioned.filter((item) => item.entityType === "member").map((item) => item.entityId));
  const mentionedEntities = new Set(read.mentioned.map((item) => item.entityId));

  const ranked: RankedFact[] = [];
  for (const item of items) {
    const reasons: string[] = [];
    let score = 0;
    const usable = isUsable(item);
    const historical = item.freshness === "historical";

    if (!usable && !(historical && read.history)) {
      ranked.push({ item, score: 0, reasons: [item.freshness === "superseded" ? "replaced by a newer fact" : "no longer current"] });
      continue;
    }

    if (item.tier === 1) {
      score = 1;
      reasons.push("always needed");
    }
    if (mentionedIds.has(item.id)) {
      score = Math.max(score, 0.95);
      reasons.push("named in the question");
    }
    if (item.subjectMemberIds.some((member) => mentionedMembers.has(member)) || item.relatedEntityIds.some((id) => mentionedEntities.has(id))) {
      score = Math.max(score, item.tier === 3 && !read.history ? 0.6 : 0.85);
      reasons.push("about someone or something named in the question");
    }
    if (read.domains.has(item.domain)) {
      score = Math.max(score, item.tier === 3 ? (read.history ? 0.7 : 0.45) : 0.75);
      reasons.push("in the part of the home the question is about");
    }
    if (read.broad && item.tier === 2 && usable) {
      score = Math.max(score, 0.4);
      reasons.push("part of the home's current state");
    }
    if (historical && read.history && score > 0) reasons.push("history, and the question asks about the past");
    if (score > 0 && item.freshness === "stale") score -= 0.05;
    if (score > 0 && (item.domain === "attention" || item.attributes.riskLevel === "high")) score += 0.02;

    ranked.push({ item, score, reasons: score > 0 ? reasons : ["not needed to answer this"] });
  }

  ranked.sort((a, b) => b.score - a.score);
  // Beyond the budget a fact is not needed after all; the least relevant go first.
  let kept = 0;
  for (const entry of ranked) {
    if (entry.score <= 0) continue;
    kept += 1;
    if (kept > budget) {
      entry.score = 0;
      entry.reasons = ["less relevant than the facts already chosen"];
    }
  }
  return ranked;
}

/** The consent gate's candidates for one question: relevant ones first, the rest marked not relevant. */
export function factsForQuestion(snapshot: Pick<ContextSnapshot, "items">, question: string | null, options: RelevanceOptions = {}): ContextCandidate[] {
  const ranked = findRelevantFacts(snapshot, question, options).filter((entry) => question === null || isUsable(entry.item) || entry.score > 0);
  const relevant = new Set(ranked.filter((entry) => entry.score > 0).map((entry) => entry.item.id));
  return toCandidates(
    ranked.map((entry) => entry.item),
    (item) => relevant.has(item.id),
  );
}

/** What is true now, optionally for one domain or one person. */
export function getCurrentState(snapshot: Pick<ContextSnapshot, "items">, filter: { domain?: ContextDomain; subjectMemberId?: string } = {}): HouseholdContextItem[] {
  return snapshot.items.filter(
    (item) =>
      isUsable(item) &&
      item.entityType !== "state" &&
      (!filter.domain || item.domain === filter.domain) &&
      (!filter.subjectMemberId || item.subjectMemberIds.includes(filter.subjectMemberId)),
  );
}

/**
 * What changed recently — only items that carry a real timestamp of their
 * own. A row read a moment ago is not a change; it is just current.
 */
export function getRecentChanges(snapshot: Pick<ContextSnapshot, "items">, options: { since: Date }): HouseholdContextItem[] {
  return snapshot.items
    .filter((item) => item.source.capturedAt && Date.parse(item.source.capturedAt) >= options.since.getTime())
    .sort((a, b) => Date.parse(b.source.capturedAt!) - Date.parse(a.source.capturedAt!));
}

/** Tier 4, on purpose: where one fact came from. Null when the item is not one this person may see. */
export function getSupportingEvidence(
  snapshot: Pick<ContextSnapshot, "items" | "scope">,
  itemId: string,
): { item: HouseholdContextItem; sources: SourceRef[]; provenance: string[]; explanation: string } | null {
  const item = snapshot.items.find((entry) => entry.id === itemId);
  if (!item) return null;
  return {
    item,
    sources: sourcesOf(item),
    provenance: describeProvenance(item, snapshot.scope.timezone),
    explanation: explainProvenance(item, snapshot.scope.timezone),
  };
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/** Authenticated actor + household scope, from what `requireMembership` and the personal view already established. */
export function contextScopeFor(membership: HouseholdMembership, view: PersonalView, now: Date = new Date()): ContextScope {
  return {
    householdId: membership.household.id,
    householdName: membership.household.name,
    timezone: membership.household.timezone,
    now,
    viewer: { memberId: membership.memberId, permissions: view.permissions, tone: view.tone, guardianOf: [] },
  };
}

export type ContextEngine = ReturnType<typeof bindContextEngine>;

/** Every retrieval operation, bound to one authorized snapshot. Pure from here on: nothing below reads. */
export function bindContextEngine(snapshot: ContextSnapshot) {
  const { scope, items } = snapshot;
  const referenceContext = (extra: Partial<ReferenceContext> = {}): ReferenceContext => ({ timezone: scope.timezone, now: scope.now, ...extra });

  return {
    snapshot,
    resolvePerson: (reference: string, options: { consequential?: boolean } = {}) => resolvePerson(reference, items, { viewerMemberId: scope.viewer.memberId, ...options }),
    resolvePet: (reference: string, options: { consequential?: boolean } = {}) => resolvePet(reference, items, options),
    resolveReference: (reference: string, extra: Partial<ReferenceContext> = {}) => resolveReference(reference, items, referenceContext(extra)),
    resolveEntity: (reference: string, entityTypes: readonly string[], extra: Partial<ReferenceContext> = {}) => resolveEntity(reference, items, { ...referenceContext(extra), entityTypes }),
    findRelevantFacts: (question: string | null, options?: RelevanceOptions) => findRelevantFacts(snapshot, question, options),
    factsForQuestion: (question: string | null, options?: RelevanceOptions) => factsForQuestion(snapshot, question, options),
    findPotentialMatches: (incoming: IncomingFact) => findPotentialMatches(incoming, items, { timezone: scope.timezone }),
    matchIncoming: (incoming: IncomingFact) => matchIncoming(incoming, items, { timezone: scope.timezone }),
    findPotentialConflicts: () => findPotentialConflicts(items),
    getCurrentState: (filter?: { domain?: ContextDomain; subjectMemberId?: string }) => getCurrentState(snapshot, filter),
    getRecentChanges: (options: { since: Date }) => getRecentChanges(snapshot, options),
    getSupportingEvidence: (itemId: string) => getSupportingEvidence(snapshot, itemId),
  };
}

/**
 * The engine for one authenticated member of one household. Reads through
 * the member's own client — never a service-role client, never a query a
 * model wrote — and binds every operation to what that read returned.
 */
export async function createContextEngine(supabase: SupabaseClient, scope: ContextScope, options: GatherOptions = {}): Promise<ContextEngine> {
  return bindContextEngine(await loadHouseholdContext(supabase, scope, options));
}

