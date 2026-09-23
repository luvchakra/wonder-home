import { z } from "zod";

import { readHouseholdKey } from "@wonderhome/core/ai/credentials";
import { createAnswerComposer, createClaudeUnderstanding, createGeminiUnderstanding, createOpenAIUnderstanding, type AnswerComposer } from "@wonderhome/core/ai/model-client";
import { platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { minimiseContext, routeToProvider, unpseudonymise, type ContextCandidate, type DataUsePolicy, type Person } from "@wonderhome/core/ai/privacy";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { supabaseIdempotencyStore } from "@wonderhome/core/api/idempotency";
import { defineRoute } from "@wonderhome/core/api/route";
import { consume, may } from "@wonderhome/core/billing/repository";
import { forgetHouseholdContext, householdContext, householdMemory, type HouseholdContext } from "@wonderhome/core/conversation/brain";
import type { PersonLike } from "@wonderhome/core/context/builders";
import { converse, pendingFrom, previewOf, resolveDeterministicIntent, type ConversationTurn, type Understanding } from "@wonderhome/core/conversation/engine";
import { canExecute, executeIntent, notYetDoable, type ExecutionContext } from "@wonderhome/core/conversation/executor";
import type { HouseholdIntent, IntentTarget } from "@wonderhome/core/conversation/intent";
import { attributeMemory } from "@wonderhome/core/conversation/memory";
import {
  beginEditMessage,
  currentSessionId,
  decideAction,
  latestAction,
  listMessages,
  loadAction,
  markActionResult,
  openSession,
  pendingAction,
  pendingClarification,
  recentTurns,
  recordMessage,
  recordProposal,
  remember,
  type ConversationAction,
} from "@wonderhome/core/conversation/repository";
import { composeStatusAnswer } from "@wonderhome/core/conversation/status";
import { summarizeConversation } from "@wonderhome/core/conversation/summary";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { listEvents } from "@wonderhome/core/family/repository";
import { modeFor, type BrainMode } from "@wonderhome/core/homebrain/answer";
import { answerWithHomeBrain, type HomeBrainAnswer } from "@wonderhome/core/homebrain/turn";
import { explain, type WhyTopic } from "@wonderhome/core/homebrain/why";
import type { AutonomyMode } from "@wonderhome/core/household/autonomy";
import { ageBandFor, parseDateOfBirth } from "@wonderhome/core/identity/age";
import { requireMembership } from "@wonderhome/core/identity/households";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { buildPersonalView, type PersonalView } from "@wonderhome/core/identity/views";

import { householdAgenda, type HouseholdAgenda } from "@/app/_lib/agenda";

/**
 * The conversation: one engine for talk and text (module 04), made real
 * (product-direction update §6–§8).
 *
 * POST takes what was said and returns what WonderHome says back, with an
 * action preview when it is prepared to do something. Consent is a separate
 * POST naming the action — or a "yes" that resolves against the last proposal
 * inside its time limit. What may be done now is done now, through the same
 * repositories the forms call and under the member's own RLS; what needs a
 * yes is done once the yes arrives; what WonderHome cannot do yet is said so,
 * in those words, never "it is on its way".
 */
const sayScheme = z.object({
  utterance: z.string().trim().min(1).max(1000),
  channel: z.enum(["text", "voice"]).default("text"),
  transcriptConfidence: z.number().min(0).max(1).optional(),
  /** Editing the household's own last message (story 04-003), rather than a fresh turn. */
  editMessageId: z.uuid().optional(),
});

const decideScheme = z.object({
  actionId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
});

/** Ending a live conversation (item 6): recap what was said and what it led to. */
const summarizeScheme = z.object({
  summarizeSince: z.uuid(),
});

const bodySchema = z.union([sayScheme, decideScheme, summarizeScheme]);

type Params = { params: Promise<{ householdId: string }> };
type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Feature keys a consequential intent needs, beyond the conversation itself. */
const FEATURE_FOR_ACTION: Partial<
  Record<HouseholdIntent["action"], "finance.bills" | "commerce.orders" | "family.events" | "ai.agent_runs" | "health.tracking">
> = {
  make_payment: "finance.bills",
  order_items: "commerce.orders",
  plan_event: "family.events",
  check_agents: "ai.agent_runs",
  record_health_appointment: "health.tracking",
  log_health_issue: "health.tracking",
  resolve_health_issue: "health.tracking",
  log_vital: "health.tracking",
  set_fitness_goal: "health.tracking",
};

/** The target kind each recorded action type implies, for carrying an approved proposal out. */
const TARGET_KIND_FOR_ACTION: Record<string, IntentTarget["kind"]> = {
  record_absence: "member",
  assign_responsibility: "member",
  add_to_list: "list",
  order_items: "list",
  make_payment: "bill",
  plan_event: "event",
  adjust_schedule: "event",
  set_preference: "outcome",
  record_health_appointment: "member",
  log_health_issue: "member",
  resolve_health_issue: "member",
  log_vital: "member",
  set_fitness_goal: "member",
};

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ authenticate: requireUser }, async () => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const sessionId = await currentSessionId(supabase, householdId, membership.memberId);
    if (!sessionId) return { sessionId: null, messages: [] };

    return { sessionId, messages: await listMessages(supabase, householdId, sessionId) };
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({
    input: bodySchema,
    authenticate: requireUser,
    // A turn writes messages, may record a proposal and consumes usage, so a
    // retry that reran it would leave the household with two of each. The
    // composer resends the same key, and the recorded response comes back
    // (story 15-005: retry without duplicating the underlying action).
    idempotency: async () => supabaseIdempotencyStore(await createClient(), householdId),
  }, async ({ body }) => {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const actor = { memberId: membership.memberId, roles: membership.roles, memberType: membership.memberType };
    const admin = createAdminClient();

    if ("actionId" in body) {
      const action = await decideAction(admin, { householdId, actionId: body.actionId, memberId: membership.memberId, decision: body.decision });
      if (!action) throw ApiError.notFound("That proposal is no longer waiting for a decision.");

      const sessionId = await openSession(admin, { householdId, memberId: membership.memberId, channel: "text" });
      const people = await listPeople(supabase, householdId);
      const settled = body.decision === "approved"
        ? await carryOutApproved({ admin, supabase, householdId, membership, action, people })
        : { text: "Understood. I have left that alone.", action };
      const messageId = await recordMessage(admin, { householdId, sessionId, role: "assistant", content: settled.text, metadata: { decidedActionId: action.id } });

      return { reply: { id: messageId, text: settled.text, action: settled.action } };
    }

    if ("summarizeSince" in body) {
      const entitlement = await may(supabase, householdId, "conversation.text");
      if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

      const sessionId = await openSession(admin, { householdId, memberId: membership.memberId, channel: "text" });
      const history = await listMessages(admin, householdId, sessionId, 200);
      const sinceIndex = history.findIndex((message) => message.id === body.summarizeSince);
      if (sinceIndex === -1) throw ApiError.notFound("That conversation could not be found to summarise.");

      const text = summarizeConversation(
        history.slice(sinceIndex).map((message) => ({
          role: message.role,
          text: message.content,
          action: message.action ? { status: message.action.status, preview: message.action.preview } : null,
        })),
      );
      const messageId = await recordMessage(admin, { householdId, sessionId, role: "assistant", content: text, metadata: { kind: "summary" } });

      return { reply: { id: messageId, text, action: null } };
    }

    // Entitlement first, on the server, before anything is read or written.
    const feature = body.channel === "voice" ? "conversation.voice" : "conversation.text";
    const entitlement = await may(supabase, householdId, feature);
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const [entitled, sessionId, autonomyFor, people] = await Promise.all([
      consequentialEntitlements(supabase, householdId),
      openSession(admin, { householdId, memberId: membership.memberId, channel: body.channel }),
      autonomyLookup(supabase, householdId),
      listPeople(supabase, householdId),
    ]);

    // An edit removes the old message and whatever came of it before
    // anything downstream reads the session, so the regenerated reply is
    // the only one and the model never sees the question it is replacing.
    if (body.editMessageId) {
      await beginEditMessage(admin, { householdId, sessionId, messageId: body.editMessageId });
    }

    // The question asked last turn, if there was one: this turn is read as
    // its answer before anything else, which is what stops the same
    // question coming back however clearly it is answered (story 04-011).
    const [pending, history, clarifying] = await Promise.all([
      pendingAction(admin, sessionId),
      recentTurns(admin, sessionId, 6),
      pendingClarification(admin, sessionId),
    ]);
    const routing = await decideProviderRouting(supabase, householdId, body.utterance, history, people);
    const startedAt = Date.now();

    // Recording what was said and metering it need nothing from the answer,
    // so they run alongside it rather than ahead of it.
    const memberMessageWrite = recordMessage(admin, {
      householdId,
      sessionId,
      role: "member",
      content: body.utterance,
      transcriptConfidence: body.transcriptConfidence,
      metadata: { channel: body.channel },
    });
    const metering = consume(supabase, householdId, feature).catch(() => undefined);

    // A plain question about the home, or a hello, is read by the rules with
    // certainty; asking a model to confirm it is a round trip that changes
    // nothing downstream, because the answer comes from the HomeBrain
    // either way. Everything else still goes to the model to be understood.
    const quick = resolveDeterministicIntent(body.utterance, { actorMemberId: membership.memberId, channel: body.channel });
    const plainQuestion = (quick.action === "ask_status" || quick.action === "greet") && quick.confidence >= 0.8;

    // The HomeBrain reads the home while the request is being
    // understood — the two need nothing from each other, and together they
    // are most of a turn.
    const view = buildPersonalView(membership, ageBandFor(parseDateOfBirth(membership.dateOfBirth)));
    // Any question may be answered from the facts, with or without a model
    // (a deterministic answer needs them too), so the read starts whenever
    // the turn might be one.
    const readBrain = () =>
      householdMemory(householdId, `agenda:${membership.memberId}`, () => householdAgenda(supabase, householdId, view)).then(async (agenda) => ({
        agenda,
        context: await householdContext(supabase, {
          householdId,
          householdName: membership.household.name,
          timezone: membership.household.timezone,
          viewer: view,
          agenda: { needsYou: agenda.needsYou, handled: agenda.handled, checked: agenda.checked, unavailable: agenda.domains.filter((domain) => domain.failed).map((domain) => domain.label) },
        }),
      }));
    const mayBeQuestion = routing.compose !== undefined || quick.action === "ask_status" || quick.action === "unknown";
    const brainRead = mayBeQuestion ? readBrain() : null;
    brainRead?.catch(() => undefined);

    const result = await converse({
      utterance: body.utterance,
      channel: body.channel,
      transcriptConfidence: body.transcriptConfidence,
      actor,
      pending: pending ? pendingFrom(pending) : null,
      autonomyFor,
      entitledFor: (intent) => {
        const needed = FEATURE_FOR_ACTION[intent.action];
        return needed ? entitled[needed] : true;
      },
      executable: canExecute,
      sessionId,
      understand: plainQuestion ? undefined : routing.understand,
      history: routing.history,
      clarifying,
    });
    const understoodAt = Date.now();

    const execution: ExecutionContext = {
      supabase,
      householdId,
      actorMemberId: membership.memberId,
      members: people,
      timezone: membership.household.timezone,
      actor: { memberId: membership.memberId, roles: membership.roles, memberType: membership.memberType },
    };

    // What the assistant says: the engine's line, unless something real
    // happened this turn — a question answered from the household's own
    // state, or a write that went through (or did not).
    let text = result.text;
    let outcome: { status: "executed" | "failed"; result: Record<string, unknown> } | null = null;
    let brain: { source: HomeBrainAnswer["source"] | "evidence"; factsSent: number } = { source: "none", factsSent: 0 };

    let composedAt = understoodAt;

    // What this turn is (Wave 2 §11): answer, clarify, prepare, approval, or
    // done — and "done" only once an executor has confirmed the change.
    let brainAnswer: HomeBrainAnswer | null = null;
    let explained = false;
    const previousQuestion = [...history].reverse().find((turn) => turn.role === "member")?.text ?? null;
    const lastAssistantText = [...history].reverse().find((turn) => turn.role === "assistant")?.text ?? null;

    if (result.kind === "reply" && result.intent.action === "ask_status" && result.proposal.kind === "answer" && typeof result.intent.parameters.explain === "string") {
      // "Why?", "where did this come from?", "what did I just send?" — from
      // the recorded evidence, assembled here; never a model (§10).
      const [read, recorded] = await Promise.all([(brainRead ?? readBrain()).catch(() => null), latestAction(admin, sessionId)]);
      composedAt = Date.now();
      text = explain({
        topic: result.intent.parameters.explain as WhyTopic,
        subject: typeof result.intent.parameters.subject === "string" ? result.intent.parameters.subject : null,
        items: read?.context.snapshot.items ?? [],
        viewerMemberId: membership.memberId,
        timezone: membership.household.timezone,
        now: new Date(),
        lastAssistantText,
        lastAction: recorded,
        clarifying: clarifying ? { question: clarifying.question, utterance: clarifying.utterance, action: clarifying.action } : null,
      }).text;
      explained = true;
      brain = { source: "evidence", factsSent: 0 };
    } else if (result.kind === "reply" && result.intent.action === "ask_status" && result.proposal.kind === "answer") {
      // A question about the home: HomeBrain answers from the facts this
      // member may see — composed by the model where the household's
      // consent lets them go, validated before anyone reads it, otherwise
      // from the facts themselves. The agenda summary stays the answer to
      // "what's going on?", where nothing narrower applies.
      const agenda = brainRead ? (await brainRead.catch(() => null))?.agenda ?? (await householdAgenda(supabase, householdId, view)) : await householdAgenda(supabase, householdId, view);
      const [fallback, answered] = await Promise.all([
        answerStatus(supabase, householdId, membership, result.intent, agenda),
        askHomeBrain({ routing, question: body.utterance, previousQuestion, people, view, membership, read: brainRead }),
      ]);
      composedAt = Date.now();
      brainAnswer = answered;
      text = answered?.text ?? fallback;
      brain = answered?.text ? { source: answered.source, factsSent: answered.factsSent } : { source: "deterministic", factsSent: answered?.factsSent ?? 0 };
    } else if (
      result.kind === "reply" &&
      result.intent.action === "unknown" &&
      result.proposal.kind === "clarify" &&
      !result.intent.understanding?.failure &&
      typeof result.intent.parameters.clarify !== "string"
    ) {
      // Not a request the engine knows, and not a model outage: before saying
      // "I did not follow that", see whether the home's own facts answer it.
      const answered = await askHomeBrain({ routing, question: body.utterance, previousQuestion, people, view, membership, read: brainRead });
      composedAt = Date.now();
      const usable =
        answered?.text &&
        ((answered.source === "model" || answered.source === "model_regenerated") && answered.mode === "answer" ||
          answered.reading.followUp ||
          looksLikeQuestion(body.utterance));
      if (answered && usable) {
        brainAnswer = answered;
        text = answered.text!;
        brain = { source: answered.source, factsSent: answered.factsSent };
      } else if (answered) {
        brain = { source: "none", factsSent: answered.factsSent };
      }
    } else if (result.kind === "reply" && result.proposal.kind === "executed") {
      if (result.memory) await remember(admin, householdId, attributeMemory(result.memory, people), { memberId: membership.memberId, displayName: membership.displayName });
      const done = await executeIntent(result.intent, execution);
      text = done.ok ? done.text : `I tried, and it did not go through: ${done.reason}`;
      outcome = done.ok ? { status: "executed", result: done.result } : { status: "failed", result: { reason: done.reason } };
      if (done.ok) forgetHouseholdContext(householdId);
    } else if (result.kind === "reply" && result.memory) {
      await remember(admin, householdId, attributeMemory(result.memory, people), { memberId: membership.memberId, displayName: membership.displayName });
      forgetHouseholdContext(householdId);
    }

    const memberMessageId = await memberMessageWrite;
    await metering;

    // The question left open for the next turn: the engine's own, unless
    // HomeBrain answered instead; and one asked earlier stays open while the
    // member asks why it was asked.
    const openQuestion =
      result.kind !== "reply" ? null : explained ? (result.intent.parameters.explain === "why_question" ? clarifying : null) : brainAnswer ? null : (result.clarification ?? null);
    let mode: BrainMode =
      result.kind === "confirm_transcript"
        ? "clarify"
        : result.kind !== "reply"
          ? "answer"
          : brainAnswer
            ? (brainAnswer.mode === "clarify" ? "clarify" : "answer")
            : modeFor(result.proposal.kind, outcome ? outcome.status === "executed" : null);

    let action: ConversationAction | null = null;
    const replyId = await recordMessage(admin, {
      householdId,
      sessionId,
      role: "assistant",
      content: text,
      metadata: {
        ...(result.kind === "reply"
          ? {
              proposal: result.proposal.kind,
              intent: result.intent.action,
              understanding: result.intent.understanding?.source ?? null,
              understandingFailure: result.intent.understanding?.failure ?? null,
              // What this turn asked, for the next one to answer. Absent
              // whenever the turn did not ask anything, which is what
              // closes the question rather than leaving it open forever.
              ...(openQuestion ? { clarify: openQuestion } : {}),
              mode,
            }
          : { kind: result.kind }),
        // Why this turn did or did not reach a model provider (15-005). A
        // code and a count, never the content either way.
        provider: routing.code,
        providerItemsSent: routing.itemsSent + brain.factsSent,
        brain: brain.source,
        // What HomeBrain's validation refused, if anything (Wave 2 §7): codes
        // and a count of drafts, never the draft itself.
        ...(brainAnswer && brainAnswer.validation.attempts > 0 ? { brainValidation: brainAnswer.validation } : {}),
        // Where the time went, in milliseconds: understanding (the first
        // model call, or none), composing (the brain read plus the second
        // call), and the whole turn so far. Numbers only.
        timings: { understand: understoodAt - startedAt, compose: composedAt - understoodAt, total: Date.now() - startedAt, quick: plainQuestion },
      },
    });

    if (result.kind === "approve" || result.kind === "reject") {
      action = await decideAction(admin, {
        householdId,
        actionId: result.actionId,
        memberId: membership.memberId,
        decision: result.kind === "approve" ? "approved" : "rejected",
      });
      if (result.kind === "approve" && action) {
        const settled = await carryOutApproved({ admin, supabase, householdId, membership, action, people });
        text = settled.text;
        action = settled.action;
        mode = modeFor("approve", action.status === "executed");
        await admin.from("conversation_messages").update({ content: text }).eq("id", replyId);
      }
    } else if (result.kind === "reply" && result.record) {
      action = await recordProposal(admin, { householdId, sessionId, messageId: replyId, intent: result.intent, proposal: result.proposal });
      if (outcome) {
        await markActionResult(admin, { actionId: action.id, ...outcome });
        action = { ...action, status: outcome.status };
      }
    }

    return {
      sessionId,
      memberMessageId,
      reply: {
        id: replyId,
        text,
        action,
        preview: result.kind === "reply" ? previewOf(result.proposal) : null,
        proposal: result.kind === "reply" ? result.proposal.kind : result.kind,
        mode,
      },
      /** What, if anything, left this household this turn (15-005). */
      privacy: {
        provider: routing.code,
        disclosure: brain.factsSent > 0 ? [...routing.disclosure, `${brain.factsSent} facts about the home went with it, to answer from what WonderHome knows. Names were replaced with roles first.`] : routing.disclosure,
      },
    };
  })(request);
}

/**
 * An approved proposal is carried out now, through the same governed write
 * the turn would have used — and if there is no such write yet, the person
 * is told exactly that. "It is on its way" was the one sentence this route
 * must never say about something that did not move.
 */
async function carryOutApproved(input: {
  admin: ReturnType<typeof createAdminClient>;
  supabase: Supabase;
  householdId: string;
  membership: HouseholdMembership;
  action: ConversationAction;
  people: Person[];
}): Promise<{ text: string; action: ConversationAction }> {
  const stored = await loadAction(input.admin, { householdId: input.householdId, actionId: input.action.id });
  if (!stored) return { text: "I have your go-ahead, but I could not find what it was for, so nothing was changed.", action: input.action };

  const intent: HouseholdIntent = {
    action: stored.actionType as HouseholdIntent["action"],
    actorMemberId: input.membership.memberId,
    target: { kind: TARGET_KIND_FOR_ACTION[stored.actionType] ?? "unspecified", ...(stored.outcomeKey ? { reference: stored.outcomeKey } : {}) },
    parameters: stored.parameters,
    confidence: 1,
    channel: "text",
    utterance: input.action.preview?.summary ?? stored.actionType,
  };

  if (!canExecute(intent)) {
    return { text: notYetDoable(intent.action), action: input.action };
  }

  const done = await executeIntent(intent, {
    supabase: input.supabase,
    householdId: input.householdId,
    actorMemberId: input.membership.memberId,
    members: input.people,
    timezone: input.membership.household.timezone,
  });
  const status = done.ok ? "executed" : "failed";
  await markActionResult(input.admin, { actionId: input.action.id, status, result: done.ok ? done.result : { reason: done.reason } });
  if (done.ok) forgetHouseholdContext(input.householdId);

  return {
    text: done.ok ? done.text : `I have your go-ahead, and it did not go through: ${done.reason}`,
    action: { ...input.action, status },
  };
}

/**
 * "What's going on?" answered from the household's own state — the same
 * domain engines the Home screen reads, composed on this server. Nothing
 * about the household leaves to produce it.
 */
async function answerStatus(supabase: Supabase, householdId: string, membership: HouseholdMembership, intent: HouseholdIntent, agenda: HouseholdAgenda): Promise<string> {
  const when = typeof intent.parameters.when === "string" ? intent.parameters.when : null;
  const now = new Date();

  const events = when ? await listEvents(supabase, householdId, windowFor(when, now)).catch(() => []) : null;

  const placeOf = (need: { subjectKey: string }) => {
    const domain = agenda.domains.find((entry) => entry.needs.some((candidate) => candidate.subjectKey === need.subjectKey));
    return domain ? { label: domain.label, href: domain.href } : undefined;
  };

  return composeStatusAnswer({
    needsYou: agenda.needsYou.map((need) => ({ ...need, place: placeOf(need) })),
    handled: agenda.handled,
    checked: agenda.checked,
    unavailable: agenda.domains.filter((domain) => domain.failed).map((domain) => domain.label),
    events: events?.map((event) => ({ title: event.title, startsAt: event.startsAt, cancelled: event.status === "cancelled" })),
    when,
    timezone: membership.household.timezone,
  });
}

/**
 * A question answered by HomeBrain (product-direction v4 §5, Wave 1, Wave 2).
 *
 * The context engine read every domain this member may see; HomeBrain reads
 * the question, grounds it in the facts it needs, sends only what the
 * household's consent lets go (names replaced with roles), validates what
 * comes back, and otherwise answers from the facts themselves. Null only if
 * the read itself failed — the caller keeps its own line then.
 */
async function askHomeBrain(input: {
  routing: Awaited<ReturnType<typeof decideProviderRouting>>;
  question: string;
  previousQuestion: string | null;
  people: Person[];
  view: PersonalView;
  membership: HouseholdMembership;
  /** The read that started while the request was being understood. */
  read: Promise<{ agenda: HouseholdAgenda; context: HouseholdContext }> | null;
}): Promise<HomeBrainAnswer | null> {
  if (!input.read) return null;
  try {
    const { context } = await input.read;
    return await answerWithHomeBrain({
      question: input.question,
      sentQuestion: input.routing.sentUtterance ?? input.question,
      previousQuestion: input.previousQuestion,
      sentHistory: input.routing.history ?? [],
      items: context.snapshot.items,
      viewer: { memberId: input.membership.memberId, roleLabel: input.view.roleLabel },
      timezone: input.membership.household.timezone,
      now: new Date(),
      policy: input.routing.policy,
      people: input.people,
      compose: input.routing.compose ?? null,
      factBudget: FACT_BUDGET,
    });
  } catch (thrown) {
    console.error("[conversation] HomeBrain failed", { error: thrown instanceof Error ? thrown.name : "unknown" });
    return null;
  }
}

/** Whether an utterance is asking something, rather than telling or requesting. */
function looksLikeQuestion(utterance: string): boolean {
  const text = utterance.trim().toLowerCase();
  return text.endsWith("?") || /^(?:what|which|who|whom|whose|when|where|why|how|is|are|am|was|were|do|does|did|can|could|will|would|should|have|has|any|anything)\b/.test(text);
}

function windowFor(when: string, now: Date): { from: Date; to: Date } {
  const day = 86_400_000;
  const startOf = (offsetDays: number) => {
    const date = new Date(now.getTime() + offsetDays * day);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  switch (when.toLowerCase()) {
    case "tomorrow":
      return { from: startOf(1), to: startOf(2) };
    case "this week":
    case "next week":
      return { from: startOf(when.toLowerCase() === "next week" ? 7 : 0), to: startOf(when.toLowerCase() === "next week" ? 14 : 7) };
    case "this weekend":
      return { from: startOf(0), to: startOf(7) };
    case "this month":
    case "next month": {
      const base = when.toLowerCase() === "next month" ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
      const from = new Date(base);
      from.setHours(0, 0, 0, 0);
      const to = new Date(base.getFullYear(), base.getMonth() + 1, 1);
      to.setHours(0, 0, 0, 0);
      return { from, to };
    }
    default:
      return { from: startOf(0), to: startOf(1) };
  }
}

/**
 * Everyone active in the household: who they are for the consent gate's
 * placeholders, and the words the family uses for them (nickname,
 * "Dad", date of birth for "the older one") for the context engine's resolver.
 */
async function listPeople(supabase: Supabase, householdId: string): Promise<(Person & PersonLike)[]> {
  const { data } = await supabase
    .from("household_members")
    .select("id, display_name, member_type, nickname, relationship, date_of_birth, occupation")
    .eq("household_id", householdId)
    .eq("status", "active");

  type Row = {
    id: string;
    display_name: string;
    member_type: Person["memberType"];
    nickname: string | null;
    relationship: string | null;
    date_of_birth: string | null;
    occupation: string | null;
  };
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    memberType: row.member_type,
    nickname: row.nickname,
    relationship: row.relationship,
    dateOfBirth: row.date_of_birth,
    occupation: row.occupation,
  }));
}

/**
 * Whether this turn may reach a model provider, and with how little (15-005,
 * and the product-direction update's "Priority A: make the brain real").
 *
 * The gate runs on every turn, before anything is understood, exactly as it
 * did while no provider was configured: building the consent check first and
 * the provider call behind it second is the order that keeps the promise.
 *
 * What goes: what the person said, and up to a few earlier turns of the same
 * conversation so that "actually make it 7" can be understood — each a
 * candidate that has to pass the household's data-use policy, with names
 * replaced by placeholders on the way out. What comes back is mapped back
 * here: a model that answers about "child a" is answering about a
 * placeholder, and only this server knows who that is.
 *
 * What is recorded is a code and a count, never the utterance's content.
 */
async function decideProviderRouting(
  supabase: Supabase,
  householdId: string,
  utterance: string,
  history: readonly ConversationTurn[],
  people: Person[],
): Promise<{
  code: string;
  itemsSent: number;
  disclosure: string[];
  understand?: Understanding;
  history?: ConversationTurn[];
  /** The household's data-use policy — the gate HomeBrain's facts pass through. */
  policy: DataUsePolicy;
  /** What was said, as it may leave the household (pseudonymised), when it may. */
  sentUtterance?: string;
  /** Drafts an answer from grounded facts. Absent when nothing may be sent or no provider is wired. */
  compose?: AnswerComposer;
}> {
  const [policy, householdKey] = await Promise.all([
    loadDataUse(supabase, householdId),
    readHouseholdKey(householdId).catch(() => null),
  ]);

  const key = resolveModelKey(householdKey, platformKey());

  const candidates: ContextCandidate[] = [
    { id: "utterance", contentClass: "general", need: "what was asked", text: utterance, relevant: true },
    ...history.map((turn, index) => ({
      id: `history-${index}`,
      contentClass: "general" as const,
      need: "what was said just before",
      text: turn.text,
      relevant: true,
    })),
  ];

  const minimised = minimiseContext(candidates, { policy, people });
  const decision = routeToProvider({
    provider: key.provider,
    keySource: key.source,
    policy,
    hasContent: minimised.included.some((entry) => entry.id === "utterance"),
  });

  if (!decision.ok) {
    return { code: decision.code, itemsSent: 0, disclosure: [decision.reason], policy };
  }

  const sentUtterance = minimised.included.find((entry) => entry.id === "utterance")?.text ?? utterance;
  const sentHistory: ConversationTurn[] = history
    .map((turn, index) => ({ turn, sent: minimised.included.find((entry) => entry.id === `history-${index}`) }))
    .filter((entry): entry is { turn: ConversationTurn; sent: { id: string; contentClass: "general"; text: string } } => Boolean(entry.sent))
    .map((entry) => ({ role: entry.turn.role, text: entry.sent.text }));

  const provider =
    decision.provider === "anthropic" && key.key
      ? { name: "Anthropic Claude", understand: createClaudeUnderstanding(key.key), compose: createAnswerComposer("anthropic", key.key) }
      : decision.provider === "google" && key.key
        ? { name: "Google Gemini", understand: createGeminiUnderstanding(key.key), compose: createAnswerComposer("google", key.key) }
        : decision.provider === "openai" && key.key
          ? { name: "OpenAI", understand: createOpenAIUnderstanding(key.key), compose: createAnswerComposer("openai", key.key) }
          : null;

  if (!provider) {
    return {
      code: "not_transmitted_no_client",
      itemsSent: 0,
      disclosure: [`No ${decision.provider} client is wired up yet. Nothing about your home was sent, and the assistant answered from its own rules.`],
      policy,
    };
  }

  // The model sees the pseudonymised text and answers about placeholders;
  // what it answers is mapped back to the household here, on this server.
  const understand: Understanding = async (_utterance, context) => {
    const intent = await provider.understand(sentUtterance, { ...context, history: sentHistory });
    if (intent.target.kind === "member" && intent.target.reference) {
      const mapped = unpseudonymise(intent.target.reference, minimised.pseudonyms, people);
      return {
        ...intent,
        target: { kind: "member", reference: mapped.reference },
        parameters: mapped.memberId ? { ...intent.parameters, memberId: mapped.memberId } : intent.parameters,
      };
    }
    return intent;
  };


  return {
    code: "transmitted",
    itemsSent: minimised.included.length,
    disclosure: [
      `What you said${sentHistory.length > 0 ? `, and the last ${sentHistory.length} turn${sentHistory.length === 1 ? "" : "s"} of this conversation,` : ""} went to ${provider.name} to understand your request. Names were replaced with roles first.`,
    ],
    understand,
    history: sentHistory,
    policy,
    sentUtterance,
    compose: provider.compose,
  };
}

/**
 * How many facts may go in one answer. The policy's own `maxItems` was set
 * for a single utterance and a few turns of history; a whole home is more
 * lines than that, and the classes — not the count — are what the household
 * consented to.
 */
const FACT_BUDGET = 80;

/** Autonomy per outcome, from the responsibilities matrix; "approve" if unset. */
async function autonomyLookup(supabase: Supabase, householdId: string) {
  const { data } = await supabase.from("responsibilities").select("outcome_key, ai_mode").eq("household_id", householdId);
  const modes = new Map<string, AutonomyMode>(((data as { outcome_key: string; ai_mode: AutonomyMode }[] | null) ?? []).map((row) => [row.outcome_key, row.ai_mode]));
  return (outcomeKey: string | null): AutonomyMode => (outcomeKey && modes.get(outcomeKey)) || "approve";
}

/**
 * The engine is synchronous, so the three features a consequential intent can
 * need are checked before the turn rather than inside it. Kept explicit rather
 * than generic: these are the only actions whose entitlement differs from the
 * conversation's own.
 */
async function consequentialEntitlements(
  supabase: Supabase,
  householdId: string,
): Promise<Record<"finance.bills" | "commerce.orders" | "family.events" | "ai.agent_runs" | "health.tracking", boolean>> {
  const [bills, orders, events, agentRuns, health] = await Promise.all([
    may(supabase, householdId, "finance.bills"),
    may(supabase, householdId, "commerce.orders"),
    may(supabase, householdId, "family.events"),
    may(supabase, householdId, "ai.agent_runs"),
    may(supabase, householdId, "health.tracking"),
  ]);
  return {
    "finance.bills": bills.allowed,
    "commerce.orders": orders.allowed,
    "family.events": events.allowed,
    "ai.agent_runs": agentRuns.allowed,
    "health.tracking": health.allowed,
  };
}

export const dynamic = "force-dynamic";
