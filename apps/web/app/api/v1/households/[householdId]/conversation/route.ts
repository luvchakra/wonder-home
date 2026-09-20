import { z } from "zod";

import { readHouseholdKey } from "@wonderhome/core/ai/credentials";
import { createAnswerComposer, createClaudeUnderstanding, createGeminiUnderstanding, createOpenAIUnderstanding, type AnswerComposer } from "@wonderhome/core/ai/model-client";
import { platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { minimiseContext, restoreNames, routeToProvider, unpseudonymise, type ContextCandidate, type DataUsePolicy, type Person } from "@wonderhome/core/ai/privacy";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { supabaseIdempotencyStore } from "@wonderhome/core/api/idempotency";
import { defineRoute } from "@wonderhome/core/api/route";
import { consume, may } from "@wonderhome/core/billing/repository";
import { describeLocalNow, forgetHouseholdContext, householdContext } from "@wonderhome/core/conversation/brain";
import { converse, pendingFrom, previewOf, type ConversationTurn, type Understanding } from "@wonderhome/core/conversation/engine";
import { canExecute, executeIntent, notYetDoable, type ExecutionContext } from "@wonderhome/core/conversation/executor";
import type { HouseholdIntent, IntentTarget } from "@wonderhome/core/conversation/intent";
import {
  currentSessionId,
  decideAction,
  listMessages,
  loadAction,
  markActionResult,
  openSession,
  pendingAction,
  recentTurns,
  recordMessage,
  recordProposal,
  remember,
  type ConversationAction,
} from "@wonderhome/core/conversation/repository";
import { composeStatusAnswer } from "@wonderhome/core/conversation/status";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { listEvents } from "@wonderhome/core/family/repository";
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
});

const decideScheme = z.object({
  actionId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
});

const bodySchema = z.union([sayScheme, decideScheme]);

type Params = { params: Promise<{ householdId: string }> };
type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Feature keys a consequential intent needs, beyond the conversation itself. */
const FEATURE_FOR_ACTION: Partial<Record<HouseholdIntent["action"], "finance.bills" | "commerce.orders" | "family.events">> = {
  make_payment: "finance.bills",
  order_items: "commerce.orders",
  plan_event: "family.events",
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
    const [pending, history] = await Promise.all([pendingAction(admin, sessionId), recentTurns(admin, sessionId, 6)]);
    const routing = await decideProviderRouting(supabase, householdId, body.utterance, history, people, membership.household.timezone);

    const memberMessageId = await recordMessage(admin, {
      householdId,
      sessionId,
      role: "member",
      content: body.utterance,
      transcriptConfidence: body.transcriptConfidence,
      metadata: { channel: body.channel },
    });

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
      understand: routing.understand,
      history: routing.history,
    });

    await consume(supabase, householdId, feature).catch(() => undefined);

    const execution: ExecutionContext = {
      supabase,
      householdId,
      actorMemberId: membership.memberId,
      members: people,
      timezone: membership.household.timezone,
    };

    // What the assistant says: the engine's line, unless something real
    // happened this turn — a question answered from the household's own
    // state, or a write that went through (or did not).
    let text = result.text;
    let outcome: { status: "executed" | "failed"; result: Record<string, unknown> } | null = null;
    let brain: { source: "model" | "deterministic" | "none"; factsSent: number } = { source: "none", factsSent: 0 };

    if (result.kind === "reply" && result.intent.action === "ask_status" && result.proposal.kind === "answer") {
      // A question about the home: answered from everything the home holds
      // (the Household Brain), composed by the model where the household's
      // consent lets the facts go; otherwise from the deterministic summary.
      const view = buildPersonalView(membership, ageBandFor(parseDateOfBirth(membership.dateOfBirth)));
      const agenda = await householdAgenda(supabase, householdId, view);
      text = await answerStatus(supabase, householdId, membership, result.intent, agenda);
      const composed = await answerFromBrain({ supabase, householdId, membership, view, agenda, routing, question: body.utterance });
      if (composed) {
        text = composed.text;
        brain = { source: "model", factsSent: composed.factsSent };
      } else {
        brain = { source: "deterministic", factsSent: 0 };
      }
    } else if (
      result.kind === "reply" &&
      result.intent.action === "unknown" &&
      result.proposal.kind === "clarify" &&
      !result.intent.understanding?.failure &&
      typeof result.intent.parameters.clarify !== "string" &&
      routing.answer
    ) {
      // Not a request the engine knows, and not a model outage: before saying
      // "I did not follow that", see whether the home's own facts answer it.
      const view = buildPersonalView(membership, ageBandFor(parseDateOfBirth(membership.dateOfBirth)));
      const agenda = await householdAgenda(supabase, householdId, view);
      const composed = await answerFromBrain({ supabase, householdId, membership, view, agenda, routing, question: body.utterance });
      if (composed?.grounded) {
        text = composed.text;
        brain = { source: "model", factsSent: composed.factsSent };
      }
    } else if (result.kind === "reply" && result.proposal.kind === "executed") {
      if (result.memory) await remember(admin, householdId, result.memory);
      const done = await executeIntent(result.intent, execution);
      text = done.ok ? done.text : `I tried, and it did not go through: ${done.reason}`;
      outcome = done.ok ? { status: "executed", result: done.result } : { status: "failed", result: { reason: done.reason } };
      if (done.ok) forgetHouseholdContext(householdId);
    } else if (result.kind === "reply" && result.memory) {
      await remember(admin, householdId, result.memory);
      forgetHouseholdContext(householdId);
    }

    let action: ConversationAction | null = null;
    const replyId = await recordMessage(admin, {
      householdId,
      sessionId,
      role: "assistant",
      content: text,
      metadata: {
        ...(result.kind === "reply"
          ? { proposal: result.proposal.kind, intent: result.intent.action, understanding: result.intent.understanding?.source ?? null, understandingFailure: result.intent.understanding?.failure ?? null }
          : { kind: result.kind }),
        // Why this turn did or did not reach a model provider (15-005). A
        // code and a count, never the content either way.
        provider: routing.code,
        providerItemsSent: routing.itemsSent + brain.factsSent,
        brain: brain.source,
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
  if (!stored) return { text: "Done — I have your go-ahead.", action: input.action };

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
 * A question answered from the Household Brain (product-direction v4 §5).
 *
 * Every domain this member may see is read into plain facts, each carrying
 * its consent class; the gate keeps only what the household has agreed may
 * leave and replaces names with roles; the model composes an answer from
 * those facts alone; the names go back in here. Null when the household's
 * policy lets nothing go, no provider is configured, or the model did not
 * answer — the caller keeps its deterministic line in every such case.
 */
async function answerFromBrain(input: {
  supabase: Supabase;
  householdId: string;
  membership: HouseholdMembership;
  view: PersonalView;
  agenda: HouseholdAgenda;
  routing: Awaited<ReturnType<typeof decideProviderRouting>>;
  question: string;
}): Promise<{ text: string; grounded: boolean; factsSent: number } | null> {
  if (!input.routing.answer) return null;
  try {
    const context = await householdContext(input.supabase, {
      householdId: input.householdId,
      householdName: input.membership.household.name,
      timezone: input.membership.household.timezone,
      viewer: input.view,
      agenda: {
        needsYou: input.agenda.needsYou,
        handled: input.agenda.handled,
        checked: input.agenda.checked,
        unavailable: input.agenda.domains.filter((domain) => domain.failed).map((domain) => domain.label),
      },
    });
    return await input.routing.answer(input.question, context.facts, input.view.roleLabel);
  } catch (thrown) {
    console.error("[conversation] household brain failed", { error: thrown instanceof Error ? thrown.name : "unknown" });
    return null;
  }
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
    default:
      return { from: startOf(0), to: startOf(1) };
  }
}

async function listPeople(supabase: Supabase, householdId: string): Promise<Person[]> {
  const { data } = await supabase
    .from("household_members")
    .select("id, display_name, member_type")
    .eq("household_id", householdId)
    .eq("status", "active");

  return ((data as { id: string; display_name: string; member_type: Person["memberType"] }[] | null) ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    memberType: row.member_type,
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
  timezone: string,
): Promise<{
  code: string;
  itemsSent: number;
  disclosure: string[];
  understand?: Understanding;
  history?: ConversationTurn[];
  /** Answers a question from the home's facts, through the same gate, with names restored. */
  answer?: (question: string, facts: readonly ContextCandidate[], viewer: string) => Promise<{ text: string; grounded: boolean; factsSent: number } | null>;
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
    return { code: decision.code, itemsSent: 0, disclosure: [decision.reason] };
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

  const answer = answerThroughGate({ compose: provider.compose, policy, people, question: sentUtterance, history: sentHistory, timezone });

  return {
    code: "transmitted",
    itemsSent: minimised.included.length,
    disclosure: [
      `What you said${sentHistory.length > 0 ? `, and the last ${sentHistory.length} turn${sentHistory.length === 1 ? "" : "s"} of this conversation,` : ""} went to ${provider.name} to understand your request. Names were replaced with roles first.`,
    ],
    understand,
    history: sentHistory,
    answer,
  };
}

/**
 * The Household Brain's facts, through the same consent gate as the
 * utterance: only the classes the household agreed to, names replaced on the
 * way out and restored on the way back. The model never sees who anyone is.
 */
function answerThroughGate(input: {
  compose: AnswerComposer;
  policy: DataUsePolicy;
  people: Person[];
  question: string;
  history: ConversationTurn[];
  timezone: string;
}) {
  return async (_question: string, facts: readonly ContextCandidate[], viewer: string) => {
    const minimised = minimiseContext(facts, { policy: { ...input.policy, maxItems: Math.max(input.policy.maxItems, FACT_BUDGET) }, people: input.people });
    if (minimised.included.length === 0) return null;
    const composed = await input.compose({
      question: input.question,
      facts: minimised.included.map((entry) => entry.text),
      history: input.history,
      viewer,
      localNow: describeLocalNow(new Date(), input.timezone),
    });
    if (!composed) return null;
    return { text: restoreNames(composed.text, minimised.pseudonyms, input.people), grounded: composed.grounded, factsSent: minimised.included.length };
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
): Promise<Record<"finance.bills" | "commerce.orders" | "family.events", boolean>> {
  const [bills, orders, events] = await Promise.all([
    may(supabase, householdId, "finance.bills"),
    may(supabase, householdId, "commerce.orders"),
    may(supabase, householdId, "family.events"),
  ]);
  return { "finance.bills": bills.allowed, "commerce.orders": orders.allowed, "family.events": events.allowed };
}

export const dynamic = "force-dynamic";
