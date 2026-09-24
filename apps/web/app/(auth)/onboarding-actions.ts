"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { listPets, createPet, updatePet } from "@wonderhome/core/home/repository";
import { replaceAvailabilityPattern } from "@wonderhome/core/household/helpers-repository";
import { savePlaybookItem, saveResponsibility } from "@wonderhome/core/household/configuration-repository";
import {
  clampComposition,
  customResponsibilityKey,
  nextStep,
  ONBOARDING_STEPS,
  SUGGESTION_CATEGORIES,
  type OnboardingStep,
  type SuggestedResponsibility,
  type SuggestionCategory,
} from "@wonderhome/core/household/onboarding";
import {
  acceptSuggestion,
  loadOnboarding,
  loadOnboardingSnapshot,
  recordOnboardingEvent,
  startOnboarding,
  updateOnboarding,
  type OnboardingState,
} from "@wonderhome/core/household/onboarding-repository";
import { createChildMember } from "@wonderhome/core/identity/children";
import {
  createAdultMember,
  createHelperMember,
  isHouseholdAdmin,
  listMemberships,
  updateMemberProfile,
  WORK_ARRANGEMENTS,
  type WorkArrangement,
} from "@wonderhome/core/identity/households";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { log } from "@wonderhome/core/observability/logger";
import { saveEnrolment } from "@wonderhome/core/school/enrolments";

/**
 * Household setup (story 02-009). Every action here is an Admin's, and every
 * fact it records goes through the domain's own write — a child through
 * `createChildMember`, a pet through `createPet`, a responsibility through
 * `saveResponsibility` — so nothing setup does is a second way into a table.
 *
 * Each save is idempotent: a person already on record (same name, same kind)
 * is updated, not added again, and responsibilities are upserts on their
 * outcome key, so a double tap or a back-and-forward never duplicates anyone.
 */

export type OnboardingActionState = { error?: string };

type Context = { supabase: SupabaseClient; membership: HouseholdMembership; state: OnboardingState };

/** The signed-in Admin, their household, and where setup stands — started if it had not been. */
async function adminContext(): Promise<Context> {
  const supabase = await createClient();
  const memberships = await listMemberships(supabase);
  const membership = memberships[0];
  if (!membership) redirect("/welcome");
  if (!isHouseholdAdmin(membership)) redirect("/");
  const state =
    (await loadOnboarding(supabase, membership.household.id)) ??
    (await startOnboarding(supabase, { householdId: membership.household.id, memberId: membership.memberId }));
  return { supabase, membership, state };
}

function text(formData: FormData, key: string, max = 80): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stepFrom(value: FormDataEntryValue | null): OnboardingStep | null {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value) ? (value as OnboardingStep) : null;
}

/** A people tab pressed: save, then go there. */
function jumpFrom(formData: FormData): OnboardingStep | null {
  const intent = formData.get("intent");
  return typeof intent === "string" && intent.startsWith("goto:") ? stepFrom(intent.slice(5)) : null;
}

function categoryFrom(value: FormDataEntryValue | null): SuggestionCategory | null {
  return typeof value === "string" && (SUGGESTION_CATEGORIES as readonly string[]).includes(value) ? (value as SuggestionCategory) : null;
}

function problem(error: unknown, fallback: string): OnboardingActionState {
  if (error instanceof ApiError && (error.code === "bad_request" || error.code === "forbidden")) return { error: error.message };
  log.warn("onboarding step failed", { reason: error instanceof Error ? error.name : "unknown" });
  return { error: fallback };
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** Moves setup to a step and shows it. Records the events a move means. */
async function goTo(context: Context, step: OnboardingStep, options: { category?: SuggestionCategory | null } = {}): Promise<never> {
  const { supabase, membership, state } = context;
  const householdId = membership.household.id;
  const resuming = state.status === "deferred";
  await updateOnboarding(supabase, {
    householdId,
    memberId: membership.memberId,
    step,
    status: state.status === "completed" ? undefined : "in_progress",
  });
  if (resuming) await recordOnboardingEvent(supabase, { householdId, event: "setup_resumed", step });
  if (step === "guided" && state.step !== "guided") await recordOnboardingEvent(supabase, { householdId, event: "ai_setup_started", step });
  if (step === "suggestions") {
    const snapshot = await loadOnboardingSnapshot(supabase, membership.household, state).catch(() => null);
    if (snapshot) {
      await recordOnboardingEvent(supabase, {
        householdId,
        event: "responsibility_suggestions_generated",
        step,
        detail: { count: snapshot.facts.pending.length },
      });
    }
  }
  revalidatePath("/");
  const query = new URLSearchParams({ step });
  if (options.category) query.set("category", options.category);
  redirect(`/onboarding?${query.toString()}`);
}

// ---------------------------------------------------------------------------
// Moving through setup
// ---------------------------------------------------------------------------

/** "Next", "Continue", "Edit details" — anything that only moves, with nothing to save. */
export async function moveAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const context = await adminContext();
  const to = stepFrom(formData.get("to")) ?? "basics";
  return goTo(context, to, { category: categoryFrom(formData.get("category")) });
}

/** "I'll do this later": setup waits, and Home says where it got to. */
export async function deferAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const { supabase, membership, state } = await adminContext();
  const householdId = membership.household.id;
  const step = stepFrom(formData.get("step")) ?? state.step;
  await updateOnboarding(supabase, { householdId, memberId: membership.memberId, status: "deferred", step: step === "done" ? "summary" : step });
  await recordOnboardingEvent(supabase, { householdId, event: "setup_deferred", step });
  revalidatePath("/");
  redirect("/");
}

/** "Go to my home" from the final screen. */
export async function completeAction(): Promise<OnboardingActionState> {
  const { supabase, membership } = await adminContext();
  const householdId = membership.household.id;
  await updateOnboarding(supabase, { householdId, memberId: membership.memberId, status: "completed", step: "done" });
  await recordOnboardingEvent(supabase, { householdId, event: "setup_completed", step: "done" });
  await recordOnboardingEvent(supabase, { householdId, event: "first_use_after_onboarding", step: "done" });
  revalidatePath("/");
  // Then, once and optionally, how WonderHome should speak to them (story
  // 22-003) — a separate, skippable step, never part of family setup itself.
  redirect(membership.locale?.setup.status ? "/" : "/onboarding/personalize");
}

// ---------------------------------------------------------------------------
// Family basics
// ---------------------------------------------------------------------------

export async function saveBasicsAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const context = await adminContext();
  const { supabase, membership } = context;
  const composition = clampComposition({
    adults: formData.get("adults"),
    children: formData.get("children"),
    pets: formData.get("pets"),
    helpers: formData.get("helpers"),
  });
  try {
    await updateOnboarding(supabase, { householdId: membership.household.id, memberId: membership.memberId, composition });
  } catch (error) {
    return problem(error, "We could not save that. Please try again.");
  }
  await recordOnboardingEvent(supabase, { householdId: membership.household.id, event: "household_composition_completed", step: "basics", detail: composition });
  return goTo({ ...context, state: { ...context.state, composition } }, "overview");
}

/** Room for one more of something, kept in the draft composition so the extra row survives a reload. */
async function addRow(context: Context, kind: "adults" | "children" | "pets" | "helpers", step: OnboardingStep, rows: number): Promise<never> {
  const composition = clampComposition({ ...context.state.composition, [kind]: Math.max(context.state.composition[kind], rows) + 1 });
  await updateOnboarding(context.supabase, { householdId: context.membership.household.id, memberId: context.membership.memberId, composition });
  return goTo({ ...context, state: { ...context.state, composition } }, step);
}

/** After saving people, the composition is at least who is now named — never fewer rows than people. */
async function settleComposition(context: Context, kind: "adults" | "children" | "pets" | "helpers", named: number): Promise<Context> {
  if (context.state.composition[kind] >= named) return context;
  const composition = clampComposition({ ...context.state.composition, [kind]: named });
  await updateOnboarding(context.supabase, { householdId: context.membership.household.id, memberId: context.membership.memberId, composition });
  return { ...context, state: { ...context.state, composition } };
}

function rowCount(formData: FormData, key = "rows"): number {
  const value = Number(formData.get(key));
  return Number.isInteger(value) && value >= 0 && value <= 12 ? value : 0;
}

// ---------------------------------------------------------------------------
// Adults
// ---------------------------------------------------------------------------

export async function saveAdultsAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  let context = await adminContext();
  const { supabase, membership } = context;
  const householdId = membership.household.id;
  const rows = rowCount(formData);

  let named = 0;
  try {
    const snapshot = await loadOnboardingSnapshot(supabase, membership.household, context.state);
    const adults = snapshot.members
      .filter((member) => member.status === "active" && member.memberType === "adult")
      .map((adult) => ({ id: adult.id, displayName: adult.displayName }));
    for (let index = 0; index < rows; index += 1) {
      const name = text(formData, `name_${index}`);
      if (!name) continue;
      named += 1;
      const relationship = text(formData, `relationship_${index}`, 40) || null;
      const work = text(formData, `work_${index}`, 20);
      const workArrangement = (WORK_ARRANGEMENTS as readonly string[]).includes(work) ? (work as WorkArrangement) : null;
      const id = text(formData, `member_${index}`, 40);
      const existing = adults.find((adult) => adult.id === id) ?? adults.find((adult) => sameName(adult.displayName, name));
      if (existing) {
        await updateMemberProfile(supabase, membership, { memberId: existing.id, displayName: name, relationship, workArrangement });
      } else {
        const added = await createAdultMember(supabase, membership, { displayName: name, relationship, workArrangement });
        adults.push({ id: added.memberId, displayName: name });
        await recordOnboardingEvent(supabase, { householdId, event: "member_added", step: "adults", detail: { kind: "adult" } });
      }
    }
  } catch (error) {
    return problem(error, "We could not save everyone's details. Please try again.");
  }

  if (formData.get("intent") === "add_row") return addRow(context, "adults", "adults", rows);
  context = await settleComposition(context, "adults", named);
  return goTo(context, jumpFrom(formData) ?? nextStep("adults", context.state.composition));
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

export async function saveChildrenAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  let context = await adminContext();
  const { supabase, membership } = context;
  const householdId = membership.household.id;
  const rows = rowCount(formData);

  let named = 0;
  try {
    const snapshot = await loadOnboardingSnapshot(supabase, membership.household, context.state);
    const children = snapshot.members.filter((member) => member.status === "active" && member.memberType === "child").map((child) => ({ id: child.id, name: child.displayName }));
    for (let index = 0; index < rows; index += 1) {
      const name = text(formData, `name_${index}`);
      if (!name) continue;
      named += 1;
      const id = text(formData, `member_${index}`, 40);
      let childId = (children.find((child) => child.id === id) ?? children.find((child) => sameName(child.name, name)))?.id;
      if (!childId) {
        ({ memberId: childId } = await createChildMember(supabase, { householdId, displayName: name, guardianMemberIds: [membership.memberId] }));
        children.push({ id: childId, name });
        await recordOnboardingEvent(supabase, { householdId, event: "member_added", step: "children", detail: { kind: "child" } });
      }
      const ageText = text(formData, `age_${index}`, 3);
      const age = ageText === "" ? null : Number(ageText);
      await updateMemberProfile(supabase, membership, {
        memberId: childId,
        displayName: name,
        gender: text(formData, `gender_${index}`, 40) || null,
        // A date of birth, when the family gives one elsewhere, always wins over this.
        ...(age !== null && Number.isInteger(age) && age >= 0 && age <= 17 ? { ageYears: age } : {}),
      });
      const school = text(formData, `school_${index}`, 120);
      if (school) await saveEnrolment(supabase, { householdId, childMemberId: childId, schoolName: school });
    }
  } catch (error) {
    return problem(error, "We could not save the children's details. Please try again.");
  }

  if (formData.get("intent") === "add_row") return addRow(context, "children", "children", rows);
  context = await settleComposition(context, "children", named);
  return goTo(context, jumpFrom(formData) ?? nextStep("children", context.state.composition));
}

// ---------------------------------------------------------------------------
// Pets and household help
// ---------------------------------------------------------------------------

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The days a helper comes, and their hours, as a weekly pattern. Nothing when the hours do not make sense. */
function helperWindows(formData: FormData, prefix: string): { dayOfWeek: number; startTime: string; endTime: string }[] | null {
  const days = formData
    .getAll(`${prefix}days`)
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const start = text(formData, `${prefix}start`, 5);
  const end = text(formData, `${prefix}end`, 5);
  if (days.length === 0 || !TIME.test(start) || !TIME.test(end)) return null;
  if (end <= start) throw ApiError.badRequest("A helper's hours need to end after they start.");
  return [...new Set(days)].map((dayOfWeek) => ({ dayOfWeek, startTime: start, endTime: end }));
}

export async function savePetsAndHelpAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  let context = await adminContext();
  const { supabase, membership } = context;
  const householdId = membership.household.id;
  const petRows = rowCount(formData, "pet_rows");
  const helperRows = rowCount(formData, "helper_rows");

  let petsNamed = 0;
  let helpersNamed = 0;
  try {
    const pets = (await listPets(supabase, householdId)).map((pet) => ({ id: pet.id, name: pet.name, species: pet.species }));
    for (let index = 0; index < petRows; index += 1) {
      const name = text(formData, `pet_name_${index}`, 60);
      if (!name) continue;
      petsNamed += 1;
      const species = text(formData, `pet_species_${index}`, 40) || "Other";
      const id = text(formData, `pet_${index}`, 40);
      const existing = pets.find((pet) => pet.id === id) ?? pets.find((pet) => sameName(pet.name, name));
      if (existing) {
        if (existing.name !== name || existing.species !== species) await updatePet(supabase, householdId, existing.id, { name, species });
      } else {
        const added = await createPet(supabase, { householdId, name, species });
        pets.push({ id: added.id, name, species });
        await recordOnboardingEvent(supabase, { householdId, event: "pet_added", step: "pets", detail: { species: species.slice(0, 20) } });
      }
    }

    const snapshot = await loadOnboardingSnapshot(supabase, membership.household, context.state);
    const helpers = snapshot.members.filter((member) => member.status === "active" && member.memberType === "helper").map((helper) => ({ id: helper.id, name: helper.displayName }));
    for (let index = 0; index < helperRows; index += 1) {
      const name = text(formData, `helper_name_${index}`);
      if (!name) continue;
      helpersNamed += 1;
      const id = text(formData, `helper_${index}`, 40);
      let helperId = (helpers.find((helper) => helper.id === id) ?? helpers.find((helper) => sameName(helper.name, name)))?.id;
      if (!helperId) {
        ({ memberId: helperId } = await createHelperMember(supabase, membership, { displayName: name }));
        helpers.push({ id: helperId, name });
        await recordOnboardingEvent(supabase, { householdId, event: "helper_added", step: "pets" });
      }
      await updateMemberProfile(supabase, membership, { memberId: helperId, displayName: name, occupation: text(formData, `helper_role_${index}`, 60) || null });
      const windows = helperWindows(formData, `helper_${index}_`);
      if (windows) await replaceAvailabilityPattern(supabase, { householdId, memberId: helperId, windows });
    }
  } catch (error) {
    return problem(error, "We could not save your pets and help. Please try again.");
  }

  const intent = formData.get("intent");
  if (intent === "add_pet") return addRow(context, "pets", "pets", petRows);
  if (intent === "add_helper") return addRow(context, "helpers", "pets", helperRows);
  context = await settleComposition(context, "pets", petsNamed);
  context = await settleComposition(context, "helpers", helpersNamed);
  return goTo(context, jumpFrom(formData) ?? nextStep("pets", context.state.composition));
}

// ---------------------------------------------------------------------------
// Responsibilities
// ---------------------------------------------------------------------------

/** "primary:backup" from an owner picker, checked against who is actually in the household. */
function ownersFrom(value: string, eligible: ReadonlySet<string>): { primary: string | null; backup: string | null } | null {
  const [primary = "", backup = ""] = value.split(":");
  if (primary && !eligible.has(primary)) return null;
  if (backup && !eligible.has(backup)) return null;
  return { primary: primary || null, backup: backup && backup !== primary ? backup : null };
}

/**
 * One category's review, saved. The suggestions are worked out again here
 * from the household's real data — the form only says which to keep and who
 * owns each, never what a suggestion is — so a tampered title or key cannot
 * become a responsibility.
 */
export async function reviewCategoryAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const context = await adminContext();
  const { supabase, membership } = context;
  const householdId = membership.household.id;
  const category = categoryFrom(formData.get("category"));
  if (!category) return { error: "That list is not one we know." };

  const snapshot = await loadOnboardingSnapshot(supabase, membership.household, context.state);
  const eligible = new Set(snapshot.configMembers.map((member) => member.id));
  const pending = snapshot.facts.pending.filter((entry) => entry.category === category);
  const dismissed: string[] = [];

  try {
    for (const suggestion of pending) {
      const field = `owner_${suggestion.key}`;
      if (!formData.has(`seen_${suggestion.key}`)) continue;
      if (formData.get(`keep_${suggestion.key}`) !== "on") {
        dismissed.push(suggestion.key);
        continue;
      }
      const owners = ownersFrom(text(formData, field, 80), eligible) ?? { primary: suggestion.primaryMemberId, backup: suggestion.backupMemberId };
      await acceptSuggestion(supabase, {
        householdId,
        actorMemberId: membership.memberId,
        members: snapshot.configMembers,
        suggestion,
        primaryMemberId: owners.primary,
        backupMemberId: owners.backup,
      });
      const changed = owners.primary !== suggestion.primaryMemberId || owners.backup !== suggestion.backupMemberId;
      await recordOnboardingEvent(supabase, { householdId, event: changed ? "responsibility_modified" : "responsibility_accepted", step: "review", detail: { category } });
    }
    if (dismissed.length > 0) {
      await updateOnboarding(supabase, { householdId, memberId: membership.memberId, dismiss: dismissed });
      await recordOnboardingEvent(supabase, { householdId, event: "responsibility_rejected", step: "review", detail: { category, count: dismissed.length } });
    }
  } catch (error) {
    return problem(error, "We could not save these responsibilities. Please try again.");
  }

  // On to the next list still waiting for a decision, or the summary.
  const decided = new Set([...dismissed, ...pending.filter((entry) => formData.has(`seen_${entry.key}`)).map((entry) => entry.key)]);
  const remaining = snapshot.facts.pending.filter((entry) => !decided.has(entry.key));
  const order = SUGGESTION_CATEGORIES.slice(SUGGESTION_CATEGORIES.indexOf(category) + 1);
  const next = order.find((candidate) => remaining.some((entry) => entry.category === candidate));
  return next ? goTo(context, "review", { category: next }) : goTo(context, "summary");
}

/** "+ Add responsibility": the household's own, filed under the list it was added in. */
export async function addResponsibilityAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const context = await adminContext();
  const { supabase, membership } = context;
  const householdId = membership.household.id;
  const category = categoryFrom(formData.get("category"));
  const title = text(formData, "title", 120);
  if (!category) return { error: "That list is not one we know." };
  if (!title) return { error: "What is it you want looked after?" };

  try {
    const snapshot = await loadOnboardingSnapshot(supabase, membership.household, context.state);
    const eligible = new Set(snapshot.configMembers.map((member) => member.id));
    const owners = ownersFrom(text(formData, "owner", 80), eligible) ?? { primary: null, backup: null };
    const key = customResponsibilityKey(title, [...snapshot.facts.responsibilityKeys, ...snapshot.facts.pending.map((entry) => entry.key)], category);
    await savePlaybookItem(supabase, {
      householdId,
      actorMemberId: membership.memberId,
      item: { outcomeKey: key, name: title, outcomeDefinition: `${title} — looked after, without anyone having to chase it.`, operatingWindow: null, escalateAfterHours: null },
    });
    await saveResponsibility(supabase, {
      householdId,
      actorMemberId: membership.memberId,
      members: snapshot.configMembers,
      responsibility: { outcomeKey: key, primaryMemberId: owners.primary, backupMemberId: owners.backup, aiMode: "observe", priority: 3 },
    });
    await recordOnboardingEvent(supabase, { householdId, event: "responsibility_accepted", step: "review", detail: { category, custom: true } });
  } catch (error) {
    return problem(error, "We could not add that responsibility. Please try again.");
  }
  return goTo(context, "review", { category });
}

// ---------------------------------------------------------------------------
// Guided setup: one question at a time
// ---------------------------------------------------------------------------

export async function answerSchoolAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const context = await adminContext();
  const { supabase, membership } = context;
  const householdId = membership.household.id;
  let answered = 0;
  try {
    const snapshot = await loadOnboardingSnapshot(supabase, membership.household, context.state);
    for (const child of snapshot.facts.profile.children) {
      const school = text(formData, `school_${child.id}`, 120);
      if (!school) continue;
      await saveEnrolment(supabase, { householdId, childMemberId: child.id, schoolName: school });
      answered += 1;
    }
  } catch (error) {
    return problem(error, "We could not save the school. Please try again.");
  }
  if (answered === 0) return { error: "Add a school for at least one child, or choose Maybe later." };
  await recordOnboardingEvent(supabase, { householdId, event: "ai_question_answered", step: "guided", detail: { question: "school", count: answered } });
  return goTo(context, "guided");
}

export async function answerHelperHoursAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const context = await adminContext();
  const { supabase, membership } = context;
  const householdId = membership.household.id;
  let answered = 0;
  try {
    const snapshot = await loadOnboardingSnapshot(supabase, membership.household, context.state);
    for (const helper of snapshot.facts.profile.helpers) {
      const windows = helperWindows(formData, `helper_${helper.id}_`);
      if (!windows) continue;
      await replaceAvailabilityPattern(supabase, { householdId, memberId: helper.id, windows });
      answered += 1;
    }
  } catch (error) {
    return problem(error, "We could not save those hours. Please try again.");
  }
  if (answered === 0) return { error: "Pick at least one day and the hours, or choose Maybe later." };
  await recordOnboardingEvent(supabase, { householdId, event: "ai_question_answered", step: "guided", detail: { question: "helper_hours", count: answered } });
  return goTo(context, "guided");
}

/** "Yes, please" to a whole list: every suggestion in it, with the owners suggested. */
export async function acceptCategoryAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const context = await adminContext();
  const { supabase, membership } = context;
  const householdId = membership.household.id;
  const category = categoryFrom(formData.get("category"));
  if (!category) return { error: "That list is not one we know." };
  let accepted: SuggestedResponsibility[] = [];
  try {
    const snapshot = await loadOnboardingSnapshot(supabase, membership.household, context.state);
    accepted = snapshot.facts.pending.filter((entry) => entry.category === category);
    for (const suggestion of accepted) {
      await acceptSuggestion(supabase, {
        householdId,
        actorMemberId: membership.memberId,
        members: snapshot.configMembers,
        suggestion,
        primaryMemberId: suggestion.primaryMemberId,
        backupMemberId: suggestion.backupMemberId,
      });
    }
  } catch (error) {
    return problem(error, "We could not set those up. Please try again.");
  }
  await recordOnboardingEvent(supabase, { householdId, event: "ai_question_answered", step: "guided", detail: { question: `accept_${category}`, count: accepted.length } });
  if (accepted.length > 0) await recordOnboardingEvent(supabase, { householdId, event: "responsibility_accepted", step: "guided", detail: { category, count: accepted.length } });
  return goTo(context, "guided");
}
