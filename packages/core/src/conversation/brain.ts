import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContextCandidate } from "../ai/privacy";
import type { Consumable } from "../commerce/consumables";
import type { Order } from "../commerce/orders";
import { buildContextItems, type AgendaInput } from "../context/builders";
import { applyFreshness } from "../context/freshness";
import { invalidateHouseholdContext } from "../context/invalidation";
import { loadHouseholdContext, type ContextSnapshot } from "../context/repository";
import { factsForQuestion } from "../context/retrieval";
import type { FamilyEvent } from "../family/schedule";
import type { Obligation } from "../finance/payments";
import type { HealthAppointment } from "../health/appointments";
import type { HealthCheckup } from "../health/checkups";
import type { HealthIssue } from "../health/issues";
import type { ResponsibilityRow } from "../household/configuration-repository";
import type { HouseholdMember } from "../identity/households";
import type { PersonalView } from "../identity/views";
import type { Meal } from "../meals/meals";
import type { SchoolCommunication } from "../school/communications";
import type { SchoolItem } from "../school/items";

export { describeLocalNow, formatDate, formatTime, humanKey, isoDateIn } from "../context/format";
export { CONTEXT_TTL_MS, householdMemory } from "../context/invalidation";

/**
 * HomeBrain's working memory (product-direction v4 §5), now drawn from the
 * Household Context Engine (Wave 1).
 *
 * What used to be gathered and phrased here — every domain read through the
 * member's own client, each fact labelled with the consent class the gate
 * decides on — is the context engine's job, shared with HomeTalk and
 * HomeSend. This file keeps HomeBrain's contract exactly: the same facts in
 * the same words, the same content classes, the same short memory, and the
 * same "forget it the moment anything changes". What changes is that an
 * answer no longer gets the whole home — `factsFor` sends what the question
 * needs, and marks the rest not relevant so the gate can say so.
 *
 * The facts carry real names. The gate replaces them with placeholders on
 * the way out, and puts them back on the way in; nothing here needs to know.
 */

export type BrainAgenda = AgendaInput;

export type Memory = {
  scope: "household" | "member";
  memberId: string | null;
  category: string;
  key: string;
  value: unknown;
  status: string;
};

export type Absence = { memberId: string; onDate: string; available: boolean; reason: string | null };

export type BrainSnapshot = {
  householdName: string;
  timezone: string;
  now: Date;
  viewer: { memberId: string; roleLabel: string; tone: PersonalView["tone"] };
  members: readonly HouseholdMember[];
  responsibilities: readonly ResponsibilityRow[];
  events: readonly FamilyEvent[];
  meals: readonly Meal[];
  consumables: readonly Consumable[];
  orders: readonly Order[];
  obligations: readonly Obligation[];
  schoolItems: readonly SchoolItem[];
  communications: readonly SchoolCommunication[];
  memories: readonly Memory[];
  absences: readonly Absence[];
  healthAppointments: readonly HealthAppointment[];
  healthIssues: readonly HealthIssue[];
  healthCheckups: readonly HealthCheckup[];
  agenda: BrainAgenda;
};

export type HouseholdContext = {
  /** Every current fact, in HomeBrain's order — the whole home, before a question narrows it. */
  facts: ContextCandidate[];
  /** Domains that could not be read, for the honest line at the end of an answer. */
  unavailable: string[];
  gatheredAt: Date;
  /** The engine's snapshot, for relevance, resolution and matching. */
  snapshot: ContextSnapshot;
};

/** Anything the conversation changes forgets what was read about the household. */
export const forgetHouseholdContext = invalidateHouseholdContext;

/** A snapshot of records as HomeBrain's facts — the engine's own builders, with nothing read. */
export function factsFrom(snapshot: BrainSnapshot): ContextCandidate[] {
  const items = buildContextItems(
    {
      members: snapshot.members,
      responsibilities: snapshot.responsibilities,
      events: snapshot.events,
      meals: snapshot.meals,
      consumables: snapshot.consumables,
      orders: snapshot.orders,
      obligations: snapshot.obligations,
      schoolItems: snapshot.schoolItems,
      communications: snapshot.communications,
      memories: snapshot.memories,
      absences: snapshot.absences,
      healthAppointments: snapshot.healthAppointments,
      healthIssues: snapshot.healthIssues,
      healthCheckups: snapshot.healthCheckups,
      agenda: snapshot.agenda,
    },
    { householdId: "snapshot", householdName: snapshot.householdName, timezone: snapshot.timezone, now: snapshot.now, viewerMemberId: snapshot.viewer.memberId },
  );
  return factsForQuestion({ items: applyFreshness(items, snapshot.now) }, null);
}

export type BrainInput = {
  householdId: string;
  householdName: string;
  timezone: string;
  viewer: PersonalView;
  agenda: BrainAgenda;
  now?: Date;
};

/** Everything this member may know about the home — read once through the engine, kept briefly. */
export async function householdContext(supabase: SupabaseClient, input: BrainInput): Promise<HouseholdContext> {
  const snapshot = await loadHouseholdContext(
    supabase,
    {
      householdId: input.householdId,
      householdName: input.householdName,
      timezone: input.timezone,
      now: input.now ?? new Date(),
      viewer: { memberId: input.viewer.memberId, permissions: input.viewer.permissions, tone: input.viewer.tone, guardianOf: [] },
    },
    { agenda: input.agenda },
  );
  return { facts: factsForQuestion(snapshot, null), unavailable: snapshot.unavailable, gatheredAt: snapshot.gatheredAt, snapshot };
}

/** The facts one question needs — relevant ones first, everything else marked not relevant for the gate. */
export function factsFor(context: HouseholdContext, question: string): ContextCandidate[] {
  return factsForQuestion(context.snapshot, question);
}
