import { z } from "zod";

import { readHouseholdKey } from "@wonderhome/core/ai/credentials";
import { createAnswerComposer, createClaudeUnderstanding, createGeminiUnderstanding, createOpenAIUnderstanding, type AnswerComposer } from "@wonderhome/core/ai/model-client";
import { platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { minimiseContext, routeToProvider, unpseudonymise, type ContextCandidate, type DataUsePolicy, type Person } from "@wonderhome/core/ai/privacy";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { ApiError } from "@wonderhome/core/api/errors";
import { consume, may } from "@wonderhome/core/billing/repository";
import { forgetHouseholdContext, householdContext, householdMemory, type HouseholdContext } from "@wonderhome/core/conversation/brain";
import { personItems, type PersonLike } from "@wonderhome/core/context/builders";
import { converse, pendingFrom, previewOf, PROPOSAL_TTL_MINUTES, resolveDeterministicIntent, type ConversationTurn, type RuntimeContext, type Understanding } from "@wonderhome/core/conversation/engine";
import { canExecute, executeIntent, notYetDoable, zonedTimeToUtcIso, type ExecutionContext } from "@wonderhome/core/conversation/executor";
import { approvalRefusal } from "@wonderhome/core/conversation/approval";
import { applyCorrection, describeCorrection, readCorrection, TARGET_KIND_FOR_ACTION, type CorrectableAction } from "@wonderhome/core/conversation/corrections";
import { heldBecause, leansOnEarlier, partialSummary, splitRequest, type PartOutcome } from "@wonderhome/core/conversation/decompose";
import { confidenceLead, groundIntent, type GroundingEnv, type SchoolItemRef } from "@wonderhome/core/conversation/grounding";
import { classifyShortReply, type HouseholdIntent } from "@wonderhome/core/conversation/intent";
import { attributeMemory } from "@wonderhome/core/conversation/memory";
import { localDateTime, pendingWords, roleWords } from "@wonderhome/core/conversation/moment";
import {
  beginEditMessage,
  decideAction,
  latestAction,
  listMessages,
  loadAction,
  markActionResult,
  openProposals,
  openSession,
  surfaceForChannel,
  pendingAction,
  pendingClarification,
  recentExecutedActions,
  recentFocus,
  recentTurns,
  recordMessage,
  recordProposal,
  remember,
  unchangedResult,
  type ConversationAction,
} from "@wonderhome/core/conversation/repository";
import { focusFromProposal, focusFromResult, homeSendFocus, NO_REFERENCES, readFocus, type FocusEntity, type ReferenceState } from "@wonderhome/core/conversation/references";
import { composeStatusAnswer } from "@wonderhome/core/conversation/status";
import { addDays, resolveTemporal } from "@wonderhome/core/conversation/temporal";
import { summarizeConversation } from "@wonderhome/core/conversation/summary";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { hometalkCorrectionEvidence, recordCorrectionEvidence } from "@wonderhome/core/evaluation/evidence";
import { log } from "@wonderhome/core/observability/logger";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";
import { createClient } from "@wonderhome/core/db/server";
import { listEvents } from "@wonderhome/core/family/repository";
import { listHomeSendItems } from "@wonderhome/core/homesend/repository";
import { ingredientNames, listRecipeNames } from "@wonderhome/core/meals/repository";
import { listAssets } from "@wonderhome/core/home/repository";
import { listSchoolItems } from "@wonderhome/core/school/repository";
import { modeFor, type BrainMode } from "@wonderhome/core/homebrain/answer";
import { answerWithHomeBrain, type HomeBrainAnswer } from "@wonderhome/core/homebrain/turn";
import { explain, type WhyTopic } from "@wonderhome/core/homebrain/why";
import type { AutonomyMode } from "@wonderhome/core/household/autonomy";
import { ageBandFor, parseDateOfBirth } from "@wonderhome/core/identity/age";
import { requireMembership } from "@wonderhome/core/identity/households";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { buildPersonalView, type PersonalView } from "@wonderhome/core/identity/views";

import { agendaAllows, narrowToChannel, VOICE_NOT_ALLOWED, voiceAllowsAction, type ChannelLimits } from "@wonderhome/core/voicelink/scopes";

import { householdAgenda, narrowAgenda, type HouseholdAgenda } from "@/app/_lib/agenda";

/**
 * HomeTalk's turn: one engine for talk and text (module 04), made real
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
  /** The fingerprint of the proposal the person was shown (Wave 5 §20). */
  fingerprint: z.string().regex(/^fp-[0-9a-f]{16}$/).optional(),
});

/** Ending a live conversation (item 6): recap what was said and what it led to. */
const summarizeScheme = z.object({
  summarizeSince: z.uuid(),
});

export const bodySchema = z.union([sayScheme, decideScheme, summarizeScheme]);

export type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Feature keys a consequential intent needs, beyond the conversation itself. */
const FEATURE_FOR_ACTION: Partial<
  Record<HouseholdIntent["action"], "finance.bills" | "commerce.orders" | "family.events" | "ai.agent_runs" | "health.tracking" | "meals.planning" | "school.connector" | "home.maintenance">
> = {
  make_payment: "finance.bills",
  order_items: "commerce.orders",
  plan_event: "family.events",
  plan_meal: "meals.planning",
  complete_school_item: "school.connector",
  raise_service_request: "home.maintenance",
  check_agents: "ai.agent_runs",
  record_health_appointment: "health.tracking",
  log_health_issue: "health.tracking",
  resolve_health_issue: "health.tracking",
  log_vital: "health.tracking",
  set_fitness_goal: "health.tracking",
};

export type HomeTalkBody = z.infer<typeof bodySchema>;

/**
 * One HomeTalk turn — the canonical gateway (voice integration phase 1).
 *
 * Every channel lands here: the web and PWA composer through the route
 * below, and an external voice adapter (Gemini Voice, Alexa) through
 * `hometalk/gateway.ts` once it has resolved a linked identity into a
 * member session. `supabase` is always that member's own session, so RLS,
 * permissions, entitlements and autonomy are decided exactly as they are
 * for the web — no channel has a path of its own around them.
 */
export async function homeTalkTurn(input: {
  supabase: Supabase;
  householdId: string;
  body: HomeTalkBody;
  /**
   * A linked voice assistant's scopes (voice phase 2). They only narrow:
   * an action outside them is refused before it is asked about, approved or
   * carried out, and facts from domains outside them never reach an answer.
   * `classes`, when set, narrows the facts again to the content classes the
   * household agreed may reach a model provider — for a channel whose
   * provider hears every answer (Gemini Voice, voice phase 3). Absent for
   * the household's own app.
   */
  limits?: ChannelLimits;
  /** The channel this turn came through, for the audit trail: "web" unless a gateway channel says otherwise. */
  source?: string;
  /**
   * The utterance was built by WonderHome from a voice tool's structured
   * arguments (Gemini Voice), worded for these rules: a confident reading by
   * the rules is used as it is, without a model re-reading WonderHome's own
   * sentence. Anything the rules do not read confidently still goes to the
   * model. Every gate downstream runs the same either way.
   */
  rulesFirst?: boolean;
}) {
  const { supabase, householdId, body, limits } = input;
  const source = input.source ?? "web";
  const membership = await requireMembership(supabase, householdId);
  const actor = { memberId: membership.memberId, roles: membership.roles, memberType: membership.memberType };
  const admin = createAdminClient();
  const channelLimits = limits ? { allows: (intent: HouseholdIntent) => voiceAllowsAction(intent.action, limits.scopes), refusal: VOICE_NOT_ALLOWED } : null;
  // A "yes" over a voice link settles only what the link may do: a payment
  // proposed in the app is approved in the app.
  const blockedOnChannel = async (actionId: string): Promise<boolean> => {
    if (!limits) return false;
    const stored = await loadAction(admin, { householdId, actionId }).catch(() => null);
    return !stored || !voiceAllowsAction(stored.actionType as HouseholdIntent["action"], limits.scopes);
  };

  if ("actionId" in body) {
    const action = await decideAction(admin, { householdId, actionId: body.actionId, memberId: membership.memberId, decision: body.decision, seen: body.fingerprint ?? null });
    if (!action) throw ApiError.notFound("That proposal is no longer waiting for a decision.");

    const sessionId = await openSession(admin, { householdId, memberId: membership.memberId, channel: "text" });
    const people = await listPeople(supabase, householdId);
    const settled = action.refused
      ? { text: approvalRefusal(action.refused), action }
      : body.decision === "approved"
        ? await carryOutApproved({ admin, supabase, householdId, membership, action, people, source, modality: "text" })
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
  // Faster than anyone talks, slower than a script (Wave 5 §15). Counted
  // per member, before anything is read, written or sent anywhere.
  if (!(await hitRateLimit(admin, "hometalk.turn", membership.memberId))) throw new ApiError("rate_limited", rateLimitMessage("hometalk.turn"));

  const [entitled, sessionId, autonomyFor, people] = await Promise.all([
    consequentialEntitlements(supabase, householdId),
    openSession(admin, { householdId, memberId: membership.memberId, channel: body.channel, surface: surfaceForChannel(source) }),
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
  const [pending, history, clarifying, lastFocus] = await Promise.all([
    pendingAction(admin, sessionId),
    recentTurns(admin, sessionId, 6),
    pendingClarification(admin, sessionId),
    recentFocus(admin, sessionId, 2).catch(() => [] as FocusEntity[]),
  ]);
  // What the model is told about this moment (Wave 4 §17): a role, the
  // local date and time, what is waiting, what the conversation was just
  // about — minimised with the utterance, never the household itself.
  const moment = {
    role: roleWords(membership),
    localDateTime: localDateTime(new Date(), membership.household.timezone),
    pending: pendingWords(clarifying ? { question: clarifying.question } : pending ? { summary: pending.summary } : null),
    recent: [...new Set(lastFocus.map((entity) => entity.label))].slice(0, 5),
  };
  const routing = await decideProviderRouting(supabase, householdId, body.utterance, history, people, moment);
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
  const rulesRead = input.rulesFirst === true && quick.action !== "unknown" && quick.confidence >= 0.8;

  // The HomeBrain reads the home while the request is being
  // understood — the two need nothing from each other, and together they
  // are most of a turn.
  const view = buildPersonalView(membership, ageBandFor(parseDateOfBirth(membership.dateOfBirth)));
  // Any question may be answered from the facts, with or without a model
  // (a deterministic answer needs them too), so the read starts whenever
  // the turn might be one.
  const readBrain = () =>
    householdMemory(householdId, `agenda:${membership.memberId}`, () => householdAgenda(supabase, householdId, view)).then(async (full) => {
      const agenda = limits ? narrowAgenda(full, (key) => agendaAllows(key, limits.scopes)) : full;
      return {
      agenda,
      context: scopedContext(await householdContext(supabase, {
        householdId,
        householdName: membership.household.name,
        timezone: membership.household.timezone,
        viewer: view,
        agenda: { needsYou: agenda.needsYou, handled: agenda.handled, checked: agenda.checked, unavailable: agenda.domains.filter((domain) => domain.failed).map((domain) => domain.label) },
      }), limits),
      };
    });
  // A request with several parts (Wave 4 §10) is carried out part by part
  // below; a correction is always one request about one earlier one.
  const parts = readCorrection(body.utterance) ? [body.utterance] : splitRequest(body.utterance);
  const mayBeQuestion = parts.length === 1 && (routing.compose !== undefined || quick.action === "ask_status" || quick.action === "unknown");
  const brainRead = mayBeQuestion ? readBrain() : null;
  brainRead?.catch(() => undefined);

  // Corrections (Wave 4 §9): "No, I meant Manan", "actually make that
  // Friday", "not milk, almond milk" — read against what this conversation
  // was just doing: the proposal still waiting for a yes and what HomeTalk
  // did here in the last half hour, newest first. The first of those the
  // correction actually fits, and changes, is the one it corrects ("not
  // milk" is about the add, not the reminder made after it). Never against
  // anything the household did not just ask for. What comes out is an
  // ordinary intent: grounded, gated and executed like any other, and an
  // executed original is undone through its own service.
  const correction = readCorrection(body.utterance);
  let correcting: CorrectableAction | null = null;
  let corrected: HouseholdIntent | null = null;
  if (correction) {
    // A proposal past its time limit is not what anyone is talking about
    // any more — the same window a "yes" has.
    const live = pending && pending.createdAt.getTime() > Date.now() - PROPOSAL_TTL_MINUTES * 60_000 ? pending : null;
    const stored = live ? await loadAction(admin, { householdId, actionId: live.id }).catch(() => null) : null;
    const done = await recentExecutedActions(admin, { sessionId, since: new Date(Date.now() - 30 * 60_000) }).catch(() => []);
    const subjects: (CorrectableAction & { at: number })[] = [
      ...(stored && stored.status === "proposed" && live
        ? [{ actionId: stored.id, actionType: stored.actionType, outcomeKey: stored.outcomeKey, parameters: stored.parameters, status: "proposed" as const, result: null, at: live.createdAt.getTime() }]
        : []),
      ...done.map((entry) => ({ actionId: entry.id, actionType: entry.actionType, outcomeKey: entry.outcomeKey, parameters: entry.parameters, status: "executed" as const, result: entry.result, at: entry.at.getTime() })),
    ].sort((a, b) => b.at - a.at);
    for (const subject of subjects) {
      const next = applyCorrection(correction, subject, { actorMemberId: membership.memberId, channel: body.channel, utterance: body.utterance, timezone: membership.household.timezone, now: new Date() });
      // A correction that would change nothing about a request ("make
      // that Friday" to something already on Friday) is not about it.
      if (next && describeCorrection(subject, next) !== null) {
        correcting = subject;
        corrected = next;
        break;
      }
    }
  }

  // Grounding (Wave 4): the household's people for "Asmi", "Dad", "the
  // older one"; and — only if a turn says "that" or "him" — what the
  // conversation, the waiting proposal and recent HomeSend were about.
  const turnStartedAt = new Date();
  let referenceRead: Promise<ReferenceState> | null = null;
  const references = () =>
    (referenceRead ??= loadReferences({ admin, supabase, householdId, sessionId, pending, clarifying, now: turnStartedAt }));
  const peopleItems = personItems(people, { householdId, now: turnStartedAt });
  // Recipes and what a meal needs, read only when a plan might be a meal
  // or "make sure we have everything" needs the list (Wave 4 §11).
  let recipeRead: Promise<{ id: string; name: string }[]> | null = null;
  let schoolRead: Promise<SchoolItemRef[]> | null = null;
  let assetRead: Promise<{ id: string; name: string }[]> | null = null;
  const groundingEnv = (read: () => Promise<ReferenceState>): GroundingEnv => ({
    people: peopleItems,
    viewerMemberId: membership.memberId,
    timezone: membership.household.timezone,
    now: turnStartedAt,
    references: read,
    recipes: () => (recipeRead ??= listRecipeNames(supabase, householdId).catch(() => [])),
    ingredients: (of) => ingredientNames(supabase, householdId, of).catch(() => []),
    schoolItems: () =>
      (schoolRead ??= listSchoolItems(supabase, householdId)
        .then((items) => items.map((entry) => ({ id: entry.id, title: entry.title, childMemberId: entry.childMemberId, dueAt: entry.dueAt?.toISOString() ?? null, status: entry.status, dueTimeKnown: entry.dueTimeKnown, endsAt: entry.endsAt?.toISOString() ?? null })))
        .catch(() => [])),
    assets: () => (assetRead ??= listAssets(supabase, householdId).then((items) => items.filter((entry) => entry.status === "active").map((entry) => ({ id: entry.id, name: entry.name }))).catch(() => [])),
  });

  const execution: ExecutionContext = {
    supabase,
    householdId,
    actorMemberId: membership.memberId,
    members: people,
    timezone: membership.household.timezone,
    actor: { memberId: membership.memberId, roles: membership.roles, memberType: membership.memberType },
    admin,
  };

  // Several proposals waiting at once — from a request with several parts
  // — and a bare "yes" or "no": which one is not ours to guess. "Yes to
  // both" settles them all, each through its own governed write.
  const shortReply = classifyShortReply(body.utterance);
  const allOfThem = body.utterance.trim().split(/\s+/).length <= 5 && /\b(?:both|all(?: of them)?|everything)\b/i.test(body.utterance) && /^(?:yes|yeah|yep|ok(?:ay)?|sure|go ahead|do|no|nope|cancel|both|all)\b/i.test(body.utterance.trim());
  if (!corrected && pending && (shortReply !== "unclear" || allOfThem)) {
    const open = await openProposals(admin, sessionId, new Date(Date.now() - PROPOSAL_TTL_MINUTES * 60_000)).catch(() => []);
    if (open.length > 1) {
      const memberMessageId = await memberMessageWrite;
      await metering;
      if (!allOfThem) {
        const list = open.map((entry) => `"${entry.summary.charAt(0).toLowerCase()}${entry.summary.slice(1)}"`);
        const text = `${open.length === 2 ? "Two" : String(open.length)} things are waiting for your answer: ${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}. Use the buttons on the one you mean, or say "${shortReply === "decline" ? "no" : "yes"} to ${open.length === 2 ? "both" : "all"}".`;
        const id = await recordMessage(admin, { householdId, sessionId, role: "assistant", content: text, metadata: { proposal: "clarify", intent: "unknown", mode: "clarify", provider: routing.code } });
        return { sessionId, memberMessageId, reply: { id, text, action: null, preview: null, proposal: "clarify", mode: "clarify" }, privacy: { provider: routing.code, disclosure: routing.disclosure } };
      }
      const approve = !/^(?:no|nope|cancel)\b/i.test(body.utterance.trim());
      const replies = [];
      for (const entry of [...open].reverse()) {
        if (await blockedOnChannel(entry.id)) {
          const id = await recordMessage(admin, { householdId, sessionId, role: "assistant", content: VOICE_NOT_ALLOWED, metadata: { proposal: "refused", mode: "answer" } });
          replies.push({ id, text: VOICE_NOT_ALLOWED, action: null, preview: null, proposal: "refused", mode: "answer" as BrainMode });
          continue;
        }
        const decided = await decideAction(admin, { householdId, actionId: entry.id, memberId: membership.memberId, decision: approve ? "approved" : "rejected" });
        if (!decided) continue;
        const settled = decided.refused
          ? { text: approvalRefusal(decided.refused), action: decided, focus: [] as FocusEntity[] }
          : approve ? await carryOutApproved({ admin, supabase, householdId, membership, action: decided, people, source, modality: body.channel }) : { text: `Left alone: ${entry.summary.charAt(0).toLowerCase()}${entry.summary.slice(1)}.`, action: decided, focus: [] as FocusEntity[] };
        const id = await recordMessage(admin, { householdId, sessionId, role: "assistant", content: settled.text, metadata: { decidedActionId: decided.id, ...(settled.focus.length > 0 ? { focus: settled.focus } : {}) } });
        replies.push({ id, text: settled.text, action: settled.action, preview: null, proposal: approve ? "approve" : "reject", mode: modeFor(approve ? "approve" : "reject", settled.action.status === "executed") });
      }
      if (replies.length > 0) {
        return { sessionId, memberMessageId, reply: replies[replies.length - 1], replies, privacy: { provider: routing.code, disclosure: routing.disclosure } };
      }
    }
  }

  // A request with several parts (Wave 4 §10): each part understood,
  // grounded, gated and carried out on its own, and written as its own
  // reply with its own preview. A part that leans on an earlier one
  // ("buy them") reads only what the earlier parts actually wrote, and is
  // held when any of them did not happen — a failed or unapproved action
  // is never the premise for the next.
  if (parts.length > 1) {
    const memberMessageId = await memberMessageWrite;
    await metering;
    const replies: { id: string; text: string; action: ConversationAction | null; preview: ReturnType<typeof previewOf>; proposal: string; mode: BrainMode }[] = [];
    const earlier: { part: string; outcome: PartOutcome }[] = [];
    const written: FocusEntity[] = [];

    for (const [index, part] of parts.entries()) {
      const held = heldBecause(part, earlier);
      if (held) {
        const id = await recordMessage(admin, { householdId, sessionId, role: "assistant", content: held, metadata: { part, outcome: "held", mode: "answer", provider: routing.code } });
        replies.push({ id, text: held, action: null, preview: null, proposal: "held", mode: "answer" });
        earlier.push({ part, outcome: "held" });
        continue;
      }

      // The current request comes first (§8): "them" is what the parts
      // before it wrote, not something older in the conversation.
      const read = leansOnEarlier(part) && written.length > 0 ? async () => ({ ...NO_REFERENCES, conversation: [...written] }) : references;
      const turn = await converse({
        utterance: part,
        channel: body.channel,
        ...(channelLimits ? { channelLimits } : {}),
        transcriptConfidence: body.transcriptConfidence,
        actor,
        pending: null,
        autonomyFor,
        entitledFor: (intent) => {
          const needed = FEATURE_FOR_ACTION[intent.action];
          return needed ? entitled[needed] : true;
        },
        executable: canExecute,
        sessionId,
        understand: routing.understandPart?.(part),
        history: routing.history,
        clarifying: null,
        ground: (intent) => groundIntent(intent, groundingEnv(read)),
      });

      if (turn.kind !== "reply") {
        const id = await recordMessage(admin, { householdId, sessionId, role: "assistant", content: turn.text, metadata: { part, kind: turn.kind, mode: "clarify", provider: routing.code } });
        replies.push({ id, text: turn.text, action: null, preview: null, proposal: turn.kind, mode: "clarify" });
        earlier.push({ part, outcome: "asked" });
        continue;
      }

      let text = turn.text;
      let outcome: { status: "executed" | "failed"; result: Record<string, unknown> } | null = null;
      let partOutcome: PartOutcome =
        turn.proposal.kind === "clarify" ? "asked" : turn.proposal.kind === "answer" ? "answered" : turn.proposal.kind === "executed" ? "done" : turn.proposal.kind === "refused" ? "failed" : "waiting";
      const focus: FocusEntity[] = [...(turn.focus ?? [])];
      if (turn.record) {
        focus.push(...focusFromProposal({ actionType: turn.intent.action, parameters: turn.intent.parameters, targetReference: turn.intent.target.reference ?? null, at: new Date().toISOString() }));
      }
      if (turn.memory) await remember(admin, householdId, attributeMemory(turn.memory, people), { memberId: membership.memberId, displayName: membership.displayName });
      if (turn.proposal.kind === "executed") {
        const done = await executeIntent(turn.intent, execution);
        text = done.ok ? done.text : `I tried, and it did not go through: ${done.reason}`;
        outcome = done.ok ? { status: "executed", result: done.result } : { status: "failed", result: { reason: done.reason } };
        partOutcome = done.ok ? "done" : "failed";
        if (done.ok) {
          const wrote = focusFromResult(turn.intent.action, done.result, new Date().toISOString());
          focus.push(...wrote);
          written.push(...wrote);
          forgetHouseholdContext(householdId);
        }
      }

      const partHedge = turn.proposal.kind !== "clarify" ? confidenceLead(turn.intent) : null;
      if (partHedge) text = `${partHedge} ${text}`;

      // A question in the middle of a request is answered before anything
      // after it is done — and the question stays the last thing said, so
      // the next turn is read as its answer.
      const rest = parts.slice(index + 1);
      if (partOutcome === "asked" && rest.length > 0) {
        text = `${text}\n\nI have not done ${rest.map((entry) => `"${entry}"`).join(" or ")} yet — ask me again once this is settled.`;
      }

      const mode = modeFor(turn.proposal.kind, outcome ? outcome.status === "executed" : null);
      const id = await recordMessage(admin, {
        householdId,
        sessionId,
        role: "assistant",
        content: text,
        metadata: {
          part,
          proposal: turn.proposal.kind,
          intent: turn.intent.action,
          understanding: turn.intent.understanding?.source ?? null,
          ...(turn.clarification ? { clarify: turn.clarification } : {}),
          mode,
          ...(focus.length > 0 ? { focus: focus.slice(0, 8) } : {}),
          provider: routing.code,
          providerItemsSent: routing.itemsSent,
        },
      });
      let action: ConversationAction | null = null;
      if (turn.record) {
        action = await recordProposal(admin, { householdId, sessionId, messageId: id, intent: turn.intent, proposal: turn.proposal });
        if (outcome) {
          await markActionResult(admin, { actionId: action.id, ...outcome, audit: { householdId, actorMemberId: membership.memberId, actionType: turn.intent.action, source, modality: body.channel } });
          action = { ...action, status: outcome.status, ...(unchangedResult(outcome.result) ? { unchanged: true } : {}) };
        }
      }
      replies.push({ id, text, action, preview: previewOf(turn.proposal), proposal: turn.proposal.kind, mode });
      earlier.push({ part, outcome: partOutcome });
      if (partOutcome === "asked") break;
    }

    const summary = partialSummary(earlier);
    if (summary) {
      const id = await recordMessage(admin, { householdId, sessionId, role: "assistant", content: summary, metadata: { kind: "partial_summary", mode: "answer", provider: routing.code } });
      replies.push({ id, text: summary, action: null, preview: null, proposal: "summary", mode: "answer" });
    }

    return {
      sessionId,
      memberMessageId,
      reply: replies[replies.length - 1],
      replies,
      privacy: { provider: routing.code, disclosure: routing.disclosure },
    };
  }

  const result = await converse({
    utterance: body.utterance,
    channel: body.channel,
    ...(channelLimits ? { channelLimits } : {}),
    transcriptConfidence: body.transcriptConfidence,
    actor,
    pending: pending && !corrected ? pendingFrom(pending) : null,
    autonomyFor,
    entitledFor: (intent) => {
      const needed = FEATURE_FOR_ACTION[intent.action];
      return needed ? entitled[needed] : true;
    },
    executable: canExecute,
    sessionId,
    understand: corrected ? () => corrected : plainQuestion || rulesRead ? undefined : routing.understand,
    history: routing.history,
    clarifying: corrected ? null : clarifying,
    ground: (intent) => groundIntent(intent, groundingEnv(references)),
  });
  const understoodAt = Date.now();

  // What the assistant says: the engine's line, unless something real
  // happened this turn — a question answered from the household's own
  // state, or a write that went through (or did not).
  let text = result.text;
  let outcome: { status: "executed" | "failed"; result: Record<string, unknown> } | null = null;
  let brain: { source: HomeBrainAnswer["source"] | "evidence"; factsSent: number } = { source: "none", factsSent: 0 };

  let composedAt = understoodAt;

  // A proposal the correction replaced is closed as rejected, so only the
  // corrected one can be approved; the reply says what changed.
  const correctionNote = corrected && correcting && result.kind === "reply" ? describeCorrection(correcting, result.intent) : null;
  if (corrected && correcting?.status === "proposed" && result.kind === "reply" && result.proposal.kind !== "clarify") {
    await decideAction(admin, { householdId, actionId: correcting.actionId, memberId: membership.memberId, decision: "rejected" }).catch(() => null);
  }
  // The correction is evaluation evidence too (Wave 5 §13): what was
  // understood, what the person said instead, and what kind of mistake
  // that was, kept append-only. Best-effort — never at the cost of the turn.
  if (correctionNote && correcting && result.kind === "reply") {
    const evidence = hometalkCorrectionEvidence(correcting, result.intent);
    if (evidence.length > 0) {
      void understandingOf(admin, correcting.actionId)
        .then((understandingSource) =>
          recordCorrectionEvidence(admin, {
            householdId,
            surface: "hometalk",
            sourceType: "conversation_action",
            sourceId: correcting!.actionId,
            memberId: membership.memberId,
            understandingSource,
            evidence,
          }),
        )
        .catch((error) => log.warn("correction evidence not recorded", { reason: error instanceof Error ? error.message : "unknown" }));
    }
  }

  // What this turn was about, persisted on its reply for the next turn's
  // "that" (Wave 4 §8, §16): grounded mentions, what a proposal is about,
  // and — added below — what an executor actually wrote.
  const turnFocus: FocusEntity[] = result.kind === "reply" ? [...(result.focus ?? [])] : [];
  if (result.kind === "reply" && result.record) {
    turnFocus.push(
      ...focusFromProposal({ actionType: result.intent.action, parameters: result.intent.parameters, targetReference: result.intent.target.reference ?? null, at: new Date().toISOString() }),
    );
  }

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
    // Context unavailable (Wave 5 §16): if the home itself cannot be read,
    // say so plainly rather than failing the whole turn.
    const agenda =
      (brainRead ? (await brainRead.catch(() => null))?.agenda : null) ??
      (await householdAgenda(supabase, householdId, view)
        .then((full) => (limits ? narrowAgenda(full, (key) => agendaAllows(key, limits.scopes)) : full))
        .catch(() => null));
    const [fallback, answered] = await Promise.all([
      agenda
        ? answerStatus(supabase, householdId, membership, result.intent, agenda).catch(() => HOME_UNREADABLE)
        : Promise.resolve(HOME_UNREADABLE),
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
    // What was actually written — the row, not what was asked for — is
    // what the next turn's "it" means.
    if (done.ok) turnFocus.push(...focusFromResult(result.intent.action, done.result, new Date().toISOString()));
    if (done.ok) forgetHouseholdContext(householdId);
  } else if (result.kind === "reply" && result.memory) {
    await remember(admin, householdId, attributeMemory(result.memory, people), { memberId: membership.memberId, displayName: membership.displayName });
    forgetHouseholdContext(householdId);
  }

  if (correctionNote && result.kind === "reply" && result.proposal.kind !== "clarify") {
    text = `Changed: ${correctionNote}. ${text}`;
  }
  // Confident enough to go on, not certain (§20): say who it was taken to be.
  const hedge = result.kind === "reply" && result.proposal.kind !== "clarify" ? confidenceLead(result.intent) : null;
  if (hedge) text = `${hedge} ${text}`;

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
      // What this turn was about (Wave 4 §16): ids and labels only,
      // never the text around them, for the next turn's "that".
      ...(turnFocus.length > 0 ? { focus: turnFocus.slice(0, 8) } : {}),
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

  if ((result.kind === "approve" || result.kind === "reject") && (await blockedOnChannel(result.actionId))) {
    text = VOICE_NOT_ALLOWED;
    await admin.from("conversation_messages").update({ content: text }).eq("id", replyId);
    return {
      sessionId,
      memberMessageId,
      reply: { id: replyId, text, action: null, preview: null, proposal: "refused", mode: "answer" as BrainMode },
      privacy: { provider: routing.code, disclosure: routing.disclosure },
    };
  }
  if (result.kind === "approve" || result.kind === "reject") {
    action = await decideAction(admin, {
      householdId,
      actionId: result.actionId,
      memberId: membership.memberId,
      decision: result.kind === "approve" ? "approved" : "rejected",
    });
    if (action?.refused) {
      text = approvalRefusal(action.refused);
      await admin.from("conversation_messages").update({ content: text }).eq("id", replyId);
    } else if (result.kind === "approve" && action) {
      const settled = await carryOutApproved({ admin, supabase, householdId, membership, action, people, source, modality: body.channel });
      text = settled.text;
      action = settled.action;
      mode = modeFor("approve", action.status === "executed");
      const { data: written } = await admin.from("conversation_messages").select("metadata").eq("id", replyId).maybeSingle();
      const metadata = { ...((written?.metadata as Record<string, unknown> | null) ?? {}), ...(settled.focus.length > 0 ? { focus: settled.focus } : {}) };
      await admin.from("conversation_messages").update({ content: text, metadata }).eq("id", replyId);
    }
  } else if (result.kind === "reply" && result.record) {
    action = await recordProposal(admin, { householdId, sessionId, messageId: replyId, intent: result.intent, proposal: result.proposal });
    if (outcome) {
      await markActionResult(admin, { actionId: action.id, ...outcome, audit: { householdId, actorMemberId: membership.memberId, actionType: result.intent.action, source, modality: body.channel } });
      action = { ...action, status: outcome.status, ...(unchangedResult(outcome.result) ? { unchanged: true } : {}) };
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
}

/**
 * An approved proposal is carried out now, through the same governed write
 * the turn would have used — and if there is no such write yet, the person
 * is told exactly that. "It is on its way" was the one sentence this route
 * must never say about something that did not move.
 */
/** What a status question gets when the home itself could not be read just now. Nothing was changed. */
const HOME_UNREADABLE = "I could not read the household's details just now, so I cannot say what is going on. Nothing was changed — try again in a moment.";

/** Whether a model or the rules understood the turn that made a proposal — from its reply's own metadata. */
async function understandingOf(admin: ReturnType<typeof createAdminClient>, actionId: string): Promise<"model" | "rules" | null> {
  const { data: action } = await admin.from("conversation_actions").select("message_id").eq("id", actionId).maybeSingle();
  if (!action?.message_id) return null;
  const { data: message } = await admin.from("conversation_messages").select("source:metadata->>understanding").eq("id", action.message_id).maybeSingle();
  const source = (message as { source?: string | null } | null)?.source;
  return source === "model" || source === "rules" ? source : null;
}

async function carryOutApproved(input: {
  admin: ReturnType<typeof createAdminClient>;
  supabase: Supabase;
  householdId: string;
  membership: HouseholdMembership;
  action: ConversationAction;
  people: Person[];
  source: string;
  modality: "text" | "voice";
}): Promise<{ text: string; action: ConversationAction; focus: FocusEntity[] }> {
  const stored = await loadAction(input.admin, { householdId: input.householdId, actionId: input.action.id });
  if (!stored) return { text: "I have your go-ahead, but I could not find what it was for, so nothing was changed.", action: input.action, focus: [] };
  // Only what was just approved is carried out: a proposal turned down,
  // timed out or already done never runs (AG-005; the database holds the
  // same line for rejected and expired).
  if (stored.status !== "approved") return { text: "That is no longer waiting for your go-ahead, so nothing was changed.", action: input.action, focus: [] };

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
    return { text: notYetDoable(intent.action), action: input.action, focus: [] };
  }

  const done = await executeIntent(intent, {
    supabase: input.supabase,
    householdId: input.householdId,
    actorMemberId: input.membership.memberId,
    members: input.people,
    timezone: input.membership.household.timezone,
    admin: input.admin,
  });
  const status = done.ok ? "executed" : "failed";
  await markActionResult(input.admin, {
    actionId: input.action.id,
    status,
    result: done.ok ? done.result : { reason: done.reason },
    audit: { householdId: input.householdId, actorMemberId: input.membership.memberId, actionType: stored.actionType, source: input.source, modality: input.modality },
  });
  if (done.ok) forgetHouseholdContext(input.householdId);

  return {
    text: done.ok ? done.text : `I have your go-ahead, and it did not go through: ${done.reason}`,
    action: { ...input.action, status, ...(done.ok && unchangedResult(done.result) ? { unchanged: true } : {}) },
    focus: done.ok ? focusFromResult(intent.action, done.result, new Date().toISOString()) : [],
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

  const events = when ? await listEvents(supabase, householdId, windowFor(when, now, membership.household.timezone)).catch(() => []) : null;

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
      viewer: { memberId: input.membership.memberId, roleLabel: input.view.roleLabel, guardianOf: context.snapshot.scope.viewer.guardianOf },
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

/**
 * The local days a "when" covers, as the instants the events query needs —
 * through the one temporal resolver (Wave 4 §7), in the household's zone,
 * so "tomorrow" is the household's tomorrow and not the server's.
 */
function windowFor(when: string, now: Date, timezone: string): { from: Date; to: Date } {
  const phrase = when.toLowerCase().trim();
  const midnight = (isoDate: string) => new Date(zonedTimeToUtcIso(isoDate, 0, 0, timezone));

  if (phrase === "this month" || phrase === "next month") {
    const today = resolveTemporal("today", { timezone, now })!.date;
    const [year, month] = today.split("-").map(Number) as [number, number];
    const start = phrase === "next month" ? (month === 12 ? [year + 1, 1] : [year, month + 1]) : [year, month];
    const end = start[1] === 12 ? [start[0]! + 1, 1] : [start[0]!, start[1]! + 1];
    const iso = ([y, m]: number[]) => `${y}-${String(m).padStart(2, "0")}-01`;
    return { from: midnight(iso(start)), to: midnight(iso(end)) };
  }

  const resolved = resolveTemporal(phrase, { timezone, now }) ?? resolveTemporal("today", { timezone, now })!;
  return { from: midnight(resolved.date), to: midnight(addDays(resolved.endDate, 1)) };
}

/**
 * Everyone active in the household: who they are for the consent gate's
 * placeholders, and the words the family uses for them (nickname,
 * "Dad", date of birth for "the older one") for the context engine's resolver.
 */
/**
 * What "that", "it" and "them" can point at this turn (Wave 4 §8), in the
 * spec's priority order: the question just asked, the proposal waiting for
 * a yes, recent conversation, recent HomeSend. Read only when a turn needs
 * it. A failed read is an empty tier, never a failed turn — the reference
 * then resolves to a question rather than a guess.
 */
async function loadReferences(input: {
  admin: ReturnType<typeof createAdminClient>;
  supabase: Supabase;
  householdId: string;
  sessionId: string;
  pending: { id: string; createdAt: Date } | null;
  clarifying: { parameters: Record<string, unknown> } | null;
  now: Date;
}): Promise<ReferenceState> {
  const [proposal, conversation, homeSendItems] = await Promise.all([
    input.pending ? loadAction(input.admin, { householdId: input.householdId, actionId: input.pending.id }).catch(() => null) : Promise.resolve(null),
    recentFocus(input.admin, input.sessionId).catch(() => []),
    // The member's own client: HomeSend is read under their RLS, exactly as
    // the HomeSend screen reads it.
    listHomeSendItems(input.supabase, input.householdId, { since: new Date(input.now.getTime() - 24 * 60 * 60_000), limit: 5 }).catch(() => []),
  ]);

  return {
    clarification: readFocus(input.clarifying?.parameters.candidates),
    proposal: proposal
      ? focusFromProposal({ actionType: proposal.actionType, parameters: proposal.parameters, targetReference: proposal.outcomeKey, at: input.pending!.createdAt.toISOString() })
      : [],
    conversation,
    homesend: homeSendFocus(homeSendItems),
  };
}

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
  moment?: { role: string; localDateTime: string; pending: string | null; recent: string[] },
): Promise<{
  code: string;
  itemsSent: number;
  disclosure: string[];
  understand?: Understanding;
  /** One part of a request with several (Wave 4 §10), minimised and sent on its own. */
  understandPart?: (part: string) => Understanding;
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
    ...(moment?.pending ? [{ id: "pending", contentClass: "general" as const, need: "what is waiting on the person", text: moment.pending, relevant: true }] : []),
    ...(moment && moment.recent.length > 0 ? [{ id: "recent", contentClass: "general" as const, need: "what the conversation was just about", text: moment.recent.join(", "), relevant: true }] : []),
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

  // Model calls are budgeted per household (Wave 5 §15). Past the budget the
  // turn is answered by the rules, and the household is told so. Nothing is
  // refused, and nothing leaves.
  if (!(await hitRateLimit(createAdminClient(), "ai.model", householdId))) {
    return {
      code: "not_transmitted_rate_limited",
      itemsSent: 0,
      disclosure: ["This household has asked a lot in the last hour, so this turn was answered from WonderHome's own rules. Nothing was sent to a model."],
      policy,
    };
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
  // The moment, as it may leave: the same minimisation as the utterance, so
  // a name in a pending question arrives as its placeholder.
  const sentText = (id: string) => minimised.included.find((entry) => entry.id === id)?.text ?? null;
  const runtime: RuntimeContext | undefined = moment
    ? { role: moment.role, localDateTime: moment.localDateTime, pending: sentText("pending"), recent: sentText("recent")?.split(", ") ?? [] }
    : undefined;
  const toHousehold = (intent: HouseholdIntent, pseudonyms: typeof minimised.pseudonyms): HouseholdIntent => {
    if (intent.target.kind === "member" && intent.target.reference) {
      const mapped = unpseudonymise(intent.target.reference, pseudonyms, people);
      return {
        ...intent,
        target: { kind: "member", reference: mapped.reference },
        parameters: mapped.memberId ? { ...intent.parameters, memberId: mapped.memberId } : intent.parameters,
      };
    }
    return intent;
  };
  const understand: Understanding = async (_utterance, context) =>
    toHousehold(await provider.understand(sentUtterance, { ...context, history: sentHistory, runtime }), minimised.pseudonyms);
  // One part of a longer request goes through the same minimisation on its
  // own, so the model reads only that part — and a part the household's
  // consent will not let leave is read by the rules instead.
  const understandPart = (part: string): Understanding => async (_utterance, context) => {
    const alone = minimiseContext([{ id: "utterance", contentClass: "general", need: "what was asked", text: part, relevant: true }], { policy, people });
    const sent = alone.included.find((entry) => entry.id === "utterance")?.text;
    if (!sent) return resolveDeterministicIntent(part, context);
    return toHousehold(await provider.understand(sent, { ...context, history: sentHistory, runtime }), alone.pseudonyms);
  };


  return {
    code: "transmitted",
    itemsSent: minimised.included.length,
    disclosure: [
      `What you said${sentHistory.length > 0 ? `, and the last ${sentHistory.length} turn${sentHistory.length === 1 ? "" : "s"} of this conversation,` : ""} went to ${provider.name} to understand your request. Names were replaced with roles first.`,
      ...(runtime
        ? [`With it went the date and time here, your role in the household${runtime.pending ? ", what was waiting on you" : ""}${runtime.recent && runtime.recent.length > 0 ? " and what the conversation was just about" : ""} — so "tomorrow" and "that" can be understood. Nothing else about your home was sent.`]
        : []),
    ],
    understand,
    understandPart,
    history: sentHistory,
    policy,
    sentUtterance,
    compose: provider.compose,
  };
}

/** Who is speaking, as a role the model may know — never a name. */
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
): Promise<Record<"finance.bills" | "commerce.orders" | "family.events" | "ai.agent_runs" | "health.tracking" | "meals.planning" | "school.connector" | "home.maintenance", boolean>> {
  const [bills, orders, events, agentRuns, health, meals, school, home] = await Promise.all([
    may(supabase, householdId, "finance.bills"),
    may(supabase, householdId, "commerce.orders"),
    may(supabase, householdId, "family.events"),
    may(supabase, householdId, "ai.agent_runs"),
    may(supabase, householdId, "health.tracking"),
    may(supabase, householdId, "meals.planning"),
    may(supabase, householdId, "school.connector"),
    may(supabase, householdId, "home.maintenance"),
  ]);
  return {
    "finance.bills": bills.allowed,
    "commerce.orders": orders.allowed,
    "family.events": events.allowed,
    "ai.agent_runs": agentRuns.allowed,
    "health.tracking": health.allowed,
    "meals.planning": meals.allowed,
    "school.connector": school.allowed,
    "home.maintenance": home.allowed,
  };
}

/** A household's facts narrowed to what a channel may reach (voice phases 2–3). Unchanged without limits. */
function scopedContext(context: HouseholdContext, limits: ChannelLimits | undefined): HouseholdContext {
  if (!limits) return context;
  return { ...context, snapshot: { ...context.snapshot, items: narrowToChannel(context.snapshot.items, limits) } };
}
