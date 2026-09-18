"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CONTENT_CLASSES, DEFAULT_DATA_USE, type ContentClass } from "@wonderhome/core/ai/privacy";
import { saveDataUse } from "@wonderhome/core/ai/privacy-repository";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

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
