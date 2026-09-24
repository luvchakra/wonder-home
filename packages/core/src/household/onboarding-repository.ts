import type { SupabaseClient } from "@supabase/supabase-js";

import { listPets } from "../home/repository";
import { listMembers, type HouseholdMember } from "../identity/households";
import { log } from "../observability/logger";
import { listEnrolments } from "../school/enrolments";
import type { ConfigMember } from "./configuration";
import { listResponsibilities, savePlaybookItem, saveResponsibility } from "./configuration-repository";
import {
  clampComposition,
  ONBOARDING_STEPS,
  suggestResponsibilities,
  type Composition,
  type HouseholdProfile,
  type OnboardingFacts,
  type OnboardingStatus,
  type OnboardingStep,
  type SuggestedResponsibility,
} from "./onboarding";

/**
 * Reading and writing setup (story 02-009).
 *
 * Only `household_onboarding` and `onboarding_events` are onboarding's own.
 * Everything else read here is the household's real data, through the same
 * list functions every module uses, and every write goes through the domain's
 * own validated, audited function — so what setup records is immediately what
 * the household has, for HomeBrain, planners and every screen alike.
 */

type Row = Record<string, unknown>;

export type OnboardingState = {
  status: OnboardingStatus;
  step: OnboardingStep;
  composition: Composition;
  dismissed: string[];
  startedAt: string;
  completedAt: string | null;
};

function toState(row: Row): OnboardingState {
  const step = String(row.step);
  return {
    status: row.status as OnboardingStatus,
    step: (ONBOARDING_STEPS as readonly string[]).includes(step) ? (step as OnboardingStep) : "welcome",
    composition: clampComposition({ adults: row.adults, children: row.children, pets: row.pets, helpers: row.helpers }),
    dismissed: (row.dismissed_suggestions as string[] | null) ?? [],
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

const STATE_SELECT = "status, step, adults, children, pets, helpers, dismissed_suggestions, started_at, completed_at";

export async function loadOnboarding(supabase: SupabaseClient, householdId: string): Promise<OnboardingState | null> {
  const { data, error } = await supabase.from("household_onboarding").select(STATE_SELECT).eq("household_id", householdId).maybeSingle();
  if (error) throw new Error(`loadOnboarding failed: ${error.code ?? "unknown"}`);
  return data ? toState(data as Row) : null;
}

/** Begins setup for a household — or does nothing if it already began. Safe to call twice. */
export async function startOnboarding(supabase: SupabaseClient, input: { householdId: string; memberId: string }): Promise<OnboardingState> {
  const { error } = await supabase
    .from("household_onboarding")
    .upsert({ household_id: input.householdId, updated_by_member_id: input.memberId }, { onConflict: "household_id", ignoreDuplicates: true });
  if (error) throw new Error(`startOnboarding failed: ${error.code ?? "unknown"}`);
  const state = await loadOnboarding(supabase, input.householdId);
  if (!state) throw new Error("startOnboarding failed: no row");
  return state;
}

export async function updateOnboarding(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    memberId: string;
    status?: OnboardingStatus;
    step?: OnboardingStep;
    composition?: Composition;
    dismiss?: string | readonly string[];
  },
): Promise<void> {
  const patch: Row = { updated_by_member_id: input.memberId };
  if (input.status) {
    patch.status = input.status;
    if (input.status === "deferred") patch.deferred_at = new Date().toISOString();
    if (input.status === "completed") patch.completed_at = new Date().toISOString();
  }
  if (input.step) patch.step = input.step;
  if (input.composition) Object.assign(patch, input.composition);
  const dismiss = typeof input.dismiss === "string" ? [input.dismiss] : (input.dismiss ?? []);
  if (dismiss.length > 0) {
    const current = await loadOnboarding(supabase, input.householdId);
    const dismissed = new Set(current?.dismissed ?? []);
    for (const key of dismiss) dismissed.add(key);
    patch.dismissed_suggestions = [...dismissed].slice(-200);
  }
  const { error } = await supabase.from("household_onboarding").update(patch).eq("household_id", input.householdId);
  if (error) throw new Error(`updateOnboarding failed: ${error.code ?? "unknown"}`);
}

export type OnboardingEvent =
  | "onboarding_started"
  | "household_composition_completed"
  | "member_added"
  | "pet_added"
  | "helper_added"
  | "responsibility_suggestions_generated"
  | "responsibility_accepted"
  | "responsibility_modified"
  | "responsibility_rejected"
  | "ai_setup_started"
  | "ai_question_answered"
  | "setup_deferred"
  | "setup_resumed"
  | "setup_completed"
  | "first_use_after_onboarding";

/**
 * One closed-word event, with counts at most. Never throws: measuring setup
 * must never be the reason setup fails.
 */
export async function recordOnboardingEvent(
  supabase: SupabaseClient,
  input: { householdId: string; event: OnboardingEvent; step?: OnboardingStep; detail?: Record<string, number | string | boolean> },
): Promise<void> {
  try {
    const { error } = await supabase
      .from("onboarding_events")
      .insert({ household_id: input.householdId, event: input.event, step: input.step ?? null, detail: input.detail ?? {} });
    if (error) log.warn("onboarding event not recorded", { event: input.event, code: error.code ?? "unknown", allow: ["event", "code"] });
  } catch {
    // Measurement only.
  }
}

export type OnboardingSnapshot = {
  state: OnboardingState;
  members: HouseholdMember[];
  /** Everyone who can own something, for validation and owner pickers. */
  configMembers: ConfigMember[];
  facts: OnboardingFacts;
  /** Helpers' working windows, by member. */
  availability: Map<string, { dayOfWeek: number; startTime: string; endTime: string }[]>;
  pets: { id: string; name: string; species: string }[];
  schools: Map<string, { schoolName: string; grade: string | null }>;
};

/** Everything setup needs about a household, read from where it really lives. */
export async function loadOnboardingSnapshot(
  supabase: SupabaseClient,
  household: { id: string; ownerMemberId: string | null },
  state: OnboardingState,
): Promise<OnboardingSnapshot> {
  const [members, pets, enrolments, responsibilities, availabilityRows] = await Promise.all([
    listMembers(supabase, household.id, household.ownerMemberId),
    listPets(supabase, household.id),
    listEnrolments(supabase, household.id).catch(() => []),
    listResponsibilities(supabase, household.id),
    supabase
      .from("member_availability")
      .select("member_id, day_of_week, start_time, end_time")
      .eq("household_id", household.id)
      .then(({ data }) => (data ?? []) as Row[]),
  ]);

  const active = members.filter((member) => member.status === "active");
  const availability = new Map<string, { dayOfWeek: number; startTime: string; endTime: string }[]>();
  for (const row of availabilityRows) {
    const id = row.member_id as string;
    const list = availability.get(id) ?? [];
    list.push({ dayOfWeek: Number(row.day_of_week), startTime: String(row.start_time).slice(0, 5), endTime: String(row.end_time).slice(0, 5) });
    availability.set(id, list);
  }
  const schools = new Map<string, { schoolName: string; grade: string | null }>();
  for (const enrolment of enrolments) schools.set(enrolment.childMemberId, { schoolName: enrolment.schoolName, grade: enrolment.grade });

  const profile: HouseholdProfile = {
    adults: active
      .filter((member) => member.memberType === "adult")
      .map((member) => ({ id: member.id, name: member.displayName, relationship: member.relationship, workArrangement: member.workArrangement ?? null })),
    children: active
      .filter((member) => member.memberType === "child")
      .map((member) => ({ id: member.id, name: member.displayName, age: member.ageYears ?? null, school: schools.get(member.id)?.schoolName ?? null })),
    pets: pets.map((pet) => ({ id: pet.id, name: pet.name, species: pet.species })),
    helpers: active
      .filter((member) => member.memberType === "helper")
      .map((member) => ({ id: member.id, name: member.displayName, role: member.occupation, workingDays: new Set((availability.get(member.id) ?? []).map((window) => window.dayOfWeek)).size })),
  };

  const responsibilityKeys = responsibilities.map((row) => row.outcomeKey);
  const pending = suggestResponsibilities(profile, { existingKeys: responsibilityKeys, dismissed: state.dismissed });

  return {
    state,
    members,
    configMembers: active.map((member) => ({ id: member.id, displayName: member.displayName, memberType: member.memberType })),
    facts: {
      composition: state.composition,
      profile,
      responsibilityKeys,
      pending,
      helpersWithHours: profile.helpers.filter((helper) => helper.workingDays > 0).length,
    },
    availability,
    pets: profile.pets.map((pet) => ({ ...pet })),
    schools,
  };
}

/**
 * Accepting a suggestion: it becomes a real playbook entry and a real
 * responsibility, through the same validated, audited writes a person's own
 * would use. Both are upserts on the outcome key, so a double tap or a retry
 * lands on the same row — never a second responsibility.
 */
export async function acceptSuggestion(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    actorMemberId: string;
    members: readonly ConfigMember[];
    suggestion: Pick<SuggestedResponsibility, "key" | "title" | "definition">;
    primaryMemberId: string | null;
    backupMemberId: string | null;
  },
): Promise<void> {
  await savePlaybookItem(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    item: { outcomeKey: input.suggestion.key, name: input.suggestion.title.slice(0, 120), outcomeDefinition: input.suggestion.definition, operatingWindow: null, escalateAfterHours: null },
  });
  await saveResponsibility(supabase, {
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    members: input.members,
    responsibility: {
      outcomeKey: input.suggestion.key,
      primaryMemberId: input.primaryMemberId,
      backupMemberId: input.backupMemberId === input.primaryMemberId ? null : input.backupMemberId,
      aiMode: "observe",
      priority: 3,
    },
  });
}
