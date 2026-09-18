"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { AUTONOMY_MODES } from "@wonderhome/core/household/autonomy";
import { POLICY_CATEGORIES } from "@wonderhome/core/household/configuration";
import {
  savePlaybookItem,
  savePolicy,
  saveResponsibility,
} from "@wonderhome/core/household/configuration-repository";
import { listMembers, requireHouseholdAdmin } from "@wonderhome/core/identity/households";

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
  outcomeKey: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  outcomeDefinition: z.string().trim().min(1).max(500),
  startHour: z.union([z.coerce.number().int().min(0).max(23), z.literal("")]).optional(),
  endHour: z.union([z.coerce.number().int().min(0).max(23), z.literal("")]).optional(),
  escalateAfterHours: z.union([z.coerce.number().int(), z.literal("")]).optional(),
  dependsOnKey: z.string().optional(),
});

export async function savePlaybookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = playbookSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const { householdId, startHour, endHour, escalateAfterHours, dependsOnKey, ...rest } = parsed.data;
  const hasWindow = typeof startHour === "number" && typeof endHour === "number";

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId);

    const saved = await savePlaybookItem(supabase, {
      householdId,
      actorMemberId: membership.memberId,
      item: {
        ...rest,
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
});

export async function savePolicyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = policySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const { householdId, category, name, limitMinor, note } = parsed.data;

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
    });

    revalidatePath("/household/setup");
    revalidatePath("/household");
    return { notice: `Saved. ${saved.downstream.join(" ")}` };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "configuration").body.error.message };
  }
}
