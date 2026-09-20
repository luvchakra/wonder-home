"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { AUTONOMY_MODES } from "@wonderhome/core/household/autonomy";
import { POLICY_CATEGORIES, slugifyOutcomeKey, type PolicyCondition } from "@wonderhome/core/household/configuration";
import { proposeConfiguration } from "@wonderhome/core/household/configuration-intent";
import {
  applyConfigurationChange,
  listResponsibilities,
  policyVersions,
  retirePolicy,
  savePlaybookItem,
  savePolicy,
  saveResponsibility,
  setPlaybookItemActive,
} from "@wonderhome/core/household/configuration-repository";
import { listMembers, requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { MEMBER_TYPES } from "@wonderhome/core/identity/schemas";

import type { ActionState } from "./actions";

/**
 * Saving the household's operating model, one step at a time (story 02-001).
 *
 * Each step saves on its own, which is what makes the wizard resumable: the
 * next visit reads the household's real configuration to decide what is
 * already done, rather than a half-finished draft kept in a browser. Nothing
 * here is UI-only state.
 *
 * Every action re-checks that the caller is an administrator. The wizard is
 * only shown to one, but a hidden form is not a permission.
 */

const responsibilitySchema = z.object({
  householdId: z.uuid(),
  outcomeKey: z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/, { error: "That is not a valid outcome key." }),
  primaryMemberId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
  backupMemberId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
  aiMode: z.enum(AUTONOMY_MODES),
  priority: z.coerce.number().int().min(1).max(5),
});

export async function saveResponsibilityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = responsibilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    const { householdId, ...responsibility } = parsed.data;
    const membership = await requireHouseholdAdmin(supabase, householdId);
    const members = await listMembers(supabase, householdId, membership.household.ownerMemberId);

    const saved = await saveResponsibility(supabase, {
      householdId,
      actorMemberId: membership.memberId,
      members,
      responsibility,
    });

    revalidatePath("/household/setup");
    revalidatePath("/household/responsibilities");
    return { notice: `Saved. ${saved.downstream.join(" ")}` };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "configuration").body.error.message };
  }
}

const playbookSchema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  outcomeDefinition: z.string().trim().min(1).max(500),
  startHour: z.union([z.coerce.number().int().min(0).max(23), z.literal("")]).optional(),
  endHour: z.union([z.coerce.number().int().min(0).max(23), z.literal("")]).optional(),
  escalateAfterHours: z.union([z.coerce.number().int(), z.literal("")]).optional(),
  dependsOnKey: z.string().optional(),
  /** Set when editing: the planner's key stays put even if the name is reworded. */
  outcomeKey: z.string().regex(/^[a-z][a-z0-9_.]{1,60}$/).optional(),
});

export async function savePlaybookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = playbookSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const { householdId, name, startHour, endHour, escalateAfterHours, dependsOnKey, outcomeKey, ...rest } = parsed.data;
  const hasWindow = typeof startHour === "number" && typeof endHour === "number";

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId);

    const saved = await savePlaybookItem(supabase, {
      householdId,
      actorMemberId: membership.memberId,
      item: {
        ...rest,
        name,
        // The household names it once; the planner's own reference is
        // derived from that name rather than asked for a second time.
        outcomeKey: outcomeKey ?? slugifyOutcomeKey(name),
        operatingWindow: hasWindow ? { startHour, endHour } : null,
        escalateAfterHours: typeof escalateAfterHours === "number" ? escalateAfterHours : null,
      },
      dependsOnKey: dependsOnKey || null,
    });

    revalidatePath("/household/setup");
    revalidatePath("/household");
    return { notice: `Saved. ${saved.downstream.join(" ")}` };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "configuration").body.error.message };
  }
}

const policySchema = z.object({
  householdId: z.uuid(),
  category: z.enum(POLICY_CATEGORIES),
  name: z.string().trim().min(1).max(120),
  /** The one rule the wizard collects today: an amount WonderHome may not pass. */
  limitMinor: z.union([z.coerce.number().int().min(0), z.literal("")]).optional(),
  note: z.string().trim().max(300).optional(),
  /** Narrows this policy to a specific case (02-008); a household picks at most one. */
  conditionMemberType: z.union([z.enum(MEMBER_TYPES), z.literal("")]).optional(),
  conditionStartHour: z.union([z.coerce.number().int().min(0).max(23), z.literal("")]).optional(),
  conditionEndHour: z.union([z.coerce.number().int().min(0).max(23), z.literal("")]).optional(),
});

export async function savePolicyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = policySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const { householdId, category, name, limitMinor, note, conditionMemberType, conditionStartHour, conditionEndHour } =
    parsed.data;

  // A household names one thing this policy is narrowed to. Member type is
  // asked first and wins if both were somehow submitted, rather than
  // refusing the save over an unlikely double-fill.
  const condition: PolicyCondition | null = conditionMemberType
    ? { kind: "member_type", memberType: conditionMemberType }
    : typeof conditionStartHour === "number" && typeof conditionEndHour === "number"
      ? { kind: "hour_range", startHour: conditionStartHour, endHour: conditionEndHour }
      : null;

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId);

    const saved = await savePolicy(supabase, {
      householdId,
      actorMemberId: membership.memberId,
      category,
      name,
      rule: {
        ...(typeof limitMinor === "number" ? { limitMinor } : {}),
        ...(note ? { note } : {}),
      },
      condition,
    });

    revalidatePath("/household/setup");
    revalidatePath("/household");
    return { notice: `Saved. ${saved.downstream.join(" ")}` };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "configuration").body.error.message };
  }
}

/**
 * Teaching the household in a sentence (story 02-006).
 *
 * Two steps, and the split matters. The first reads the sentence and shows
 * what it would do; the second applies it. Nothing is written by the first,
 * and the second writes only what a person has seen.
 *
 * The confirm step deliberately takes the *sentence* back, not the change.
 * Re-deriving the change on the server is what stops a crafted form post
 * writing a responsibility nobody said out loud — the browser never gets to
 * hand back a change it was not given. It also catches the household moving
 * underneath the preview: if the sentence now means something different from
 * what was on screen, the new reading is shown instead of being applied.
 */

export type TeachState = {
  error?: string;
  notice?: string;
  /** Asked back when the sentence was not understood, or was ambiguous. */
  question?: string;
  examples?: string[];
  /** What would happen, waiting for a yes. */
  proposal?: { utterance: string; summary: string; downstream: string[] };
  downstream?: string[];
};

const teachSchema = z.object({
  householdId: z.uuid(),
  utterance: z.string().trim().min(1, { error: "Tell WonderHome something about how the home runs." }).max(300),
  /** The summary the person actually saw. Absent on the first pass. */
  agreedTo: z.string().max(300).optional(),
});

async function readProposal(householdId: string, utterance: string) {
  const supabase = await createClient();
  const membership = await requireHouseholdAdmin(supabase, householdId);
  const [members, existing, versions] = await Promise.all([
    listMembers(supabase, householdId, membership.household.ownerMemberId),
    listResponsibilities(supabase, householdId),
    policyVersions(supabase, householdId),
  ]);

  const proposal = proposeConfiguration(utterance, {
    members,
    existing,
    nextVersionFor: (category, name) => (versions.get(`${category}:${name}`) ?? 0) + 1,
  });

  return { supabase, membership, members, proposal };
}

export async function previewConfigurationAction(
  _previous: TeachState,
  formData: FormData,
): Promise<TeachState> {
  const parsed = teachSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check what you typed." };
  }

  const { householdId, utterance } = parsed.data;

  try {
    const { proposal } = await readProposal(householdId, utterance);

    switch (proposal.kind) {
      case "clarify":
        return { question: proposal.question, examples: [...proposal.examples] };
      case "refused":
        return { error: proposal.reason };
      case "change":
        return {
          proposal: { utterance, summary: proposal.summary, downstream: proposal.downstream },
        };
    }
  } catch (thrown) {
    return { error: toErrorBody(thrown, "configuration").body.error.message };
  }
}

export async function applyConfigurationAction(
  _previous: TeachState,
  formData: FormData,
): Promise<TeachState> {
  const parsed = teachSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check what you typed." };
  }

  const { householdId, utterance, agreedTo } = parsed.data;

  try {
    const { supabase, membership, members, proposal } = await readProposal(householdId, utterance);

    if (proposal.kind === "clarify") return { question: proposal.question, examples: [...proposal.examples] };
    if (proposal.kind === "refused") return { error: proposal.reason };

    if (agreedTo && agreedTo !== proposal.summary) {
      // Something about the household changed between seeing it and saying
      // yes. Applying the new meaning silently would be applying something
      // nobody agreed to.
      return {
        notice: "Something changed while you were reading. Here is what this means now.",
        proposal: { utterance, summary: proposal.summary, downstream: proposal.downstream },
      };
    }

    const saved = await applyConfigurationChange(supabase, {
      householdId,
      actorMemberId: membership.memberId,
      members,
      change: proposal.change,
    });

    revalidatePath("/household/setup");
    revalidatePath("/household");
    revalidatePath("/household/responsibilities");

    return { notice: proposal.summary, downstream: saved.downstream };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "configuration").body.error.message };
  }
}

/**
 * Pausing and resuming a playbook entry, and standing a policy down. Both
 * statuses were on screen before ("paused", "active") with nothing anywhere
 * that could set them.
 */
const playbookActiveSchema = z.object({ householdId: z.uuid(), outcomeKey: z.string().min(2), active: z.enum(["true", "false"]) });

export async function setPlaybookActiveAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = playbookActiveSchema.safeParse({
    householdId: formData.get("householdId"),
    outcomeKey: formData.get("outcomeKey"),
    active: formData.get("active"),
  });
  if (!parsed.success) return { error: "That entry could not be read. Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await setPlaybookItemActive(supabase, {
      householdId: parsed.data.householdId,
      actorMemberId: membership.memberId,
      outcomeKey: parsed.data.outcomeKey,
      active: parsed.data.active === "true",
    });
    revalidatePath("/household");
    revalidatePath("/household/setup");
    return { notice: parsed.data.active === "true" ? "Resumed. WonderHome plans around it again." : "Paused. It stays on record; WonderHome just stops planning around it." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "configuration").body.error.message };
  }
}

const retirePolicySchema = z.object({ householdId: z.uuid(), policyId: z.uuid() });

export async function retirePolicyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = retirePolicySchema.safeParse({ householdId: formData.get("householdId"), policyId: formData.get("policyId") });
  if (!parsed.success) return { error: "That policy could not be read. Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await retirePolicy(supabase, { householdId: parsed.data.householdId, actorMemberId: membership.memberId, policyId: parsed.data.policyId });
    revalidatePath("/household");
    revalidatePath("/household/setup");
    return { notice: "Stood down. Until you set another, WonderHome asks before anything this covered." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "configuration").body.error.message };
  }
}
