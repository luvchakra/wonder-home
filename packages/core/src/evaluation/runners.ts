import { groundIntakeDate, type IntakeExtraction } from "../ai/classify-intake";
import { DEFAULT_DATA_USE } from "../ai/privacy";
import type { AnswerComposer } from "../ai/model-client";
import { asksTheCalendar, calendarSpanReply, lookAheadReply, lookAheadSpan, readLookAhead } from "../calendar/answer";
import type { PendingClarification } from "../conversation/clarify";
import { converse, pendingFrom, type ConversationTurn, type Understanding } from "../conversation/engine";
import { canExecute } from "../conversation/executor";
import { groundIntent } from "../conversation/grounding";
import { localDateTime, pendingWords, roleWords } from "../conversation/moment";
import { isConsequential, type HouseholdIntent, type PendingProposal } from "../conversation/intent";
import { focusFromProposal, readFocus, type FocusEntity } from "../conversation/references";
import { composeRoster } from "../conversation/roster";
import { openScreenReply } from "../conversation/screens";
import { permissionsFor } from "../identity/permissions";
import { resolveCalendarSpan } from "../conversation/temporal";
import { focusFromAnswer } from "../homebrain/focus";
import { answerWithHomeBrain, type HomeBrainAnswer } from "../homebrain/turn";
import { decideConfirmation } from "../homesend/confirmation";
import { detectInstructionInjection } from "../homesend/injection";
import { reconcileAgainstRecords, type HomeSendCandidate } from "../homesend/reconcile";
import { adoptMatchedSubject, resolveIntakePeople } from "../homesend/resolve";
import { buildUnderstanding } from "../homesend/understanding";
import { compareStages } from "./compare";
import { calendarFor, contextItemsFor, GOLDEN_HOUSEHOLDS, groundingEnvFor, heldForAdultsFor, memberNames, memberOf, peopleOf, viewerFor } from "./households";
import type { CaseResult, EvalCase, Expectation, HomeBrainCase, HomeSendCase, HomeTalkCase, Observation } from "./types";

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
  time: null,
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

/** What one turn of a conversation leaves for the next, as the route carries it. */
type Carried = {
  pending: PendingProposal | null;
  clarifying: PendingClarification | null;
  history: ConversationTurn[];
  focus: FocusEntity[];
  /** The last thing the member asked, for HomeBrain's "and Manan?". */
  previousQuestion: string | null;
};

const FRESH: Carried = { pending: null, clarifying: null, history: [], focus: [], previousQuestion: null };

export async function observeHomeTalk(c: HomeTalkCase, models: Models = {}): Promise<Observation> {
  return (await talkTurn(c, c.utterance, FRESH, models)).observed;
}

/** Every turn of a conversation case, in order, each with what the one before it left behind. */
export async function observeConversation(c: HomeTalkCase, models: Models = {}): Promise<Observation[]> {
  const observed: Observation[] = [];
  let carried = FRESH;
  for (const utterance of [c.utterance, ...(c.followUps ?? []).map((turn) => turn.utterance)]) {
    const turn = await talkTurn(c, utterance, carried, models);
    observed.push(turn.observed);
    carried = turn.next;
  }
  return observed;
}

async function talkTurn(c: HomeTalkCase, utterance: string, carried: Carried, models: Models): Promise<{ observed: Observation; next: Carried }> {
  const household = GOLDEN_HOUSEHOLDS[c.household];
  const who = memberOf(household, c.actor);
  const first = carried === FRESH;
  const references = first ? c.references : undefined;
  const result = await converse({
    utterance,
    channel: c.channel ?? "text",
    ...(c.transcriptConfidence !== undefined && first ? { transcriptConfidence: c.transcriptConfidence } : {}),
    actor: { memberId: who.id, roles: who.roles, memberType: who.memberType },
    pending: carried.pending,
    clarifying: carried.clarifying,
    history: carried.history,
    autonomyFor: () => c.autonomy ?? "approve",
    confirmRequestedChanges: c.confirmRequestedChanges === true,
    entitledFor: () => true,
    executable: canExecute,
    sessionId: `eval-${c.id}`,
    now: household.now,
    ground: (intent) =>
      groundIntent(
        intent,
        groundingEnvFor(household, who.id, references, {
          clarification: readFocus(carried.clarifying?.parameters.candidates),
          ...(carried.pending ? { proposal: carried.focus } : {}),
          conversation: carried.focus,
        }),
      ),
    // The moment exactly as the conversation route tells it to a model.
    runtime: {
      role: roleWords(who),
      localDateTime: localDateTime(household.now, household.timezone),
      pending: pendingWords(carried.pending ? { summary: carried.pending.summary } : references?.proposal?.[0] ? { summary: references.proposal[0].label } : null),
      recent: [...new Set([...carried.focus.map((focus) => focus.label), ...[...(references?.conversation ?? []), ...(references?.homesend ?? [])].map((spec) => spec.label)])].slice(0, 5),
    },
    ...(c.simulate && first ? { understand: failingUnderstanding(c.simulate) } : models.understand ? { understand: models.understand } : {}),
  });

  const history: ConversationTurn[] = [...carried.history, { role: "member", text: utterance }];
  if (result.kind !== "reply") {
    // A yes or a no settles what was waiting; nothing is waiting after it.
    return {
      observed: { ...EMPTY, action: result.kind, answer: result.text },
      next: { ...carried, pending: null, clarifying: null, history: [...history, { role: "assistant", text: result.text }] },
    };
  }
  const intent = result.intent;
  const composed = await composedAnswer(c, utterance, result, carried.previousQuestion, models);
  const answer = composed?.text ?? result.text;
  // What this turn was about, exactly as the route persists it for the next turn.
  const at = household.now.toISOString();
  const focus: FocusEntity[] = [
    ...(result.focus ?? []),
    ...(result.record ? focusFromProposal({ actionType: intent.action, parameters: intent.parameters, targetReference: intent.target.reference ?? null, at }) : []),
    ...(composed?.brain ? focusFromAnswer(composed.brain, contextItemsFor(household, c.actor), at) : []),
  ];
  const awaiting = intent.parameters.awaiting;
  const entity =
    result.proposal.kind === "clarify" && awaiting === "member"
      ? "ask"
      : typeof intent.parameters.memberId === "string"
        ? intent.parameters.memberId
        : null;
  const observed: Observation = {
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
    answer,
    confidence: intent.confidence,
    providerFailure: intent.understanding?.failure ?? null,
  };
  const asked = intent.action === "ask_status" || intent.action === "unknown";
  return {
    observed,
    next: {
      // A proposal waiting for a yes is written down and carried, as the route records it;
      // one that already ran, or was refused, waits for nothing.
      pending: result.record && result.proposal.kind === "needs_approval" ? pendingFrom({ id: `eval-${c.id}-${history.length}`, summary: result.text, createdAt: household.now }) : null,
      clarifying: result.clarification ?? null,
      history: [...history, { role: "assistant", text: answer }],
      focus: [...focus, ...carried.focus],
      previousQuestion: asked ? utterance : carried.previousQuestion,
    },
  };
}

/**
 * The answer to a question, composed exactly as the conversation route
 * composes it (`apps/web/app/_lib/hometalk-turn.ts`): who is in the family
 * from the whole member list, a month-sized span from the calendar, anything
 * else from HomeBrain over the facts this member may see — and a request the
 * engine did not know, from HomeBrain when it reads as a question. Null when
 * the route keeps the engine's own words.
 */
async function composedAnswer(
  c: HomeTalkCase,
  utterance: string,
  result: Extract<Awaited<ReturnType<typeof converse>>, { kind: "reply" }>,
  previousQuestion: string | null,
  models: Models,
): Promise<{ text: string; brain?: HomeBrainAnswer } | null> {
  const household = GOLDEN_HOUSEHOLDS[c.household];
  const who = memberOf(household, c.actor);
  const { intent, proposal } = result;
  if (intent.action === "open_screen") {
    // The screen's name and its path, by rules, for what this member is offered.
    const permissions = [...permissionsFor({ roles: who.roles, memberType: who.memberType })];
    const tone = who.memberType === "child" ? "child" : who.memberType === "helper" ? "helper" : "adult";
    return { text: openScreenReply(intent.parameters.screen, { viewer: { permissions, tone }, hasScreen: true }).text };
  }
  if (intent.action === "ask_status" && proposal.kind === "answer") {
    if (intent.parameters.scope === "people") {
      return { text: composeRoster(household.members.filter((m) => m.status === "active"), {
        viewerMemberId: who.id,
        householdName: household.name,
        pets: (household.records.pets ?? []).filter((pet) => pet.active).map((pet) => ({ name: pet.name, species: pet.species })),
      }) };
    }
    const when = intent.parameters.when;
    const span = typeof when === "string" && when.trim() && asksTheCalendar(utterance) ? resolveCalendarSpan(when, { timezone: household.timezone, now: household.now }) : null;
    if (span) {
      const entries = calendarFor(household, who.id, { from: span.from, to: span.to });
      return { text: calendarSpanReply({ span, entries, failedSources: [], timeZone: household.timezone }) };
    }
    // "Why?" is answered from recorded evidence the route reads at the time; not composed here.
    if (typeof intent.parameters.explain === "string") return null;
    const ahead = lookAhead(household, who.id, utterance);
    if (ahead) return { text: ahead };
    const answered = await brainAnswer(c, utterance, previousQuestion, models);
    // With no sentence of its own, the route shows the agenda summary; the facts stand in for it here.
    return { text: answered.text ?? answered.facts.map((fact) => fact.statement).join("\n"), brain: answered };
  }
  if (intent.action === "unknown" && proposal.kind === "clarify" && !intent.understanding?.failure && typeof intent.parameters.clarify !== "string") {
    const ahead = lookAhead(household, who.id, utterance);
    if (ahead) return { text: ahead };
    const answered = await brainAnswer(c, utterance, previousQuestion, models);
    const usable =
      answered.text &&
      (((answered.source === "model" || answered.source === "model_regenerated") && answered.mode === "answer") || answered.reading.followUp || looksLikeQuestion(utterance));
    return usable && answered.text ? { text: answered.text, brain: answered } : null;
  }
  return null;
}

/** "What's next on the calendar?" — the route's look-ahead, over the golden calendar. */
function lookAhead(household: (typeof GOLDEN_HOUSEHOLDS)[HomeTalkCase["household"]], memberId: string, utterance: string): string | null {
  const asked = readLookAhead(utterance);
  if (!asked) return null;
  const span = lookAheadSpan(household.now, household.timezone);
  return lookAheadReply({ lookAhead: asked, entries: calendarFor(household, memberId, span), failedSources: [], now: household.now, timeZone: household.timezone });
}

function brainAnswer(c: { household: HomeTalkCase["household"]; actor: string }, question: string, previousQuestion: string | null, models: Models) {
  const household = GOLDEN_HOUSEHOLDS[c.household];
  const who = memberOf(household, c.actor);
  return answerWithHomeBrain({
    question,
    sentQuestion: question,
    previousQuestion,
    sentHistory: [],
    items: contextItemsFor(household, c.actor),
    viewer: { memberId: who.id, roleLabel: who.memberType === "child" ? "Child" : who.memberType === "helper" ? "Househelper" : "Adult", guardianOf: viewerFor(household, who.id).guardianOf },
    timezone: household.timezone,
    now: household.now,
    policy: DEFAULT_DATA_USE,
    people: peopleOf(household),
    compose: models.compose ?? null,
    factBudget: 12,
    heldForAdults: heldForAdultsFor(household, who.id),
  });
}

/** Whether an utterance is asking something — the route's own test, kept in step with it. */
function looksLikeQuestion(utterance: string): boolean {
  const text = utterance.trim().toLowerCase();
  return text.endsWith("?") || /^(?:what|which|who|whom|whose|when|where|why|how|is|are|am|was|were|do|does|did|can|could|will|would|should|have|has|any|anything)\b/.test(text);
}

// --- HomeSend -----------------------------------------------------------------

export const BLANK_READING: IntakeExtraction = {
  readable: true, kind: "unknown", title: null, notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: null,
  schoolKind: null, subject: null, quantity: null, unit: null, category: null, healthRecordType: null, documentDate: null, dateText: null,
  merchant: null, lines: [], subjectMemberName: null, summary: null, people: [], facts: [], needs: [], change: "new", confidence: "high", secondary: null,
};

const CHANGE_DOMAIN = { bill: "bill", school_item: "school_item", grocery_item: "grocery_item", health_document: "health_document" } as const;

export async function observeHomeSend(c: HomeSendCase, models: Models = {}): Promise<Observation> {
  const household = GOLDEN_HOUSEHOLDS[c.household];
  // A date phrase is resolved against when the content was written, in the household's timezone.
  const reference = { now: c.source.capturedAt ? new Date(c.source.capturedAt) : household.now, timezone: household.timezone };
  // A recorded reading goes through the same grounding a live one does:
  // the model names the date phrase, WonderHome decides the day and time.
  const reading = models.classify ? await models.classify(c.source, reference) : groundIntakeDate({ ...BLANK_READING, ...c.reading }, reference);
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
    kind !== "unknown" && kind !== "receipt" && reading.title
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
    time: reading.dueTime ? `${reading.dueTime}${reading.endTime ? `–${reading.endTime}` : ""}` : null,
    entity: subject.question ? "ask" : (subject.selected?.memberId ?? null),
    match: { outcome: proposal, recordId: reconciliation?.existingId ?? null },
    conflict: proposal === "conflict",
    action: decision.mode,
    safety: {
      // A receipt writes purchase history, so like money and health it is
      // never applied without a person, whatever the household allows.
      consequential: kind === "bill" || kind === "health_document" || kind === "receipt",
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
  const answer = await brainAnswer(c, c.question, c.previousQuestion ?? null, models);
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
  // A conversation is every turn of it: each turn's expectation compared
  // against what that turn produced, and the case passes only if all do.
  const turns: { expected: Expectation; observed: Observation }[] =
    c.surface === "hometalk"
      ? (await observeConversation(c, models)).map((observed, index) => ({ expected: index === 0 ? c.expected : c.followUps![index - 1]!.expected, observed }))
      : [{ expected: c.expected, observed: c.surface === "homesend" ? await observeHomeSend(c, models) : await observeHomeBrain(c, models) }];
  // A simulated outage is the point of the case, not a failure of it: what
  // is scored is what the household got despite it.
  const comparisons = turns.map(({ expected, observed }, index) =>
    compareStages(expected, c.surface === "hometalk" && c.simulate && index === 0 ? { ...observed, providerFailure: null } : observed, c.category),
  );
  return {
    caseId: c.id,
    surface: c.surface,
    household: c.household,
    category: c.category,
    pass: comparisons.every((comparison) => comparison.pass),
    stages: comparisons.flatMap((comparison) => comparison.stages),
    errors: [...new Set(comparisons.flatMap((comparison) => comparison.errors))],
    consequential: turns.some(({ expected, observed }) => expected.safety?.consequential ?? observed.safety.consequential),
    latencyMs: Math.round(performance.now() - started),
    tokens: null,
  };
}
