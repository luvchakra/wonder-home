import type { SupabaseClient } from "@supabase/supabase-js";

import { listConsumables, listOrders } from "../commerce/repository";
import { listEvents } from "../family/repository";
import { listObligations } from "../finance/repository";
import { countUpcomingAppointments, listAppointments } from "../health/appointments";
import { listCheckups } from "../health/checkups";
import { listFitnessGoals } from "../health/fitness";
import { listIssues } from "../health/issues";
import { listRecords } from "../health/records";
import { listVitals } from "../health/vitals";
import { listAssets, listLaundryNeeds, listPetCareNeeds, listPets, listServiceRequests } from "../home/repository";
import { listHouseholdPlaces } from "../homeplaces/repository";
import { listHomeSendChanges } from "../homesend/changes";
import { loadHouseholdAddress } from "../household/address";
import type { HomeSendChange } from "../homesend/items";
import { listHomeSendItems } from "../homesend/repository";
import { listResponsibilities } from "../household/configuration-repository";
import { listChildren } from "../identity/children";
import { listEnrolments } from "../school/enrolments";
import { listRelationships } from "../identity/relationships";
import { listMembers } from "../identity/households";
import { listMemberLanguages } from "../identity/member-languages";
import { listIntegrations } from "../integrations/repository";
import { listMeals } from "../meals/repository";
import { listExams, listTimetable } from "../school/exams";
import { listCommunications, listSchoolItems } from "../school/repository";
import {
  buildContextItems,
  HORIZON_DAYS,
  type AbsenceRecord,
  type AgendaInput,
  type AgentRunRecord,
  type ContextRecords,
  type BeliefRecord,
  type EventGuestRecord,
  type FoodPreferenceRecord,
  type MemoryRecord,
  type NotificationRecord,
  type OutcomeRecord,
  type ProposalRecord,
} from "./builders";
import { isoDateIn } from "./format";
import { applyFreshness } from "./freshness";
import { householdMemory } from "./invalidation";
import { filterForViewer, type WithheldItem } from "./privacy";
import { attachHomeSendEvidence } from "./provenance";
import type { ContextDomain, ContextScope, ContextViewer, HouseholdContextItem } from "./types";

/**
 * Authorized reads for every shipped domain (Wave 1 §3, §5).
 *
 * One adapter per domain, each through the member's own RLS-scoped client
 * and each reusing that domain's own repository — the engine never
 * re-implements a domain's business rules, and it never holds a service-role
 * client. A permission gate in front of each adapter is the same line the
 * HomeBrain already drew (a child's view does not read the household's
 * groceries; bills need `finance.view`; health needs `health.manage`): RLS
 * decides rows, the gate decides whether the domain is read at all.
 *
 * Every adapter is isolated. One domain that cannot be read costs the answer
 * that domain, never the whole context — and is named, so an answer can say
 * honestly what it could not see.
 */

type Supabase = SupabaseClient;

export type ContextAdapter = {
  domain: ContextDomain;
  /** What the household is told could not be read. */
  label: string;
  permitted: (viewer: ContextViewer) => boolean;
  read: (supabase: Supabase, scope: ContextScope) => Promise<ContextRecords & { homeSendChanges?: HomeSendChange[]; guardianOf?: string[] }>;
};

const may = (viewer: ContextViewer, permission: string) => viewer.permissions.includes(permission);
const notChild = (viewer: ContextViewer) => viewer.tone !== "child";
const anyone = () => true;

function horizon(scope: ContextScope): { from: Date; to: Date; fromDay: string; toDay: string } {
  const to = new Date(scope.now.getTime() + HORIZON_DAYS * 86_400_000);
  return { from: scope.now, to, fromDay: isoDateIn(scope.now, scope.timezone), toDay: isoDateIn(to, scope.timezone) };
}

export const CONTEXT_ADAPTERS: readonly ContextAdapter[] = [
  {
    domain: "people",
    label: "who is in the household",
    permitted: anyone,
    read: async (supabase, scope) => {
      const [members, children, enrolments, languages, relationships] = await Promise.all([
        listMembers(supabase, scope.householdId, null),
        listChildren(supabase, scope.householdId, scope.now).catch(() => []),
        listEnrolments(supabase, scope.householdId).catch(() => []),
        listMemberLanguages(supabase, scope.householdId).catch(() => new Map()),
        listRelationships(supabase, scope.householdId).catch(() => []),
      ]);
      return {
        members,
        relationships,
        enrolments,
        languages,
        guardianOf: children.filter((child) => child.guardianMemberIds.includes(scope.viewer.memberId)).map((child) => child.memberId),
      };
    },
  },
  { domain: "pets", label: "pets", permitted: anyone, read: async (supabase, scope) => ({ pets: await listPets(supabase, scope.householdId) }) },
  { domain: "responsibilities", label: "responsibilities", permitted: anyone, read: async (supabase, scope) => ({ responsibilities: await listResponsibilities(supabase, scope.householdId) }) },
  { domain: "outcomes", label: "outcomes", permitted: notChild, read: async (supabase, scope) => ({ outcomes: await listOpenOutcomes(supabase, scope) }) },
  { domain: "preferences", label: "what the household has said", permitted: anyone, read: async (supabase, scope) => {
      const [memories, beliefs, foodPreferences] = await Promise.all([
        listMemories(supabase, scope.householdId),
        listBeliefs(supabase, scope.householdId),
        listFoodPreferences(supabase, scope.householdId).catch(() => []),
      ]);
      return { memories, beliefs, foodPreferences };
    } },
  {
    // Home and the place book (HomePlaces): where the family is, and the places it saved or turned down.
    domain: "places",
    label: "places",
    permitted: anyone,
    read: async (supabase, scope) => {
      const [places, address] = await Promise.all([listHouseholdPlaces(supabase, scope.householdId), loadHouseholdAddress(supabase, scope.householdId)]);
      return { places, address };
    },
  },
  {
    domain: "calendar",
    label: "the calendar",
    permitted: anyone,
    read: async (supabase, scope) => {
      const window = horizon(scope);
      const [events, eventGuests] = await Promise.all([
        listEvents(supabase, scope.householdId, { from: window.from, to: window.to }),
        listEventGuests(supabase, scope.householdId).catch(() => []),
      ]);
      return { events, eventGuests };
    },
  },
  {
    domain: "absences",
    label: "who is away",
    permitted: anyone,
    read: async (supabase, scope) => {
      const window = horizon(scope);
      return { absences: await listAbsences(supabase, scope.householdId, window.fromDay, window.toDay) };
    },
  },
  {
    domain: "meals",
    label: "meals",
    permitted: notChild,
    read: async (supabase, scope) => {
      const window = horizon(scope);
      return { meals: await listMeals(supabase, scope.householdId, { from: window.fromDay, to: window.toDay }) };
    },
  },
  { domain: "groceries", label: "groceries", permitted: notChild, read: async (supabase, scope) => ({ consumables: await listConsumables(supabase, scope.householdId) }) },
  { domain: "orders", label: "orders", permitted: notChild, read: async (supabase, scope) => ({ orders: await listOrders(supabase, scope.householdId) }) },
  { domain: "bills", label: "bills", permitted: (viewer) => may(viewer, "finance.view"), read: async (supabase, scope) => ({ obligations: await listObligations(supabase, scope.householdId) }) },
  {
    domain: "school",
    label: "school work",
    permitted: (viewer) => may(viewer, "school.manage") || may(viewer, "school.view_own"),
    read: async (supabase, scope) => {
      const manage = may(scope.viewer, "school.manage");
      const [schoolItems, communications, exams, timetable] = await Promise.all([
        listSchoolItems(supabase, scope.householdId, manage ? {} : { childMemberId: scope.viewer.memberId }),
        manage ? listCommunications(supabase, scope.householdId) : Promise.resolve(undefined),
        // RLS keeps exams and timetables to the child, their guardians and Admins (08-015); before the migration, none.
        listExams(supabase, scope.householdId).catch(() => []),
        listTimetable(supabase, scope.householdId).catch(() => []),
      ]);
      return { schoolItems, communications, exams, timetable };
    },
  },
  {
    domain: "home",
    label: "home upkeep",
    permitted: notChild,
    read: async (supabase, scope) => {
      const [assets, serviceRequests] = await Promise.all([listAssets(supabase, scope.householdId), listServiceRequests(supabase, scope.householdId)]);
      return { assets, serviceRequests };
    },
  },
  { domain: "laundry", label: "laundry", permitted: anyone, read: async (supabase, scope) => ({ laundry: await listLaundryNeeds(supabase, scope.householdId) }) },
  { domain: "pet_care", label: "pet care", permitted: anyone, read: async (supabase, scope) => ({ petCare: await listPetCareNeeds(supabase, scope.householdId) }) },
  {
    // Only for a member holding `health.manage`, and each row only when RLS
    // (`wh.may_see_health`) already lets this person see it.
    domain: "health",
    label: "health",
    permitted: (viewer) => may(viewer, "health.manage"),
    read: async (supabase, scope) => {
      const [healthAppointments, healthIssues, healthCheckups, healthRecords, vitals, fitnessGoals] = await Promise.all([
        listAppointments(supabase, scope.householdId, { statuses: ["proposed", "confirmed", "rescheduled"] }),
        listIssues(supabase, scope.householdId, { statuses: ["mentioned", "active", "monitoring"] }),
        listCheckups(supabase, scope.householdId, { statuses: ["active"] }),
        listRecords(supabase, scope.householdId, { statuses: ["active"] }),
        listVitals(supabase, scope.householdId, { limit: 12 }),
        listFitnessGoals(supabase, scope.householdId, { statuses: ["active"] }),
      ]);
      return { healthAppointments, healthIssues, healthCheckups, healthRecords, vitals, fitnessGoals };
    },
  },
  { domain: "notifications", label: "notices", permitted: anyone, read: async (supabase, scope) => ({ notifications: await listOwnNotifications(supabase, scope) }) },
  {
    domain: "homesend",
    label: "HomeSend",
    permitted: notChild,
    read: async (supabase, scope) => {
      const [homeSendItems, homeSendChanges] = await Promise.all([listHomeSendItems(supabase, scope.householdId), listHomeSendChanges(supabase, scope.householdId)]);
      return { homeSendItems: homeSendItems.slice(0, 20), homeSendChanges };
    },
  },
  { domain: "hometalk", label: "earlier conversation", permitted: anyone, read: async (supabase, scope) => ({ proposals: await listRecentProposals(supabase, scope) }) },
  { domain: "agents", label: "agent checks", permitted: (viewer) => viewer.tone === "adult", read: async (supabase, scope) => ({ agentRuns: await listRecentAgentRuns(supabase, scope.householdId) }) },
  { domain: "integrations", label: "connections", permitted: (viewer) => viewer.tone === "adult", read: async (supabase, scope) => ({ integrations: await listIntegrations(supabase, scope.householdId) }) },
];

export type ContextSnapshot = {
  scope: ContextScope;
  /** Authorized, provenance-linked, freshness-marked items. */
  items: HouseholdContextItem[];
  /** Domains that could not be read, in the household's words. */
  unavailable: string[];
  /** Items the privacy boundary held back, by reason. Ids only. */
  withheld: WithheldItem[];
  /**
   * For a member who may not read health: how many of their own appointments
   * are still to come. A count, never a detail — so HomeBrain can say one is
   * on record and that the adults in the family can see it.
   */
  heldForAdults: number;
  gatheredAt: Date;
};

export type GatherOptions = {
  /** What the agenda already worked out needs a person — Tier 1. */
  agenda?: AgendaInput;
  /** Read only these domains (plus people and the household itself). */
  domains?: readonly ContextDomain[];
};

/**
 * The Household Context Store's way in (HomeBrain 3.0 phase A): when one is
 * registered (`context/store.ts`'s `enableContextStore`), `loadHouseholdContext`
 * asks it first and reads the domains itself only when the store answers
 * null. Nothing here imports the store, so the engine stays usable — and
 * testable — without a service role or a database.
 */
export type ContextStoreReader = (supabase: Supabase, scope: ContextScope, options: GatherOptions) => Promise<ContextSnapshot | null>;

/**
 * Kept on `globalThis`, not in a module variable: Next bundles
 * `instrumentation.ts` (where the store is switched on) separately from the
 * route handlers, so each has its own copy of this module, and a module
 * variable set in one is never seen by the other. Every bundle in the
 * process shares `globalThis`.
 */
const STORE_READER = Symbol.for("wonderhome.contextStoreReader");
type WithReader = typeof globalThis & { [STORE_READER]?: ContextStoreReader | null };

export function setContextStoreReader(reader: ContextStoreReader | null): void {
  (globalThis as WithReader)[STORE_READER] = reader;
}

function contextStoreReader(): ContextStoreReader | null {
  return (globalThis as WithReader)[STORE_READER] ?? null;
}

/** Reads every domain this member may see and turns it into canonical items. */
export async function gatherHouseholdContext(supabase: Supabase, scope: ContextScope, options: GatherOptions = {}): Promise<ContextSnapshot> {
  const wanted = options.domains ? new Set<ContextDomain>(["people", ...options.domains]) : null;
  const unavailable: string[] = [];
  const records: ContextRecords = {};
  const homeSendChanges: HomeSendChange[] = [];
  let guardianOf: string[] = [...scope.viewer.guardianOf];

  const adapters = CONTEXT_ADAPTERS.filter((adapter) => (!wanted || wanted.has(adapter.domain)) && adapter.permitted(scope.viewer));
  const results = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        return await adapter.read(supabase, scope);
      } catch {
        unavailable.push(adapter.label);
        return null;
      }
    }),
  );

  for (const result of results) {
    if (!result) continue;
    const { homeSendChanges: changes, guardianOf: guarded, ...rest } = result;
    if (changes) homeSendChanges.push(...changes);
    if (guarded) guardianOf = Array.from(new Set([...guardianOf, ...guarded]));
    Object.assign(records, rest);
  }

  const agenda = options.agenda ? { ...options.agenda, unavailable: [...options.agenda.unavailable, ...unavailable] } : undefined;
  const effectiveScope: ContextScope = { ...scope, viewer: { ...scope.viewer, guardianOf } };

  const built = buildContextItems(
    { ...records, ...(agenda ? { agenda } : {}) },
    { householdId: scope.householdId, householdName: scope.householdName, timezone: scope.timezone, now: scope.now, viewerMemberId: scope.viewer.memberId },
  );
  const withEvidence = attachHomeSendEvidence(built, homeSendChanges);
  const fresh = applyFreshness(withEvidence, scope.now);
  const { items, withheld } = filterForViewer(fresh, effectiveScope);

  // A member who may not read health still hears that their own appointment
  // exists. A count of their own rows only; a failed read is simply none.
  let heldForAdults = 0;
  if ((!wanted || wanted.has("health")) && !may(scope.viewer, "health.manage")) {
    heldForAdults = await countUpcomingAppointments(supabase, scope.householdId, scope.viewer.memberId, scope.now).catch(() => 0);
  }

  return { scope: effectiveScope, items, unavailable: [...(options.agenda?.unavailable ?? []), ...unavailable], withheld, heldForAdults, gatheredAt: scope.now };
}

/** The same read, kept briefly per viewer and forgotten the moment the household changes — through the store where there is one. */
export async function loadHouseholdContext(supabase: Supabase, scope: ContextScope, options: GatherOptions = {}): Promise<ContextSnapshot> {
  const storeReader = contextStoreReader();
  if (storeReader) {
    const fromStore = await storeReader(supabase, scope, options).catch(() => null);
    if (fromStore) return fromStore;
  }
  const key = `context:${scope.viewer.memberId}${options.domains ? `:${[...options.domains].sort().join(",")}` : ""}`;
  return householdMemory(scope.householdId, key, () => gatherHouseholdContext(supabase, scope, options));
}

// ---------------------------------------------------------------------------
// Reads with no domain repository of their own
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export async function listMemories(supabase: Supabase, householdId: string, options: { limit?: number } = {}): Promise<MemoryRecord[]> {
  const { data, error } = await supabase
    .from("memories")
    .select("id, scope, member_id, category, key, value, status, confidence, source_type, source_id, created_at, updated_at")
    .eq("household_id", householdId)
    .in("status", ["learned", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 60);
  if (error) throw new Error(`listMemories failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    scope: row.scope as MemoryRecord["scope"],
    memberId: (row.member_id as string | null) ?? null,
    category: row.category as string,
    key: row.key as string,
    value: row.value,
    status: row.status as string,
    confidence: row.confidence === null || row.confidence === undefined ? undefined : Number(row.confidence),
    sourceType: (row.source_type as string | undefined) ?? undefined,
    sourceId: (row.source_id as string | null) ?? null,
    createdAt: (row.created_at as string | undefined) ?? undefined,
    updatedAt: (row.updated_at as string | undefined) ?? undefined,
  }));
}

/**
 * Beliefs held in HomeBrain Review with no HomeTalk memory behind them —
 * what the household added or corrected there. Memory-linked items are
 * already read as memories, so they are not read twice.
 */
export async function listBeliefs(supabase: Supabase, householdId: string, options: { limit?: number } = {}): Promise<BeliefRecord[]> {
  const { data, error } = await supabase
    .from("certification_items")
    .select("id, category, claim, scope, member_id, source_type, source_detail, status, created_at, last_reviewed_at")
    .eq("household_id", householdId)
    .is("memory_id", null)
    .in("status", ["learned", "confirmed", "needs_review"])
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 60);
  if (error) throw new Error(`listBeliefs failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    category: row.category as string,
    claim: row.claim as string,
    scope: row.scope as BeliefRecord["scope"],
    memberId: (row.member_id as string | null) ?? null,
    sourceType: row.source_type as string,
    sourceDetail: (row.source_detail as string | null) ?? null,
    status: row.status as string,
    createdAt: row.created_at as string,
    reviewedAt: (row.last_reviewed_at as string | null) ?? null,
  }));
}

/** Guests' replies to the household's event invite links. */
export async function listEventGuests(supabase: Supabase, householdId: string): Promise<EventGuestRecord[]> {
  const { data, error } = await supabase.from("event_guests").select("event_id, name, response, party_size, note").eq("household_id", householdId).order("updated_at", { ascending: true });
  if (error) throw new Error(`listEventGuests failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    eventId: row.event_id as string,
    name: row.name as string,
    response: row.response as EventGuestRecord["response"],
    partySize: Number(row.party_size ?? 1),
    note: (row.note as string | null) ?? null,
  }));
}

/** The Meals screen's food preferences; a null member is the whole household. */
export async function listFoodPreferences(supabase: Supabase, householdId: string): Promise<FoodPreferenceRecord[]> {
  const { data, error } = await supabase.from("food_preferences").select("id, member_id, kind, subject").eq("household_id", householdId).order("created_at", { ascending: true });
  if (error) throw new Error(`listFoodPreferences failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    memberId: (row.member_id as string | null) ?? null,
    kind: row.kind as FoodPreferenceRecord["kind"],
    subject: row.subject as string,
  }));
}

export async function listAbsences(supabase: Supabase, householdId: string, from: string, to: string): Promise<AbsenceRecord[]> {
  const { data, error } = await supabase
    .from("availability_exceptions")
    .select("member_id, on_date, available, reason")
    .eq("household_id", householdId)
    .gte("on_date", from)
    .lte("on_date", to)
    .order("on_date", { ascending: true });
  if (error) throw new Error(`listAbsences failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    memberId: row.member_id as string,
    onDate: row.on_date as string,
    available: row.available as boolean,
    reason: (row.reason as string | null) ?? null,
  }));
}

async function listOpenOutcomes(supabase: Supabase, scope: ContextScope): Promise<OutcomeRecord[]> {
  const { data, error } = await supabase
    .from("outcomes")
    .select("id, outcome_key, status, risk_level, owner_member_id, due_at, verification_source, updated_at")
    .eq("household_id", scope.householdId)
    .in("status", ["pending", "on_track", "at_risk", "blocked"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(30);
  if (error) throw new Error(`listOpenOutcomes failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    outcomeKey: row.outcome_key as string,
    status: row.status as string,
    riskLevel: row.risk_level as string,
    ownerMemberId: (row.owner_member_id as string | null) ?? null,
    dueAt: (row.due_at as string | null) ?? null,
    verificationSource: (row.verification_source as string | null) ?? null,
    updatedAt: row.updated_at as string,
  }));
}

/** Notifications are recipient-specific (RLS: `notifications_select_own`) — only the asker's own. */
async function listOwnNotifications(supabase: Supabase, scope: ContextScope): Promise<NotificationRecord[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, priority, thread_key, title, body, status, created_at")
    .eq("household_id", scope.householdId)
    .eq("recipient_member_id", scope.viewer.memberId)
    .neq("status", "expired")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`listOwnNotifications failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    type: row.type as string,
    priority: row.priority as string,
    threadKey: row.thread_key as string,
    title: row.title as string,
    body: row.body as string,
    status: row.status as string,
    createdAt: row.created_at as string,
  }));
}

/** HomeTalk proposals from the last week — RLS limits them to this member's own conversations. */
async function listRecentProposals(supabase: Supabase, scope: ContextScope): Promise<ProposalRecord[]> {
  const since = new Date(scope.now.getTime() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("conversation_actions")
    .select("id, action_type, approval_status, outcome_key, payload, created_at")
    .eq("household_id", scope.householdId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`listRecentProposals failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => {
    const payload = (row.payload as Record<string, unknown> | null) ?? {};
    const preview = payload.preview as { summary?: unknown } | null | undefined;
    return {
      id: row.id as string,
      actionType: row.action_type as string,
      status: row.approval_status as string,
      summary: typeof preview?.summary === "string" ? preview.summary : null,
      outcomeKey: (row.outcome_key as string | null) ?? null,
      parameters: (payload.parameters as Record<string, unknown> | undefined) ?? {},
      createdAt: row.created_at as string,
    };
  });
}

async function listRecentAgentRuns(supabase: Supabase, householdId: string): Promise<AgentRunRecord[]> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id, agent_type, status, summary, started_at, finished_at")
    .eq("household_id", householdId)
    .order("started_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(`listRecentAgentRuns failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    agentType: row.agent_type as string,
    status: row.status as string,
    summary: (row.summary as string | null) ?? null,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null) ?? null,
  }));
}
