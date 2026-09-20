"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { createSchoolItem } from "@wonderhome/core/school/repository";
import { SCHOOL_ITEM_KINDS } from "@wonderhome/core/school/items";

import type { ActionState } from "./actions";

/**
 * Adding a piece of school work by hand — the manual half of the promise the
 * Homework empty state already made ("add a piece of homework"), which had
 * no form behind it even though `createSchoolItem` already existed for the
 * API route the AI assistant calls.
 */
const schema = z.object({
  householdId: z.uuid(),
  childMemberId: z.uuid({ error: "Choose who this is for." }),
  kind: z.enum(SCHOOL_ITEM_KINDS),
  title: z.string().trim().min(1, { error: "What is it?" }).max(160),
  subject: z.string().trim().max(60).optional(),
  dueAt: z.string().optional(),
  estimatedMinutes: z.union([z.coerce.number().int().min(1).max(600), z.literal("")]).optional(),
});

export async function createSchoolItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    householdId: formData.get("householdId"),
    childMemberId: formData.get("childMemberId"),
    kind: formData.get("kind"),
    title: formData.get("title"),
    subject: formData.get("subject") || undefined,
    dueAt: formData.get("dueAt") || undefined,
    estimatedMinutes: formData.get("estimatedMinutes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);

    await createSchoolItem(supabase, {
      householdId: parsed.data.householdId,
      childMemberId: parsed.data.childMemberId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      subject: parsed.data.subject || null,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null,
      estimatedMinutes: parsed.data.estimatedMinutes === "" ? null : parsed.data.estimatedMinutes,
    });

    revalidatePath("/school");
    return { notice: "Added. WonderHome will track it until it’s done." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "school").body.error.message };
  }
}
