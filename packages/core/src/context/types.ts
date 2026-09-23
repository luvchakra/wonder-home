/**
 * The Household Context & Grounding Engine's contracts (Wave 1).
 *
 * One canonical shape for "something WonderHome knows about this home",
 * derived from the authoritative domain tables and rebuildable from them at
 * any time. Nothing here is stored: the domain repositories stay the source
 * of truth, and this layer only ever reads them through the member's own
 * RLS-scoped client.
 */

/** Every shipped domain the engine has an authorized read path for. */
export const CONTEXT_DOMAINS = [
  "household",
  "people",
  "pets",
  "responsibilities",
  "outcomes",
  "preferences",
  "calendar",
  "absences",
  "school",
  "groceries",
  "orders",
  "meals",
  "bills",
  "home",
  "laundry",
  "pet_care",
  "health",
  "notifications",
  "homesend",
  "hometalk",
  "agents",
  "integrations",
  "attention",
] as const;
export type ContextDomain = (typeof CONTEXT_DOMAINS)[number];

/**
 * How private a fact is. Maps onto the consent gate's content classes
 * (`ai/privacy.ts`) at the model boundary — `private` is the class for
 * something one person said or keeps to themselves.
 */
export type PrivacyClass = "general" | "child" | "financial" | "health" | "location" | "private";

/** Whether a fact still describes the home as it is now. */
export type Freshness = "current" | "stale" | "historical" | "superseded" | "unknown";

/**
 * How close to the question a fact has to be before it is worth reading.
 * 1 is always relevant, 4 is only ever fetched on purpose.
 */
export type ContextTier = 1 | 2 | 3 | 4;

/** Where a fact came from — a table row, a HomeSend intake, a conversation. Never a model's reasoning. */
export type SourceRef = {
  type: string;
  sourceId: string | null;
  capturedAt: string | null;
};

/** The privacy scope a health row carries, when it carries one. */
export type HealthScope = "private" | "selected_family" | "household_operational";

export type HouseholdContextItem = {
  /** Stable within a household: `${entityType}:${entityId}`. Never sent to a model. */
  id: string;
  householdId: string;
  domain: ContextDomain;
  entityType: string;
  entityId: string;
  subjectMemberIds: string[];

  /** The fact in the household's own words, with real names — pseudonymised at the model boundary. */
  summary: string;
  /** Why an answer would want this, in one phrase — shown to the household when it asks what was sent. */
  need: string;
  /** Structured fields matching and resolution compare on (title, dates, amounts, status). */
  attributes: Record<string, unknown>;

  source: SourceRef;
  /** Further provenance beyond the row itself, e.g. the HomeSend intake it was routed from. */
  evidence: SourceRef[];

  confidence: number;
  /** A person stated or confirmed it, rather than WonderHome inferring it. */
  confirmed: boolean;
  privacyClass: PrivacyClass;
  /** Set only for health rows, which carry their own per-person visibility. */
  healthScope?: HealthScope;

  validFrom: string | null;
  validUntil: string | null;
  /** When this was last known to be true. */
  freshnessAt: string;
  freshness: Freshness;
  /** The item that replaced this one, when `freshness` is `superseded`. */
  supersededBy?: string;
  tier: ContextTier;

  /** Other words the household uses for the same thing. */
  aliases: string[];
  relatedEntityIds: string[];
  /**
   * Two items with the same identity describe the same real thing, so only
   * one of them can be current. Set only where identity is genuine.
   */
  identityKey?: string;
  /** How much a source is trusted when two items disagree: 3 authoritative record, 2 stated by a person, 1 inferred, 0 raw source content. */
  authority: number;
};

/** Who is asking, and what their role already lets them see. */
export type ContextViewer = {
  memberId: string;
  permissions: readonly string[];
  tone: "adult" | "child" | "helper";
  /** Children this member is a guardian of — the one authority over someone else's private health. */
  guardianOf: readonly string[];
};

/** Authenticated actor plus household scope. Every retrieval needs one. */
export type ContextScope = {
  householdId: string;
  householdName: string;
  timezone: string;
  now: Date;
  viewer: ContextViewer;
};

/** A person as the engine resolves them. Helpers are people; pets are not. */
export type PersonRef = {
  kind: "family" | "helper";
  memberId: string;
  displayName: string;
  memberType: "adult" | "child" | "helper";
};

export type PetRef = { kind: "pet"; petId: string; name: string; species: string };

export type ResolutionCandidate<T> = {
  entity: T;
  confidence: number;
  /** Context item ids that support the candidate. */
  evidenceIds: string[];
  reasons: string[];
};

export type Resolution<T> = {
  candidates: ResolutionCandidate<T>[];
  selected: T | null;
  ambiguous: boolean;
  /** What to ask when nothing was selected. Null when resolved. */
  question: string | null;
};

export const MATCH_VERDICTS = [
  "exact_match",
  "likely_duplicate",
  "likely_update",
  "related_but_different",
  "contradiction",
  "no_match",
] as const;
export type MatchVerdict = (typeof MATCH_VERDICTS)[number];

/** Something arriving — from HomeSend, HomeTalk or a form — to be checked against what is already known. */
export type IncomingFact = {
  domain: ContextDomain;
  title: string;
  subjectMemberId?: string | null;
  /** ISO date or date-time the fact is about (a due date, an event day). */
  date?: string | null;
  amountMinor?: number | null;
  /** Free-form extras compared where both sides have them (payee, subject, kind). */
  attributes?: Record<string, string | number | null | undefined>;
  /** When the source content was captured — an older source never silently overrides a newer record. */
  capturedAt?: string | null;
};

export type MatchResult = {
  verdict: MatchVerdict;
  item: HouseholdContextItem | null;
  confidence: number;
  reasons: string[];
};

export type ContextConflict = {
  kind: "schedule_overlap" | "contradictory_facts" | "away_but_assigned";
  itemIds: string[];
  subjectMemberIds: string[];
  summary: string;
  severity: "low" | "medium" | "high";
};
