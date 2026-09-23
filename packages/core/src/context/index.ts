/**
 * The Household Context & Grounding Engine (Wave 1): one canonical,
 * privacy-aware context layer shared by HomeBrain, HomeSend and HomeTalk.
 *
 *   Authoritative domain data → authorized reads (RLS) → canonical items
 *   → privacy + relevance → entity / reference resolution
 *   → evidence-ranked context → HomeBrain / HomeSend / HomeTalk
 *
 * Derived and rebuildable: nothing here is a second source of truth, and no
 * model is ever given a way to query the database — only facts this person
 * may see, chosen for the question, through the consent gate.
 */
export * from "./types";
export { buildContextItems, type ContextRecords, type MemoryRecord, type AgendaInput } from "./builders";
export { applyFreshness, assessFreshness, isUsable, STALE_AFTER_DAYS } from "./freshness";
export { attachHomeSendEvidence, describeProvenance, explainProvenance, sourcesOf } from "./provenance";
export { contentClassFor, filterForViewer, toCandidates } from "./privacy";
export { CONSEQUENTIAL_AT, RESOLVE_AT, canonicalRelation, mentionedItems, resolveEntity, resolvePerson, resolvePet, resolveReference, type ReferenceContext } from "./resolution";
export { describeMatch, findPotentialMatches, matchIncoming, needsReconciliation } from "./matching";
export { findPotentialConflicts } from "./conflicts";
export { CONTEXT_ADAPTERS, gatherHouseholdContext, loadHouseholdContext, type ContextSnapshot, type GatherOptions } from "./repository";
export {
  bindContextEngine,
  contextScopeFor,
  createContextEngine,
  factsForQuestion,
  findRelevantFacts,
  getCurrentState,
  getRecentChanges,
  getSupportingEvidence,
  readQuestion,
  type ContextEngine,
  type RankedFact,
} from "./retrieval";
export { CONTEXT_TTL_MS, householdMemory, invalidateHouseholdContext } from "./invalidation";
