/**
 * One evaluation framework for HomeTalk, HomeSend and HomeBrain (Wave 5,
 * `design/AI-EVALUATION-WAVE-5.md`).
 *
 * Every case, whichever surface it exercises, is compared stage by stage
 * along the §2 chain: what the input was read as, how it was grounded,
 * which household entity it landed on, which existing record it matched,
 * what was proposed, whether governance held, what the executor did, and
 * what the household was finally told. A case only states the stages it
 * cares about; the others are not compared, rather than silently passed.
 *
 * Nothing here is production data. Every case runs against a synthetic
 * golden household (`households.ts`, §3).
 */

export const SURFACES = ["hometalk", "homesend", "homebrain"] as const;
export type Surface = (typeof SURFACES)[number];

/** §4 — what a case is about. A case has one primary category. */
export const CASE_CATEGORIES = [
  "identity",
  "entity_resolution",
  "time_date",
  "references",
  "duplicates",
  "updates",
  "cancellation",
  "conflicts",
  "cross_domain",
  "privacy",
  "consequential",
  "untrusted_content",
] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

/** §2 — the comparison chain, in order. */
export const STAGES = ["interpretation", "grounding", "entity", "match", "conflict", "action", "safety", "executor", "answer"] as const;
export type Stage = (typeof STAGES)[number];

/** §10 — why a case failed, tracked independently. */
export const ERROR_TYPES = [
  "false_entity_match",
  "false_duplicate",
  "missed_duplicate",
  "false_high_confidence",
  "unnecessary_clarification",
  "unsupported_answer",
  "stale_context_use",
  "privacy_leak",
  "unsafe_proposal",
  "unsafe_execution",
  "provider_failure",
  // Not in the §10 list, but a failure has to be named something: a stage
  // that simply came out different from what was expected.
  "wrong_interpretation",
  "wrong_date",
  "wrong_action",
  "missed_conflict",
  "false_conflict",
  "incomplete_answer",
] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

/** The golden households (§3). */
export const HOUSEHOLD_KEYS = ["A", "B", "C", "D", "E"] as const;
export type HouseholdKey = (typeof HOUSEHOLD_KEYS)[number];

/** What an existing-record match came out as. "new" means nothing on record fits. */
export type MatchOutcome = "duplicate" | "update" | "cancellation" | "conflict" | "new";

/**
 * What a case expects, stage by stage. Every field is optional: a stage a
 * case says nothing about is not compared.
 */
export type Expectation = {
  /** What the input was read as: a HomeTalk action, a HomeSend kind, a HomeBrain question domain. */
  interpretation?: string;
  /** The local day the input was grounded to (YYYY-MM-DD), or null when no day should be decided. */
  date?: string | null;
  /** The local time of day it was grounded to ("HH:MM", or "HH:MM–HH:MM" with an end), or null for all day (14-014). */
  time?: string | null;
  /** The household member it lands on, or "ask" when the right answer is one question. */
  entity?: string | "ask" | null;
  /** The existing record it matches, and how. */
  match?: { outcome: MatchOutcome; recordId?: string };
  /** Whether a genuine conflict should be raised. */
  conflict?: boolean;
  /** What is proposed: the HomeTalk proposal kind, or the HomeSend confirmation mode. */
  action?: string;
  /**
   * Governance: a consequential case says what must not happen. `executed:
   * false` is the §9 release gate — a consequential action that executes is
   * an unsafe execution whatever else the case says.
   */
  safety?: { consequential: boolean; executed?: false; refused?: boolean; injectionFlagged?: boolean };
  /** The executor's own result, when the case runs one. */
  executor?: "ok" | "failed" | "not_run";
  /** What the final answer must, and must never, say. */
  answer?: { includes?: string[]; excludes?: string[] };
};

type CaseBase = {
  /** Stable, never reused: results are compared across runs by this id. */
  id: string;
  household: HouseholdKey;
  category: CaseCategory;
  /** The member acting — a key in the golden household. */
  actor: string;
  description: string;
  expected: Expectation;
};

export type HomeTalkCase = CaseBase & {
  surface: "hometalk";
  utterance: string;
  channel?: "text" | "voice";
  transcriptConfidence?: number;
  /** The household's autonomy for the outcome the turn touches; "approve" when unset. */
  autonomy?: "observe" | "prepare" | "approve" | "execute";
  /** What the conversation was just about, for "it", "that" and "the same one". */
  references?: import("./households").ReferenceSpec;
  /**
   * §16 failure semantics: the model is unreachable or answers nonsense for
   * this turn, whichever provider the run is for. The case then says what the
   * household must still get.
   */
  simulate?: "provider_error" | "unparseable";
};

export type HomeSendCase = CaseBase & {
  surface: "homesend";
  /** The source content as it arrived. */
  source: { channel: "pasted_text" | "email" | "audio" | "link" | "file"; text: string; subject?: string; attachment?: string; capturedAt?: string };
  /**
   * What the classifier read it as — the recorded model interpretation the
   * deterministic run scores the rest of the chain against. A live-provider
   * run replaces it with the provider's own reading.
   */
  reading: Partial<import("../ai/classify-intake").IntakeExtraction>;
  memberInitiated?: boolean;
  autonomy?: "observe" | "prepare" | "approve" | "execute";
  transcriptConfidence?: number;
};

export type HomeBrainCase = CaseBase & {
  surface: "homebrain";
  question: string;
  previousQuestion?: string;
};

export type EvalCase = HomeTalkCase | HomeSendCase | HomeBrainCase;

/** What a runner observed, in the same shape as an expectation. */
export type Observation = {
  interpretation: string | null;
  date: string | null;
  time: string | null;
  entity: string | "ask" | null;
  match: { outcome: MatchOutcome; recordId: string | null };
  conflict: boolean;
  action: string | null;
  safety: { consequential: boolean; executed: boolean; refused: boolean; injectionFlagged: boolean };
  executor: "ok" | "failed" | "not_run";
  answer: string;
  /** How sure the understanding was, 0–1, when it said. */
  confidence: number | null;
  /** Set when the model could not be reached or its output could not be read. */
  providerFailure: string | null;
};

export type StageResult = { stage: Stage; pass: boolean; expected: unknown; actual: unknown };

export type CaseResult = {
  caseId: string;
  surface: Surface;
  household: HouseholdKey;
  category: CaseCategory;
  pass: boolean;
  stages: StageResult[];
  /** Every §10 error type this case showed; empty when it passed. */
  errors: ErrorType[];
  /** A consequential case (§9): payment, access, sensitive data. */
  consequential: boolean;
  latencyMs: number;
  /** Tokens, when the provider reported them. */
  tokens: { input: number; output: number } | null;
};

/** Which model, prompt and context a run was made with (§12, §22). */
export type RunConfig = {
  provider: "deterministic" | "anthropic" | "google" | "openai";
  model: string;
  promptVersion: string;
  contextVersion: string;
  datasetVersion: string;
};

export type EvaluationRun = RunConfig & {
  startedAt: string;
  results: CaseResult[];
};
