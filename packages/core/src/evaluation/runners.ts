import type { IntakeExtraction } from "../ai/classify-intake";
import { DEFAULT_DATA_USE } from "../ai/privacy";
import type { AnswerComposer } from "../ai/model-client";
import { converse, type Understanding } from "../conversation/engine";
import { canExecute } from "../conversation/executor";
import { groundIntent } from "../conversation/grounding";
import { localDateTime, pendingWords, roleWords } from "../conversation/moment";
import { isConsequential, type HouseholdIntent } from "../conversation/intent";
import { answerWithHomeBrain } from "../homebrain/turn";
import { decideConfirmation } from "../homesend/confirmation";
import { detectInstructionInjection } from "../homesend/injection";
import { reconcileAgainstRecords, type HomeSendCandidate } from "../homesend/reconcile";
import { adoptMatchedSubject, resolveIntakePeople } from "../homesend/resolve";
import { buildUnderstanding } from "../homesend/understanding";
import { compareStages } from "./compare";
import { contextItemsFor, GOLDEN_HOUSEHOLDS, groundingEnvFor, memberNames, memberOf, peopleOf, viewerFor } from "./households";
import type { CaseResult, EvalCase, HomeBrainCase, HomeSendCase, HomeTalkCase, Observation } from "./types";

/**
 * The runners (Wave 5 §2, §5–§7): each drives the real production pipeline
 * for its surface — the same functions the conversation route, the HomeSend
 * pipeline and HomeBrain call — against a golden household, and reports
 * what it observed in one shape. No runner writes anything anywhere.
 *
 * What a model does is the one thing a runner is handed from outside:
 * absent, the run is deterministic (the safety net every surface keeps);
 * present, it is that provider's run, scored by the same comparison.
 */

export type Models = {
  /** HomeTalk's understanding. Absent: the deterministic rules. */
  understand?: Understanding;
  /** HomeSend's reading of the source. Absent: the case's recorded reading. */
  classify?: (source: HomeSendCase["source"], reference: { now: Date; timezone: string }) => Promise<IntakeExtraction | null>;
  /** HomeBrain's answer composer. Absent: the deterministic answer. */
  compose?: AnswerComposer;
};

const EMPTY: Observation = {
  interpretation: null,
  date: null,
  entity: null,
  match: { outcome: "new", recordId: null },
  conflict: false,
  action: null,
  safety: { consequential: false, executed: false, refused: false, injectionFlagged: false },
  executor: "not_run",
  answer: "",
  confidence: null,
  providerFailure: null,
};

// --- HomeTalk -----------------------------------------------------------------

/** The one day a grounded intent was pinned to, whichever parameter carries it. */
function groundedDay(intent: HouseholdIntent): string | null {
  for (const [key, value] of Object.entries(intent.parameters)) {
    if (!key.endsWith("Resolved") || !value || typeof value !== "object") continue;
    const date = (value as { date?: unknown }).date;
    if (typeof date === "string") return date;
  }
  return null;
}

/** A model that is down, or that answers something unreadable — the §16 failure paths. */
function failingUnderstanding(kind: "provider_error" | "unparseable"): Understanding {
  return (utterance, context) => ({
    action: "unknown",
    actorMemberId: context.actorMemberId,
    target: { kind: "unspecified" },
    parameters: {},
    confidence: 0,
    channel: context.channel,
    utterance,
    understanding: { source: "model", provider: "anthropic", failure: kind },
  });
}

export async function observeHomeTalk(c: HomeTalkCase, models: Models = {}): Promise<Observation> {
  const household = GOLDEN_HOUSEHOLDS[c.household];
  const who = memberOf(household, c.actor);
  const result = await converse({
    utterance: c.utterance,
    channel: c.channel ?? "text",
    ...(c.transcriptConfidence !== undefined ? { transcriptConfidence: c.transcriptConfidence } : {}),
    actor: { memberId: who.id, roles: who.roles, memberType: who.memberType },
    pending: null,
    autonomyFor: () => c.autonomy ?? "approve",
    entitledFor: () => true,
    executable: canExecute,
    sessionId: `eval-${c.id}`,
    now: household.now,
    ground: (intent) => groundIntent(intent, groundingEnvFor(household, who.id, c.references)),
    // The moment exactly as the conversation route tells it to a model.
    runtime: {
      role: roleWords(who),
      localDateTime: localDateTime(household.now, household.timezone),
      pending: pendingWords(c.references?.proposal?.[0] ? { summary: c.references.proposal[0].label } : null),
      recent: [...new Set([...(c.references?.conversation ?? []), ...(c.references?.homesend ?? [])].map((spec) => spec.label))].slice(0, 5),
    },
    ...(c.simulate ? { understand: failingUnderstanding(c.simulate) } : models.understand ? { understand: models.understand } : {}),
  });

  if (result.kind !== "reply") {
    return { ...EMPTY, action: result.kind, answer: result.text };
  }
  const intent = result.intent;
  const awaiting = intent.parameters.awaiting;
  const entity =
    result.proposal.kind === "clarify" && awaiting === "member"
      ? "ask"
      : typeof intent.parameters.memberId === "string"
        ? intent.parameters.memberId
        : null;
  return {
    ...EMPTY,
    interpretation: intent.action,
    date: groundedDay(intent),
    entity,
    action: result.proposal.kind,
    safety: {
      consequential: isConsequential(intent.action),
      executed: result.proposal.kind === "executed",
      refused: result.proposal.kind === "refused",
      injectionFlagged: false,
    },
    answer: result.text,
    confidence: intent.confidence,
    providerFailure: intent.understanding?.failure ?? null,
  };
}

// --- HomeSend -----------------------------------------------------------------

export const BLANK_READING: IntakeExtraction = {
  readable: true, kind: "unknown", title: null, notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: null,
  schoolKind: null, subject: null, quantity: null, unit: null, category: null, healthRecordType: null, documentDate: null, dateText: null,
  subjectMemberName: null, summary: null, people: [], facts: [], needs: [], change: "new", confidence: "high", secondary: null,
};

const CHANGE_DOMAIN = { bill: "bill", school_item: "school_item", grocery_item: "grocery_item", health_document: "health_document" } as const;

export async function observeHomeSend(c: HomeSendCase, models: Models = {}): Promise<Observation> {
  const household = GOLDEN_HOUSEHOLDS[c.household];
  // A date phrase is resolved against when the content was written, in the household's timezone.
  const reference = { now: c.source.capturedAt ? new Date(c.source.capturedAt) : household.now, timezone: household.timezone };
  const reading = models.classify ? await models.classify(c.source, reference) : { ...BLANK_READING, ...c.reading };
  if (!reading) return { ...EMPTY, providerFailure: "unparseable", answer: "" };

  const injection = detectInstructionInjection(c.source.text, c.source.subject);
  const understanding = buildUnderstanding(reading, {
    channel: c.source.channel === "audio" ? "audio_note" : c.source.channel === "email" ? "email" : c.source.channel === "link" ? "link" : c.source.channel === "file" ? "manual_upload" : "pasted_text",
    transcriptConfidence: c.transcriptConfidence ?? null,
    subject: c.source.subject ?? null,
    filename: c.source.attachment ?? null,
    injection,
  });

  const items = contextItemsFor(household, c.actor);
  const resolution = resolveIntakePeople(understanding, items, { viewerMemberId: c.actor });
  const kind = reading.kind;
  const date = reading.dueDate ?? reading.documentDate ?? null;
  const reconciliation =
    kind !== "unknown" && reading.title
      ? reconcileAgainstRecords(
          household.records,
          household.id,
          {
            kind: CHANGE_DOMAIN[kind],
            title: reading.title,
            date,
            amount: reading.amount,
            payee: reading.payee,
            subjectMemberId: resolution.subject.selected?.memberId ?? null,
            change: reading.change,
            // When the content was captured — an older message against a
            // record changed since is a conflict, not an update (§10).
            capturedAt: c.source.capturedAt ?? household.now.toISOString(),
          } satisfies HomeSendCandidate,
          { timezone: household.timezone, now: household.now, memberNames: memberNames(household) },
        )
      : null;

  // Who it is for: what the content said, or else whose record it matched.
  const subject = adoptMatchedSubject(kind, resolution.subject, reconciliation?.existingId ? reconciliation.existing.subjectMemberId : null, items);

  const decision = decideConfirmation({
    kind,
    extracted: { title: reading.title, needs: reading.needs, confidence: reading.confidence },
    understanding,
    reconciliation,
    subject,
    memberInitiated: c.memberInitiated ?? c.source.channel !== "email",
    autonomy: c.autonomy ?? "observe",
  });

  const proposal = reconciliation?.proposal.type ?? "new";
  const provenance = understanding.provenance;
  const told = [
    understanding.contentSummary,
    ...understanding.candidateActions.map((action) => `${action.type}: ${Object.values(action.fields).filter((value) => value !== null).join(", ")}`),
    `Source: ${[provenance.channel, provenance.subject, provenance.filename].filter(Boolean).join(" — ")}`,
    reconciliation?.message,
    subject.question,
    decision.reason,
    decision.question,
  ].filter((part): part is string => typeof part === "string" && part.length > 0);

  return {
    ...EMPTY,
    interpretation: kind,
    date,
    entity: subject.question ? "ask" : (subject.selected?.memberId ?? null),
    match: { outcome: proposal, recordId: reconciliation?.existingId ?? null },
    conflict: proposal === "conflict",
    action: decision.mode,
    safety: {
      consequential: kind === "bill" || kind === "health_document",
      executed: decision.mode === "auto_apply",
      refused: false,
      injectionFlagged: understanding.safety.instructionsIgnored,
    },
    answer: told.join("\n"),
    confidence: { high: 0.9, medium: 0.7, low: 0.4 }[understanding.confidence],
  };
}

// --- HomeBrain ----------------------------------------------------------------

export async function observeHomeBrain(c: HomeBrainCase, models: Models = {}): Promise<Observation> {
  const household = GOLDEN_HOUSEHOLDS[c.household];
  const who = memberOf(household, c.actor);
  const answer = await answerWithHomeBrain({
    question: c.question,
    sentQuestion: c.question,
    previousQuestion: c.previousQuestion ?? null,
    sentHistory: [],
    items: contextItemsFor(household, c.actor),
    viewer: { memberId: who.id, roleLabel: who.memberType === "child" ? "Child" : who.memberType === "helper" ? "Househelper" : "Adult", guardianOf: viewerFor(household, who.id).guardianOf },
    timezone: household.timezone,
    now: household.now,
    policy: DEFAULT_DATA_USE,
    people: peopleOf(household),
    compose: models.compose ?? null,
    factBudget: 12,
  });
  // A whole-home question can come back without a sentence of its own (the
  // route then shows its summary); the facts HomeBrain chose are the answer.
  const text = answer.text ?? answer.facts.map((fact) => fact.statement).join("\n");
  const reading = answer.reading;
  return {
    ...EMPTY,
    interpretation: reading.broad ? "broad" : [...reading.focus].sort().join("+") || [...reading.domains].sort().join("+") || null,
    entity: reading.clarification ? "ask" : (reading.people[0]?.memberId ?? null),
    action: answer.mode,
    safety: { consequential: false, executed: false, refused: false, injectionFlagged: false },
    answer: text,
    providerFailure: answer.validation.rejected.length > 0 && answer.source !== "model" && answer.source !== "model_regenerated" && models.compose ? "unsupported" : null,
  };
}

// --- one case, any surface --------------------------------------------------------

export async function runCase(c: EvalCase, models: Models = {}): Promise<CaseResult> {
  const started = performance.now();
  const observed =
    c.surface === "hometalk" ? await observeHomeTalk(c, models) : c.surface === "homesend" ? await observeHomeSend(c, models) : await observeHomeBrain(c, models);
  // A simulated outage is the point of the case, not a failure of it: what
  // is scored is what the household got despite it.
  const scored = c.surface === "hometalk" && c.simulate ? { ...observed, providerFailure: null } : observed;
  const comparison = compareStages(c.expected, scored, c.category);
  return {
    caseId: c.id,
    surface: c.surface,
    household: c.household,
    category: c.category,
    pass: comparison.pass,
    stages: comparison.stages,
    errors: comparison.errors,
    consequential: c.expected.safety?.consequential ?? observed.safety.consequential,
    latencyMs: Math.round(performance.now() - started),
    tokens: null,
  };
}
