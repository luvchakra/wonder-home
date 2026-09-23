import { assessConsumable, type Consumable } from "../commerce/consumables";
import type { Order } from "../commerce/orders";
import type { FamilyEvent } from "../family/schedule";
import type { Obligation } from "../finance/payments";
import type { HealthAppointment } from "../health/appointments";
import { classifyCheckup, type HealthCheckup } from "../health/checkups";
import { FITNESS_ACTIVITY_LABEL, type FitnessGoal } from "../health/fitness";
import type { HealthIssue } from "../health/issues";
import type { HealthRecord } from "../health/records";
import type { HealthVital } from "../health/vitals";
import type { HomeAssessment } from "../home/assessment";
import type { HomeAsset } from "../home/assets";
import type { LaundryNeed } from "../home/laundry";
import type { Pet, PetCareNeed } from "../home/pets";
import type { ServiceRequest } from "../home/services";
import type { HomeSendItem } from "../homesend/items";
import type { ResponsibilityRow } from "../household/configuration-repository";
import type { HouseholdMember } from "../identity/households";
import type { Integration } from "../integrations/repository";
import type { Meal } from "../meals/meals";
import type { SchoolCommunication } from "../school/communications";
import type { SchoolItem } from "../school/items";
import { capitalize, describeValue, formatDate, formatTime, humanKey, isoDateIn, money, words } from "./format";
import type { ContextDomain, ContextTier, HealthScope, HouseholdContextItem, PrivacyClass, SourceRef } from "./types";

/**
 * Domain records → canonical context items (Wave 1 §4).
 *
 * Pure: records in, items out, no reads. Each section is one domain's
 * adapter, and its wording is the HomeBrain's own — the facts the model has
 * been answering from all along, now each carrying the structure the engine
 * needs to resolve a reference, match an incoming fact, judge freshness and
 * trace provenance.
 *
 * A domain that was not read (its records are `undefined`) contributes
 * nothing, not even "nothing is on record": not having looked is not the
 * same as there being nothing, and saying otherwise would be a fact with no
 * source.
 */

export type MemoryRecord = {
  id?: string;
  scope: "household" | "member";
  memberId: string | null;
  category: string;
  key: string;
  value: unknown;
  status: string;
  confidence?: number;
  sourceType?: string;
  sourceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AbsenceRecord = { memberId: string; onDate: string; available: boolean; reason: string | null };

export type OutcomeRecord = {
  id: string;
  outcomeKey: string;
  status: string;
  riskLevel: string;
  ownerMemberId: string | null;
  dueAt: string | null;
  verificationSource: string | null;
  updatedAt: string;
};

export type NotificationRecord = {
  id: string;
  type: string;
  priority: string;
  threadKey: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
};

export type ProposalRecord = {
  id: string;
  actionType: string;
  status: string;
  summary: string | null;
  outcomeKey: string | null;
  parameters: Record<string, unknown>;
  createdAt: string;
};

export type AgentRunRecord = {
  id: string;
  agentType: string;
  status: string;
  summary: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type AgendaInput = {
  needsYou: readonly HomeAssessment[];
  handled: readonly { key: string; title: string; meta?: string }[];
  checked: number;
  /** Domain labels that could not be read this time. */
  unavailable: readonly string[];
};

export type ContextRecords = {
  members?: readonly HouseholdMember[];
  pets?: readonly Pet[];
  responsibilities?: readonly ResponsibilityRow[];
  outcomes?: readonly OutcomeRecord[];
  memories?: readonly MemoryRecord[];
  events?: readonly FamilyEvent[];
  absences?: readonly AbsenceRecord[];
  schoolItems?: readonly SchoolItem[];
  communications?: readonly SchoolCommunication[];
  consumables?: readonly Consumable[];
  orders?: readonly Order[];
  meals?: readonly Meal[];
  obligations?: readonly Obligation[];
  assets?: readonly HomeAsset[];
  serviceRequests?: readonly ServiceRequest[];
  laundry?: readonly LaundryNeed[];
  petCare?: readonly PetCareNeed[];
  healthAppointments?: readonly HealthAppointment[];
  healthIssues?: readonly HealthIssue[];
  healthCheckups?: readonly HealthCheckup[];
  healthRecords?: readonly HealthRecord[];
  vitals?: readonly HealthVital[];
  fitnessGoals?: readonly FitnessGoal[];
  notifications?: readonly NotificationRecord[];
  homeSendItems?: readonly HomeSendItem[];
  proposals?: readonly ProposalRecord[];
  agentRuns?: readonly AgentRunRecord[];
  integrations?: readonly Integration[];
  agenda?: AgendaInput;
};

export type BuildOptions = {
  householdId: string;
  householdName: string;
  timezone: string;
  now: Date;
  viewerMemberId: string;
};

const DAY_MS = 86_400_000;
export const HORIZON_DAYS = 7;
/** A budget on how much of each list is spelled out; the counts still say how many there were. */
export const MAX_PER_LIST = 12;

type Draft = {
  domain: ContextDomain;
  entityType: string;
  entityId: string;
  summary: string;
  need: string;
  privacyClass: PrivacyClass;
  subjectMemberIds?: (string | null | undefined)[];
  attributes?: Record<string, unknown>;
  source?: Partial<SourceRef>;
  confidence?: number;
  confirmed?: boolean;
  authority?: number;
  tier?: ContextTier;
  validFrom?: string | null;
  validUntil?: string | null;
  freshnessAt?: string | null;
  freshness?: HouseholdContextItem["freshness"];
  aliases?: (string | null | undefined)[];
  relatedEntityIds?: (string | null | undefined)[];
  identityKey?: string;
  healthScope?: HealthScope;
};

export function buildContextItems(records: ContextRecords, options: BuildOptions): HouseholdContextItem[] {
  const items: HouseholdContextItem[] = [];
  const nowIso = options.now.toISOString();
  const members = records.members ?? [];
  const nameById = new Map(members.map((member) => [member.id, member.displayName]));
  const name = (memberId: string | null | undefined) => (memberId ? (nameById.get(memberId) ?? null) : null);
  const isChild = (memberId: string | null | undefined) => members.find((member) => member.id === memberId)?.memberType === "child";
  const dateOf = (date: Date) => formatDate(date, options.timezone);
  const timeOf = (date: Date) => formatTime(date, options.timezone);
  const today = isoDateIn(options.now, options.timezone);
  let summaries = 0;

  const add = (draft: Draft) => {
    items.push({
      id: `${draft.entityType}:${draft.entityId}`,
      householdId: options.householdId,
      domain: draft.domain,
      entityType: draft.entityType,
      entityId: draft.entityId,
      subjectMemberIds: unique(draft.subjectMemberIds ?? []),
      summary: draft.summary,
      need: draft.need,
      attributes: draft.attributes ?? {},
      source: { type: draft.source?.type ?? draft.entityType, sourceId: draft.source?.sourceId === undefined ? draft.entityId : draft.source.sourceId, capturedAt: draft.source?.capturedAt ?? null },
      evidence: [],
      confidence: draft.confidence ?? 1,
      confirmed: draft.confirmed ?? true,
      privacyClass: draft.privacyClass,
      ...(draft.healthScope ? { healthScope: draft.healthScope } : {}),
      validFrom: draft.validFrom ?? null,
      validUntil: draft.validUntil ?? null,
      freshnessAt: draft.freshnessAt ?? nowIso,
      freshness: draft.freshness ?? "current",
      tier: draft.tier ?? 2,
      aliases: unique(draft.aliases ?? []),
      relatedEntityIds: unique(draft.relatedEntityIds ?? []),
      ...(draft.identityKey ? { identityKey: draft.identityKey } : {}),
      authority: draft.authority ?? 3,
    });
  };
  /** A statement about a whole domain ("no bills yet") rather than one record. */
  const state = (domain: ContextDomain, need: string, summary: string, privacyClass: PrivacyClass = "general", tier: ContextTier = 2) => {
    summaries += 1;
    add({ domain, entityType: "state", entityId: `${domain}-${summaries}`, summary, need, privacyClass, tier, source: { type: "household_state", sourceId: null } });
  };

  // --- The household and who is in it ----------------------------------------
  add({
    domain: "household",
    entityType: "household",
    entityId: options.householdId,
    summary: `The household is called "${options.householdName}", in the ${options.timezone} time zone. Today is ${dateOf(options.now)}.`,
    need: "who is in the household",
    privacyClass: "general",
    tier: 1,
    attributes: { name: options.householdName, timezone: options.timezone },
    source: { type: "households" },
  });

  if (records.members) {
    const active = members.filter((member) => member.status === "active");
    for (const member of active) {
      const helper = member.memberType === "helper";
      const roles = Array.from(new Set(member.roles.map(roleWord).filter(Boolean)));
      const kind = member.memberType === "child" ? "a child" : "an adult";
      add({
        domain: "people",
        entityType: "member",
        entityId: member.id,
        summary: helper
          ? `${member.displayName} is a househelper.`
          : `${member.displayName} is ${kind}${roles.length > 0 ? ` and ${roles.join(" and ")}` : ""}${member.id === options.viewerMemberId ? " (the person asking)" : ""}.`,
        need: helper ? "who helps the household" : "who is in the household",
        privacyClass: member.memberType === "child" ? "child" : "general",
        subjectMemberIds: [member.id],
        tier: 1,
        attributes: {
          displayName: member.displayName,
          memberType: member.memberType,
          relationship: member.relationship,
          nickname: member.nickname,
          dateOfBirth: member.dateOfBirth,
          occupation: member.occupation,
          roles: member.roles,
        },
        source: { type: "household_members" },
        aliases: [member.displayName, firstName(member.displayName), member.nickname, member.relationship],
      });
    }
    const invited = members.filter((member) => member.status === "invited");
    if (invited.length > 0) {
      state("people", "who is in the household", `${invited.map((member) => member.displayName).join(", ")} ${invited.length === 1 ? "has" : "have"} been invited but not joined yet.`);
    }
  }

  if (records.pets) {
    for (const pet of records.pets.filter((entry) => entry.active !== false)) {
      add({
        domain: "pets",
        entityType: "pet",
        entityId: pet.id,
        summary: `${pet.name} is the household's ${pet.species.toLowerCase()}.`,
        need: "which pets the household has",
        privacyClass: "general",
        tier: 1,
        attributes: { name: pet.name, species: pet.species.toLowerCase() },
        source: { type: "pets" },
        aliases: [pet.name, pet.species, ...speciesAliases(pet.species)],
      });
    }
  }

  // --- Who does what -----------------------------------------------------------
  if (records.responsibilities) {
    for (const responsibility of records.responsibilities.slice(0, MAX_PER_LIST * 2)) {
      const owner = name(responsibility.primaryMemberId) ?? "nobody";
      const backup = name(responsibility.backupMemberId);
      add({
        domain: "responsibilities",
        entityType: "responsibility",
        entityId: responsibility.outcomeKey,
        summary: `${humanKey(responsibility.outcomeKey)} is looked after by ${owner}${backup ? ` (backup: ${backup})` : ""}; WonderHome may ${autonomyWord(responsibility.aiMode)} for it.`,
        need: "who is responsible for what",
        privacyClass: "general",
        subjectMemberIds: [responsibility.primaryMemberId, responsibility.backupMemberId],
        attributes: { outcomeKey: responsibility.outcomeKey, aiMode: responsibility.aiMode, title: humanKey(responsibility.outcomeKey) },
        source: { type: "responsibilities" },
        aliases: [humanKey(responsibility.outcomeKey)],
      });
    }
    if (records.responsibilities.length === 0) state("responsibilities", "who is responsible for what", "No responsibilities have been assigned yet.");
  }

  if (records.outcomes) {
    for (const outcome of records.outcomes.slice(0, MAX_PER_LIST)) {
      const finished = outcome.status === "met" || outcome.status === "missed" || outcome.status === "cancelled";
      add({
        domain: "outcomes",
        entityType: "outcome",
        entityId: outcome.id,
        summary: `${humanKey(outcome.outcomeKey)} is ${words(outcome.status)}${outcome.dueAt ? `, due ${dateOf(new Date(outcome.dueAt))}` : ""}${outcome.ownerMemberId ? `, ${name(outcome.ownerMemberId) ?? "someone"}'s` : ""}${outcome.riskLevel !== "none" && !finished ? ` (${outcome.riskLevel} risk)` : ""}.`,
        need: "how the household's outcomes are going",
        privacyClass: classForSubject(outcome.outcomeKey),
        subjectMemberIds: [outcome.ownerMemberId],
        attributes: { outcomeKey: outcome.outcomeKey, status: outcome.status, dueAt: outcome.dueAt, title: humanKey(outcome.outcomeKey) },
        source: { type: "outcomes", capturedAt: outcome.updatedAt },
        freshnessAt: outcome.updatedAt,
        freshness: finished ? "historical" : "current",
        confirmed: outcome.verificationSource === "member_confirmed",
        authority: outcome.verificationSource === "inferred" ? 1 : 3,
        validUntil: outcome.dueAt,
        aliases: [humanKey(outcome.outcomeKey)],
      });
    }
  }

  // --- What needs a person, and what was checked -----------------------------
  if (records.agenda) {
    const agenda = records.agenda;
    for (const need of agenda.needsYou.slice(0, MAX_PER_LIST)) {
      add({
        domain: "attention",
        entityType: "attention",
        entityId: need.subjectKey,
        summary: `Needs attention${need.riskLevel === "high" ? " (urgent)" : ""}: ${need.title} — ${need.reason}${need.dueOn ? ` (due ${need.dueOn})` : ""}${need.action ? `; suggested: ${need.action.action}` : ""}.`,
        need: "what needs attention",
        privacyClass: classForSubject(need.subjectKey),
        tier: 1,
        attributes: { title: need.title, dueOn: need.dueOn, riskLevel: need.riskLevel },
        source: { type: "agenda", sourceId: need.subjectKey },
        aliases: [need.title],
      });
    }
    if (agenda.needsYou.length > MAX_PER_LIST) state("attention", "what needs attention", `And ${agenda.needsYou.length - MAX_PER_LIST} more things need attention.`, "general", 1);
    if (agenda.checked > 0) {
      state(
        "attention",
        "what was checked",
        `WonderHome checked ${agenda.checked} things across ${agenda.handled.map((entry) => entry.title.toLowerCase()).join(", ") || "the household"} and ${agenda.needsYou.length === 0 ? "nothing needs anyone right now" : `${agenda.needsYou.length} need someone`}.`,
        "general",
        1,
      );
    }
    for (const label of agenda.unavailable) state("attention", "what could not be read", `${label} could not be read just now.`, "general", 1);
  }

  // --- Calendar ---------------------------------------------------------------
  if (records.events) {
    const upcoming = records.events.filter((event) => event.status !== "cancelled" && event.endsAt.getTime() >= options.now.getTime() - DAY_MS);
    for (const event of records.events) {
      const current = upcoming.includes(event);
      const who = event.participants.map((participant) => name(participant.memberId)).filter(Boolean);
      const participants = event.participants.map((participant) => participant.memberId);
      add({
        domain: "calendar",
        entityType: "event",
        entityId: event.id,
        summary: current
          ? `${event.title} (${words(event.kind)}) is on ${dateOf(event.startsAt)} at ${timeOf(event.startsAt)}${who.length > 0 ? `, with ${who.join(", ")}` : ""}${event.protected ? ", protected family time" : ""}${event.status === "proposed" ? ", not yet confirmed" : ""}${event.actionState && event.actionState !== "ready" ? `; ${words(event.actionState)}` : ""}.`
          : `${event.title} on ${dateOf(event.startsAt)} ${event.status === "cancelled" ? "was cancelled" : "has passed"}.`,
        need: "what is on the calendar",
        privacyClass: event.participants.some((participant) => isChild(participant.memberId)) ? "child" : "general",
        subjectMemberIds: participants,
        attributes: {
          title: event.title,
          kind: event.kind,
          date: isoDateIn(event.startsAt, options.timezone),
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          status: event.status,
          protected: event.protected,
        },
        source: { type: "family_events" },
        freshness: current ? "current" : "historical",
        validFrom: event.startsAt.toISOString(),
        validUntil: event.endsAt.toISOString(),
        tier: current ? 2 : 3,
        aliases: [event.title, words(event.kind)],
        // The same title for the same people on the same day is one event
        // entered twice — only one of them can be the current one.
        identityKey: `event:${tokensKey(event.title)}:${[...participants].sort().join(",")}:${isoDateIn(event.startsAt, options.timezone)}`,
      });
    }
    if (upcoming.length === 0) state("calendar", "what is on the calendar", `Nothing is on the family calendar for the next ${HORIZON_DAYS} days.`);
  }

  // --- Meals -------------------------------------------------------------------
  if (records.meals) {
    const planned = records.meals.filter((meal) => meal.onDate >= today);
    for (const meal of records.meals) {
      const current = meal.onDate >= today;
      const missing = meal.ingredients.filter((need) => need.essential && need.status !== "have" && need.status !== "substituted").map((need) => need.name);
      add({
        domain: "meals",
        entityType: "meal",
        entityId: meal.id,
        summary: `${capitalize(meal.slot)} on ${meal.onDate} is ${meal.name}, ready by ${timeOf(meal.readyBy)}, cooked by ${name(meal.cookMemberId) ?? "nobody yet"}; status ${words(meal.status)}${missing.length > 0 ? `; missing ${missing.join(", ")}` : ""}.`,
        need: "what is planned for meals",
        privacyClass: "general",
        subjectMemberIds: [meal.cookMemberId],
        attributes: { title: meal.name, slot: meal.slot, date: meal.onDate, cookMemberId: meal.cookMemberId, status: meal.status, missing },
        source: { type: "meals" },
        freshness: current ? "current" : "historical",
        tier: current ? 2 : 3,
        validUntil: meal.readyBy.toISOString(),
        aliases: [meal.name, meal.slot],
      });
    }
    if (planned.length === 0) state("meals", "what is planned for meals", "No meals are planned from today onwards.");
  }

  // --- Groceries and orders ----------------------------------------------------
  // Each item with what WonderHome actually knows about it — the same
  // judgement the Groceries screen shows — so "what should I order next" can
  // be answered, or honestly declined, item by item.
  if (records.consumables) {
    const supplies = records.consumables.slice(0, MAX_PER_LIST * 2);
    for (const item of records.consumables) {
      const spelled = supplies.includes(item);
      const kind = words(item.category);
      let summary: string;
      if (!item.lastPurchasedOn) {
        // Without a purchase on record there is nothing to count down from,
        // whatever the rate says — so say that, rather than "should last".
        const rate = item.daysPerUnit != null ? `typically ${item.typicalQuantity} ${item.unit} lasts about ${item.daysPerUnit} ${item.daysPerUnit === 1 ? "day" : "days"}` : "WonderHome does not know how fast it goes yet";
        summary = `${item.name} (${kind}): ${rate}. No purchase has been recorded yet, so when it runs out is unknown.`;
      } else {
        const assessment = assessConsumable(item, options.now);
        summary = `${item.name} (${kind}): ${assessment.reason.replace(/\.$/, "")}. Last bought ${item.lastPurchasedOn}${item.lastPurchasedQuantity ? ` (${item.lastPurchasedQuantity} ${item.unit})` : ""}.`;
      }
      add({
        domain: "groceries",
        entityType: "consumable",
        entityId: item.id,
        summary,
        need: "what groceries and supplies are tracked",
        privacyClass: "general",
        attributes: { title: item.name, category: item.category, unit: item.unit, lastPurchasedOn: item.lastPurchasedOn, petId: item.petId },
        source: { type: "consumables" },
        // A rate worked out from purchases is a learned belief and can go
        // stale; one the household stated or configured is not.
        confidence: item.daysPerUnit == null ? 0.5 : item.evidenceBasis === "purchase_history" ? 0.7 : 0.9,
        confirmed: item.daysPerUnit == null || item.evidenceBasis !== "purchase_history",
        freshnessAt: item.lastPurchasedOn ? `${item.lastPurchasedOn}T00:00:00.000Z` : nowIso,
        // Past the spelled-out budget an item is still known — resolvable by
        // name, never dropped — just not said unless it is asked about.
        tier: spelled ? 2 : 3,
        aliases: [item.name],
        relatedEntityIds: [item.petId],
        identityKey: `consumable:${tokensKey(item.name)}`,
      });
    }
    if (records.consumables.length > supplies.length) state("groceries", "what groceries and supplies are tracked", `And ${records.consumables.length - supplies.length} more items are tracked.`);
    if (records.consumables.length === 0) state("groceries", "what groceries and supplies are tracked", "No groceries or supplies are tracked yet.");
  }

  if (records.orders) {
    for (const order of records.orders) {
      const open = order.status !== "delivered" && order.status !== "cancelled" && order.status !== "failed";
      add({
        domain: "orders",
        entityType: "order",
        entityId: order.id,
        summary: open
          ? `An order with ${order.provider} is ${words(order.status)}${order.totalMinor > 0 ? ` for ${money(order.totalMinor, order.currency)}` : ""}${order.expectedAt ? `, expected ${dateOf(order.expectedAt)}` : ""}.`
          : `An order with ${order.provider} was ${words(order.status)}${order.deliveredAt ? ` on ${dateOf(order.deliveredAt)}` : ""}.`,
        need: open ? "what orders are open" : "what was bought before",
        privacyClass: "financial",
        attributes: { title: order.provider, status: order.status, amountMinor: order.totalMinor, currency: order.currency },
        source: { type: "orders", capturedAt: order.placedAt?.toISOString() ?? null },
        freshness: open ? "current" : "historical",
        tier: open ? 2 : 3,
        aliases: [order.provider, "order"],
      });
    }
  }

  // --- Bills ------------------------------------------------------------------
  if (records.obligations) {
    const open = records.obligations.filter((bill) => bill.status !== "paid" && bill.status !== "cancelled");
    for (const bill of records.obligations) {
      const current = open.includes(bill);
      add({
        domain: "bills",
        entityType: "bill",
        entityId: bill.id,
        summary: current
          ? `${bill.name} (${words(bill.kind)}${bill.payee ? `, ${bill.payee}` : ""}) is ${words(bill.status)}${bill.amountMinor != null && bill.currency ? `, ${money(bill.amountMinor, bill.currency)}` : ""}${bill.dueOn ? `, due ${bill.dueOn}` : ""}${bill.responsibleMemberId ? `, ${name(bill.responsibleMemberId)}'s to handle` : ""}${bill.requiresReview ? "; needs a review" : ""}.`
          : `${bill.name}${bill.payee ? ` (${bill.payee})` : ""} is ${words(bill.status)}${bill.dueOn ? `; it was due ${bill.dueOn}` : ""}.`,
        need: current ? "what bills are due" : "what bills were paid",
        privacyClass: "financial",
        subjectMemberIds: [bill.responsibleMemberId],
        attributes: { title: bill.name, kind: bill.kind, payee: bill.payee, amountMinor: bill.amountMinor, currency: bill.currency, dueOn: bill.dueOn, date: bill.dueOn, status: bill.status },
        source: { type: "obligations" },
        freshness: current ? "current" : "historical",
        tier: current ? 2 : 3,
        validUntil: bill.dueOn,
        aliases: [bill.name, bill.payee, `${bill.name} bill`, words(bill.kind)],
      });
    }
    if (open.length === 0 && records.obligations.length > 0) state("bills", "what bills are due", "Every bill on record is paid or cancelled.", "financial");
    if (records.obligations.length === 0) state("bills", "what bills are due", "No bills are on record yet.", "financial");
  }

  // --- School -------------------------------------------------------------------
  if (records.schoolItems) {
    for (const item of records.schoolItems) {
      const open = item.status !== "done" && item.status !== "submitted" && item.status !== "cancelled";
      add({
        domain: "school",
        entityType: "school_item",
        entityId: item.id,
        summary: open
          ? `${name(item.childMemberId) ?? "A child"} has ${words(item.kind)}: ${item.title}${item.subject ? ` (${item.subject})` : ""}${item.dueAt ? `, due ${dateOf(item.dueAt)}` : ""}, ${words(item.status)}${item.estimatedMinutes ? `, about ${item.estimatedMinutes} minutes` : ""}.`
          : `${name(item.childMemberId) ?? "A child"}'s ${words(item.kind)} ${item.title} is ${words(item.status)}.`,
        need: "what school work is open",
        privacyClass: "child",
        subjectMemberIds: [item.childMemberId],
        attributes: {
          title: item.title,
          kind: item.kind,
          subject: item.subject,
          date: item.dueAt ? isoDateIn(item.dueAt, options.timezone) : null,
          dueAt: item.dueAt?.toISOString() ?? null,
          status: item.status,
          childMemberId: item.childMemberId,
        },
        source: { type: "school_items", sourceId: item.id },
        confirmed: item.provider === null || item.estimateSource === "member_confirmed",
        authority: item.provider ? 2 : 3,
        freshness: open ? "current" : "historical",
        tier: open ? 2 : 3,
        validUntil: item.dueAt?.toISOString() ?? null,
        aliases: [item.title, item.subject, words(item.kind), item.subject ? `${item.subject} ${words(item.kind)}` : null],
        identityKey: item.provider && item.externalId ? `school:${item.provider}:${item.externalId}` : undefined,
      });
    }
  }
  if (records.communications) {
    for (const note of records.communications.filter((entry) => entry.requiresAction).slice(0, MAX_PER_LIST)) {
      add({
        domain: "school",
        entityType: "school_communication",
        entityId: note.id,
        summary: `The school asked${note.childMemberId ? ` about ${name(note.childMemberId)}` : ""}: ${note.subject ?? note.summary}${note.actionLabel ? ` — ${note.actionLabel}` : ""}${note.actionDueAt ? `, by ${dateOf(note.actionDueAt)}` : ""}.`,
        need: "what the school asked for",
        privacyClass: "child",
        subjectMemberIds: [note.childMemberId],
        attributes: { title: note.subject ?? note.summary, date: note.actionDueAt ? isoDateIn(note.actionDueAt, options.timezone) : null },
        source: { type: "school_communications", capturedAt: note.receivedAt.toISOString() },
        freshnessAt: note.receivedAt.toISOString(),
        authority: 2,
        validUntil: note.actionDueAt?.toISOString() ?? null,
        aliases: [note.subject, note.actionLabel],
      });
    }
  }

  // --- Absences -------------------------------------------------------------------
  if (records.absences) {
    for (const absence of records.absences.filter((entry) => !entry.available).slice(0, MAX_PER_LIST)) {
      add({
        domain: "absences",
        entityType: "absence",
        entityId: `${absence.memberId}:${absence.onDate}`,
        summary: `${name(absence.memberId) ?? "Someone"} is away on ${absence.onDate}${absence.reason ? ` (${absence.reason})` : ""}.`,
        need: "who is away",
        privacyClass: "location",
        subjectMemberIds: [absence.memberId],
        attributes: { date: absence.onDate, memberId: absence.memberId },
        source: { type: "availability_exceptions", sourceId: null },
        validFrom: absence.onDate,
        validUntil: absence.onDate,
      });
    }
  }

  // --- Home, laundry and pet care ---------------------------------------------------
  if (records.assets) {
    for (const asset of records.assets.filter((entry) => entry.status === "active")) {
      const nextService = asset.serviceIntervalDays && asset.lastServicedOn ? addDays(asset.lastServicedOn, asset.serviceIntervalDays) : null;
      add({
        domain: "home",
        entityType: "home_asset",
        entityId: asset.id,
        summary: `${asset.name} (${words(asset.category)}${asset.location ? `, ${asset.location}` : ""})${nextService ? ` is next due a service on ${nextService}` : asset.serviceIntervalDays ? " has never been serviced on record" : " needs no regular service"}${asset.responsibleMemberId ? `, ${name(asset.responsibleMemberId)}'s to deal with` : ""}.`,
        need: "what in the home needs looking after",
        privacyClass: "general",
        subjectMemberIds: [asset.responsibleMemberId],
        attributes: { title: asset.name, category: asset.category, date: nextService, warrantyExpiresOn: asset.warrantyExpiresOn },
        source: { type: "home_assets" },
        tier: 3,
        aliases: [asset.name, words(asset.category), asset.location],
      });
    }
  }
  if (records.serviceRequests) {
    for (const request of records.serviceRequests) {
      const open = request.status !== "completed" && request.status !== "cancelled";
      add({
        domain: "home",
        entityType: "service_request",
        entityId: request.id,
        summary: `A ${request.subject} service request is ${words(request.status)}${request.providerName ? ` with ${request.providerName}` : ""}${request.scheduledFor ? `, scheduled for ${dateOf(request.scheduledFor)}` : ""}${request.nextAction ? `; next: ${request.nextAction}${request.nextActionBy ? ` (${request.nextActionBy === "household" ? "the household's move" : "the provider's move"})` : ""}` : ""}.`,
        need: "what repairs and services are in progress",
        privacyClass: "general",
        attributes: { title: request.subject, status: request.status, date: request.scheduledFor ? isoDateIn(request.scheduledFor, options.timezone) : null },
        source: { type: "service_requests", capturedAt: request.updatedAt.toISOString() },
        freshnessAt: request.updatedAt.toISOString(),
        freshness: open ? "current" : "historical",
        tier: open ? 2 : 3,
        aliases: [request.subject, request.providerName],
        relatedEntityIds: [request.assetId],
      });
    }
  }
  if (records.laundry) {
    for (const need of records.laundry) {
      add({
        domain: "laundry",
        entityType: "laundry_need",
        entityId: need.id,
        summary: `${need.label} is ${need.state === "unknown" ? "in an unknown state" : words(need.state)} and needed by ${dateOf(need.neededBy)} at ${timeOf(need.neededBy)}.`,
        need: "what laundry is needed",
        privacyClass: isChild(need.forMemberId) ? "child" : "general",
        subjectMemberIds: [need.forMemberId],
        attributes: { title: need.label, state: need.state, date: isoDateIn(need.neededBy, options.timezone) },
        source: { type: "laundry_needs", capturedAt: need.stateAsOf?.toISOString() ?? null },
        // Laundry state is observed, not stated: as old as the observation.
        freshnessAt: need.stateAsOf?.toISOString() ?? nowIso,
        confirmed: false,
        authority: 1,
        freshness: need.stateAsOf ? "current" : "unknown",
        validUntil: need.neededBy.toISOString(),
        aliases: [need.label],
      });
    }
  }
  if (records.petCare) {
    for (const need of records.petCare) {
      const nextDue = need.dueOn ?? (need.lastDoneOn && need.intervalDays ? addDays(need.lastDoneOn, need.intervalDays) : null);
      add({
        domain: "pet_care",
        entityType: "pet_care_need",
        entityId: need.id,
        summary: `${need.pet.name}'s ${words(need.kind)}${nextDue ? ` is next due ${nextDue}` : need.intervalDays ? ` comes round every ${need.intervalDays} days` : " has no date yet"}${need.supplyDaysRemaining != null ? `, with about ${need.supplyDaysRemaining} days of supplies left` : ""}${need.responsibleMemberId ? `, ${name(need.responsibleMemberId)}'s to handle` : ""}.`,
        need: "how the pets are looked after",
        privacyClass: "general",
        subjectMemberIds: [need.responsibleMemberId],
        attributes: { title: `${need.pet.name} ${words(need.kind)}`, kind: need.kind, date: nextDue, petId: need.pet.id },
        source: { type: "pet_care_needs" },
        aliases: [need.pet.name, words(need.kind)],
        relatedEntityIds: [need.pet.id],
      });
    }
  }

  // --- Health -------------------------------------------------------------------
  // Only ever populated when the reader holds `health.manage`, and each row
  // only when RLS (`wh.may_see_health`) already let this person see it. An
  // absent list means "not gathered", so nothing here ever claims a
  // household has no health items when it simply never looked.
  if (records.healthAppointments) {
    for (const appointment of records.healthAppointments) {
      const startsAt = new Date(appointment.startsAt);
      const open = appointment.status === "proposed" || appointment.status === "confirmed";
      const typeWord = words(appointment.appointmentType);
      add({
        domain: "health",
        entityType: "health_appointment",
        entityId: appointment.id,
        summary: open
          ? `${name(appointment.memberId) ?? "Someone"} has a ${typeWord} appointment on ${dateOf(startsAt)} at ${timeOf(startsAt)}${appointment.provider ? ` with ${appointment.provider}` : ""}, ${appointment.status}.`
          : `${name(appointment.memberId) ?? "Someone"}'s ${typeWord} appointment on ${dateOf(startsAt)} was ${appointment.status}.`,
        need: "what health appointments are coming up",
        privacyClass: "health",
        healthScope: appointment.privacyScope,
        subjectMemberIds: [appointment.memberId],
        attributes: { title: `${typeWord} appointment`, appointmentType: appointment.appointmentType, date: isoDateIn(startsAt, options.timezone), startsAt: appointment.startsAt, status: appointment.status, provider: appointment.provider },
        source: { type: "health_appointments", capturedAt: appointment.updatedAt },
        freshnessAt: appointment.updatedAt,
        freshness: open ? "current" : appointment.status === "rescheduled" ? "superseded" : "historical",
        tier: open ? 2 : 3,
        validFrom: appointment.startsAt,
        validUntil: appointment.endsAt ?? appointment.startsAt,
        aliases: [`${typeWord} appointment`, appointment.provider, "appointment"],
        relatedEntityIds: [appointment.rescheduledFromId, appointment.checkupId],
      });
    }
    // A rescheduled appointment is replaced by the row that points back at it.
    for (const appointment of records.healthAppointments) {
      if (!appointment.rescheduledFromId) continue;
      const previous = items.find((entry) => entry.id === `health_appointment:${appointment.rescheduledFromId}`);
      if (previous) {
        previous.freshness = "superseded";
        previous.supersededBy = `health_appointment:${appointment.id}`;
      }
    }
  }
  if (records.healthIssues) {
    for (const issue of records.healthIssues) {
      const open = issue.status === "mentioned" || issue.status === "active" || issue.status === "monitoring";
      add({
        domain: "health",
        entityType: "health_issue",
        entityId: issue.id,
        summary: open
          ? `${name(issue.memberId) ?? "Someone"} has an open health note: ${issue.label} (${issue.status}), since ${dateOf(new Date(issue.startedAt))}.`
          : `${name(issue.memberId) ?? "Someone"}'s health note ${issue.label} is ${issue.status}.`,
        need: "what health issues are open",
        privacyClass: "health",
        healthScope: issue.privacyScope,
        subjectMemberIds: [issue.memberId],
        attributes: { title: issue.label, status: issue.status, date: issue.startedAt.slice(0, 10) },
        source: { type: "health_issues", capturedAt: issue.updatedAt },
        freshnessAt: issue.updatedAt,
        freshness: open ? "current" : "historical",
        tier: open ? 2 : 3,
        aliases: [issue.label],
      });
    }
  }
  if (records.healthCheckups) {
    for (const checkup of records.healthCheckups) {
      const urgency = classifyCheckup(checkup, options.now);
      add({
        domain: "health",
        entityType: "health_checkup",
        entityId: checkup.id,
        summary:
          urgency === "silent"
            ? `${name(checkup.memberId) ?? "Someone"}'s ${checkup.label} is next due ${checkup.nextDueOn}.`
            : `${name(checkup.memberId) ?? "Someone"}'s ${checkup.label} is ${urgency === "overdue" ? "overdue" : "due soon"} (${checkup.nextDueOn}).`,
        need: "what checkups are due",
        privacyClass: "health",
        healthScope: checkup.privacyScope,
        subjectMemberIds: [checkup.memberId],
        attributes: { title: checkup.label, date: checkup.nextDueOn, urgency, status: checkup.status },
        source: { type: "health_checkups", capturedAt: checkup.updatedAt },
        freshnessAt: checkup.updatedAt,
        // Only a checkup that is due or overdue is worth saying unprompted.
        tier: urgency === "silent" ? 3 : 2,
        aliases: [checkup.label, "checkup"],
      });
    }
  }
  if (records.healthRecords) {
    for (const record of records.healthRecords.filter((entry) => entry.status === "active")) {
      add({
        domain: "health",
        entityType: "health_record",
        entityId: record.id,
        summary: `${name(record.memberId) ?? "Someone"} has a ${words(record.recordType)} on file: ${record.label}${record.documentDate ? `, dated ${record.documentDate}` : ""}.`,
        need: "which health documents are on file",
        privacyClass: "health",
        healthScope: record.privacyScope,
        subjectMemberIds: [record.memberId],
        attributes: { title: record.label, recordType: record.recordType, date: record.documentDate },
        source: { type: "health_records", capturedAt: record.createdAt },
        freshnessAt: record.updatedAt,
        tier: 3,
        aliases: [record.label, words(record.recordType)],
      });
    }
  }
  if (records.vitals) {
    for (const vital of records.vitals.filter((entry) => entry.status === "active").slice(0, MAX_PER_LIST)) {
      const reading = vital.secondaryValue != null ? `${vital.value}/${vital.secondaryValue} ${vital.unit}` : `${vital.value} ${vital.unit}`;
      const label = vital.vitalType === "custom" ? (vital.customLabel ?? "a measurement") : words(vital.vitalType);
      add({
        domain: "health",
        entityType: "health_vital",
        entityId: vital.id,
        summary: `${name(vital.memberId) ?? "Someone"}'s ${label} was ${reading} on ${dateOf(new Date(vital.measuredAt))}.`,
        need: "what health readings were recorded",
        privacyClass: "health",
        healthScope: vital.privacyScope,
        subjectMemberIds: [vital.memberId],
        attributes: { title: label, vitalType: vital.vitalType, date: vital.measuredAt.slice(0, 10) },
        source: { type: "health_vitals", capturedAt: vital.measuredAt },
        freshnessAt: vital.measuredAt,
        tier: 3,
        aliases: [label],
      });
    }
  }
  if (records.fitnessGoals) {
    for (const goal of records.fitnessGoals.filter((entry) => entry.status === "active")) {
      const activity = goal.activityType === "other" ? (goal.customLabel ?? "activity") : FITNESS_ACTIVITY_LABEL[goal.activityType].toLowerCase();
      add({
        domain: "health",
        entityType: "fitness_goal",
        entityId: goal.id,
        summary: `${name(goal.memberId) ?? "Someone"} aims for ${activity} ${goal.targetCount} time${goal.targetCount === 1 ? "" : "s"} a ${goal.frequencyPeriod}.`,
        need: "what fitness goals are set",
        privacyClass: "health",
        healthScope: goal.privacyScope,
        subjectMemberIds: [goal.memberId],
        attributes: { title: activity, targetCount: goal.targetCount, frequencyPeriod: goal.frequencyPeriod },
        source: { type: "health_fitness_goals", capturedAt: goal.updatedAt },
        freshnessAt: goal.updatedAt,
        tier: 3,
        aliases: [activity],
      });
    }
  }

  // --- What the household has said ----------------------------------------------
  if (records.memories) {
    for (const memory of records.memories.slice(0, MAX_PER_LIST * 2)) {
      const about = memory.scope === "member" ? name(memory.memberId) : null;
      const confirmed = memory.status === "confirmed";
      add({
        domain: "preferences",
        entityType: "memory",
        entityId: memory.id ?? `${memory.scope}:${memory.memberId ?? "household"}:${memory.key}:${memory.status}`,
        summary: `${about ? `${about}: ` : ""}${humanKey(memory.key)} — ${describeValue(memory.value)}${confirmed ? " (confirmed)" : ""}.`,
        need: "what the household prefers",
        privacyClass: memory.scope === "member" && isChild(memory.memberId) ? "child" : "general",
        subjectMemberIds: [memory.memberId],
        attributes: { key: memory.key, value: memory.value, status: memory.status, category: memory.category, title: humanKey(memory.key) },
        source: { type: memory.sourceType ? `memories (${memory.sourceType})` : "memories", sourceId: memory.sourceId ?? memory.id ?? null, capturedAt: memory.updatedAt ?? memory.createdAt ?? null },
        confidence: memory.confidence ?? (confirmed ? 1 : 0.6),
        confirmed,
        // A confirmed fact is canonical; a learned one is an inference.
        authority: confirmed ? 3 : memory.sourceType === "conversation" ? 2 : 1,
        freshnessAt: memory.updatedAt ?? memory.createdAt ?? nowIso,
        // A preference still held is how the home works today; only a
        // superseded one (freshness.ts) becomes history.
        tier: 2,
        aliases: [humanKey(memory.key)],
        identityKey: `memory:${memory.scope}:${memory.memberId ?? "household"}:${memory.key}`,
      });
    }
  }

  // --- Notifications, HomeSend, HomeTalk, agents, integrations --------------------
  if (records.notifications) {
    for (const notice of records.notifications.slice(0, MAX_PER_LIST)) {
      const open = notice.status !== "acted" && notice.status !== "resolved" && notice.status !== "expired";
      add({
        domain: "notifications",
        entityType: "notification",
        entityId: notice.id,
        summary: open ? `Waiting for the person asking: ${notice.title} — ${notice.body}` : `Earlier notice: ${notice.title} (${notice.status}).`,
        need: "what the person asking has been told",
        privacyClass: classForSubject(notice.threadKey),
        subjectMemberIds: [options.viewerMemberId],
        attributes: { title: notice.title, status: notice.status, priority: notice.priority },
        source: { type: "notifications", capturedAt: notice.createdAt },
        freshnessAt: notice.createdAt,
        freshness: open ? "current" : "historical",
        tier: open ? 2 : 3,
        aliases: [notice.title],
      });
    }
  }
  if (records.homeSendItems) {
    for (const item of records.homeSendItems.slice(0, MAX_PER_LIST)) {
      const title = item.extracted?.title ?? null;
      const kind = item.classifiedKind && item.classifiedKind !== "unknown" ? words(item.classifiedKind) : "something WonderHome could not read";
      add({
        domain: "homesend",
        entityType: "homesend_item",
        entityId: item.id,
        summary: `Something sent to HomeSend on ${dateOf(new Date(item.createdAt))} was read as ${kind}${title ? `: ${title}` : ""}${item.status === "routed" ? ", and added" : item.status === "dismissed" ? ", and set aside" : item.status === "undone" ? ", and later undone" : ", and is waiting for someone to confirm it"}.`,
        need: "what was sent in to HomeSend",
        privacyClass: homeSendClass(item.classifiedKind),
        subjectMemberIds: [item.createdByMemberId],
        attributes: { title, kind: item.classifiedKind, status: item.status, routedTable: item.routedTable, routedId: item.routedId, date: item.extracted?.dueDate ?? null },
        source: { type: `homesend (${item.source})`, sourceId: item.id, capturedAt: item.createdAt },
        freshnessAt: item.createdAt,
        // Extracted source content: never more authoritative than the record it became.
        authority: 0,
        confirmed: item.status === "routed",
        freshness: item.status === "received" || item.status === "classified" ? "current" : "historical",
        tier: item.status === "received" || item.status === "classified" ? 2 : 3,
        aliases: [title],
        relatedEntityIds: [item.routedId],
      });
    }
  }
  if (records.proposals) {
    for (const proposal of records.proposals.slice(0, MAX_PER_LIST)) {
      const waiting = proposal.status === "proposed";
      add({
        domain: "hometalk",
        entityType: "proposal",
        entityId: proposal.id,
        summary: `${waiting ? "Waiting for a yes" : `Earlier, ${words(proposal.status)}`}: ${proposal.summary ?? humanKey(proposal.actionType)}.`,
        need: waiting ? "what is waiting for a decision" : "what was asked for earlier",
        privacyClass: proposalClass(proposal.actionType),
        subjectMemberIds: [typeof proposal.parameters.memberId === "string" ? proposal.parameters.memberId : null],
        attributes: { title: proposal.summary ?? humanKey(proposal.actionType), actionType: proposal.actionType, status: proposal.status, outcomeKey: proposal.outcomeKey, parameters: proposal.parameters },
        source: { type: "conversation_actions", capturedAt: proposal.createdAt },
        freshnessAt: proposal.createdAt,
        confirmed: proposal.status === "approved" || proposal.status === "executed",
        freshness: waiting ? "current" : "historical",
        tier: waiting ? 1 : 3,
        aliases: [proposal.summary],
      });
    }
  }
  if (records.agentRuns) {
    for (const run of records.agentRuns.slice(0, 5)) {
      add({
        domain: "agents",
        entityType: "agent_run",
        entityId: run.id,
        summary: `A household check ${run.status === "running" ? "is running" : `ended ${words(run.status)}`} (started ${dateOf(new Date(run.startedAt))})${run.summary ? `: ${run.summary}` : ""}.`,
        need: "what WonderHome's agents did",
        privacyClass: "general",
        attributes: { status: run.status, agentType: run.agentType },
        source: { type: "agent_runs", capturedAt: run.finishedAt ?? run.startedAt },
        freshnessAt: run.finishedAt ?? run.startedAt,
        freshness: run.status === "running" || run.status === "waiting_for_approval" ? "current" : "historical",
        tier: 3,
      });
    }
  }
  if (records.integrations) {
    for (const integration of records.integrations) {
      add({
        domain: "integrations",
        entityType: "integration",
        entityId: integration.id,
        summary: `The ${words(integration.kind)} connection (${integration.provider}) is ${integration.statusLabel.toLowerCase()}${integration.lastSuccessAt ? `, last worked ${dateOf(integration.lastSuccessAt)}` : ""}${integration.needsAttention ? " — it needs someone to reconnect it" : ""}.`,
        need: "which outside accounts are connected",
        privacyClass: "general",
        attributes: { kind: integration.kind, provider: integration.provider, status: integration.status },
        source: { type: "integrations", capturedAt: integration.lastSyncAt?.toISOString() ?? null },
        freshnessAt: integration.lastSuccessAt?.toISOString() ?? nowIso,
        freshness: integration.lastSuccessAt ? "current" : "unknown",
        tier: integration.needsAttention ? 2 : 3,
        aliases: [integration.provider, words(integration.kind)],
      });
    }
  }

  return items;
}

/** A person as a caller already holds them — enough for the resolver, without a full member read. */
export type PersonLike = {
  id: string;
  displayName: string;
  memberType?: "adult" | "child" | "helper";
  nickname?: string | null;
  relationship?: string | null;
  dateOfBirth?: string | null;
  occupation?: string | null;
};

/** People as the member items the resolver reads — the same shape and aliases `buildContextItems` gives them. */
export function personItems(people: readonly PersonLike[], options: Pick<BuildOptions, "householdId" | "now">): HouseholdContextItem[] {
  return buildContextItems(
    {
      members: people.map((person) => ({
        id: person.id,
        displayName: person.displayName,
        memberType: person.memberType ?? "adult",
        status: "active" as const,
        roles: [],
        isOwner: false,
        dateOfBirth: person.dateOfBirth ?? null,
        nickname: person.nickname ?? null,
        relationship: person.relationship ?? null,
        occupation: person.occupation ?? null,
        schoolOrWorkLocation: null,
        specialOccasionLabel: null,
        specialOccasionDate: null,
        avatarUrl: null,
      })),
    },
    { householdId: options.householdId, householdName: "", timezone: "UTC", now: options.now, viewerMemberId: "" },
  ).filter((item) => item.entityType === "member");
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

function roleWord(role: string): string {
  return role === "head" || role === "administrator" ? "an Admin" : "";
}

function autonomyWord(mode: string): string {
  switch (mode) {
    case "execute":
      return "act on its own";
    case "approve":
      return "act once approved";
    case "prepare":
      return "prepare but not act";
    default:
      return "only observe";
  }
}

/** The consent class a subject key implies: a bill is money, homework is a child's. */
export function classForSubject(subjectKey: string): PrivacyClass {
  if (/^(?:bill|obligation|finance|payment|order)/i.test(subjectKey)) return "financial";
  if (/^(?:school|homework|child)/i.test(subjectKey)) return "child";
  if (/^(?:health|appointment|checkup|vital)/i.test(subjectKey)) return "health";
  return "general";
}

function homeSendClass(kind: string | null): PrivacyClass {
  switch (kind) {
    case "bill":
      return "financial";
    case "school_item":
      return "child";
    case "health_document":
      return "health";
    default:
      return "general";
  }
}

function proposalClass(actionType: string): PrivacyClass {
  if (/health|vital|fitness/.test(actionType)) return "health";
  if (/payment|order/.test(actionType)) return "financial";
  if (actionType === "record_absence") return "location";
  return "general";
}

const SPECIES_ALIASES: Record<string, string[]> = {
  dog: ["doggy", "doggie", "pup", "puppy"],
  cat: ["kitty", "kitten", "cat"],
  bird: ["birdie", "parrot"],
  fish: ["fishes"],
};

function speciesAliases(species: string): string[] {
  return SPECIES_ALIASES[species.toLowerCase()] ?? [];
}

function firstName(displayName: string): string {
  return displayName.split(/\s+/)[0] ?? displayName;
}

function tokensKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}
