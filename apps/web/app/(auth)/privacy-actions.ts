"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CONTENT_CLASSES, DEFAULT_DATA_USE, type ContentClass } from "@wonderhome/core/ai/privacy";
import { saveDataUse } from "@wonderhome/core/ai/privacy-repository";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient, verifyUser } from "@wonderhome/core/db/server";
import { createIsolatedClient } from "@wonderhome/core/db/isolated";
import { requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";
import { cancelDeletion, requestDeletion } from "@wonderhome/core/privacy/repository";
import { STEP_UP_PURPOSES } from "@wonderhome/core/security/step-up";
import { verifyStepUp } from "@wonderhome/core/security/step-up-repository";

import type { ActionState } from "./actions";

/**
 * Changing what a household agrees to send a model provider (story 15-005).
 *
 * The form posts a checkbox per class, so what arrives is exactly what the
 * person ticked — the absent ones are the ones they did not. That matters
 * more than it sounds: a partial update that merges with what was there
 * before would mean unticking a box does nothing, which is the worst possible
 * behaviour for a consent control.
 *
 * `credential` is not offered and is stripped if it arrives anyway. A
 * household cannot agree to send its own keys.
 */

const dataUseSchema = z.object({
  householdId: z.uuid(),
  allowProviderContent: z.literal(["on", "off"]).optional(),
  allowRetention: z.literal(["on", "off"]).optional(),
  maxItems: z.coerce.number().int().min(1).max(50).optional(),
});

export async function saveDataUseAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = dataUseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the choices above." };
  }

  const { householdId, allowProviderContent, allowRetention, maxItems } = parsed.data;

  const ticked = formData
    .getAll("allowedClasses")
    .filter((value): value is string => typeof value === "string")
    .filter((value): value is ContentClass => CONTENT_CLASSES.includes(value as ContentClass))
    .filter((value) => value !== "credential");

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, householdId);

    await saveDataUse(supabase, {
      householdId,
      actorMemberId: membership.memberId,
      policy: {
        allowProviderContent: allowProviderContent === "on",
        allowedProviders: DEFAULT_DATA_USE.allowedProviders,
        allowedClasses: ticked,
        allowRetention: allowRetention === "on",
        maxItems: maxItems ?? DEFAULT_DATA_USE.maxItems,
      },
    });

    revalidatePath("/settings");
    return { notice: "Saved. This takes effect on the next thing you ask." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
}

/**
 * Confirming it is you, and acting on what that unlocks (story 15-007).
 *
 * The step-up is a separate action from the thing it protects, and
 * deliberately so: the person types their password, sees that it was
 * accepted, and then chooses. A single form that took a password and did the
 * irreversible thing in the same submit would make the password the decision.
 */

const stepUpSchema = z.object({
  householdId: z.uuid(),
  purpose: z.enum(STEP_UP_PURPOSES),
  password: z.string().min(1, { error: "Enter your password." }).max(200),
});

export async function confirmItIsYouAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = stepUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter your password." };
  }

  const { householdId, purpose, password } = parsed.data;

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const user = await verifyUser(supabase);
    if (!user?.email) return { error: "We could not confirm who you are. Please sign in again." };

    const result = await verifyStepUp(supabase, {
      householdId,
      memberId: membership.memberId,
      email: user.email,
      password,
      purpose,
      createIsolatedClient,
    });

    if (!result.ok) return { error: result.reason };

    revalidatePath("/settings/privacy");
    return { notice: "Confirmed. You can go ahead below." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
}

const deletionSchema = z.object({ householdId: z.uuid() });

export async function requestDeletionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = deletionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something was missing. Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const { actsAt } = await requestDeletion(supabase, {
      householdId: parsed.data.householdId,
      memberId: membership.memberId,
      isHead: membership.roles.includes("head"),
    });

    revalidatePath("/settings/privacy");
    return {
      notice: `Understood. Nothing happens yet — your data is scheduled to be deleted on ${actsAt.toDateString()}, and you can call it off until then.`,
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
}

const cancelSchema = z.object({ householdId: z.uuid(), requestId: z.uuid() });

export async function cancelDeletionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something was missing. Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await cancelDeletion(supabase, {
      householdId: parsed.data.householdId,
      memberId: membership.memberId,
      requestId: parsed.data.requestId,
    });

    revalidatePath("/settings/privacy");
    return { notice: "Called off. Nothing will be deleted." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
}
