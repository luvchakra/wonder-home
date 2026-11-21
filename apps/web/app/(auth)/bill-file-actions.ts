"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient } from "@wonderhome/core/db/server";
import { addBillAttachment, BILL_FILE_MAX_BYTES, removeBillAttachment } from "@wonderhome/core/finance/bill-attachments";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { hitRateLimitFair, rateLimitMessage } from "@wonderhome/core/security/rate-limit";

export type BillFileState = { error?: string; notice?: string };

const attachSchema = z.object({ householdId: z.uuid(), obligationId: z.uuid() });
const removeSchema = z.object({ householdId: z.uuid(), obligationId: z.uuid(), attachmentId: z.uuid() });

/**
 * Attach a photo or PDF of a bill or its receipt to the bill's record
 * (11-021). Who may edit a bill (an Admin) may attach; the same checks as
 * every HomeSend upload, and its rate limit.
 */
export async function attachBillFileAction(_previous: BillFileState, formData: FormData): Promise<BillFileState> {
  const parsed = attachSchema.safeParse({ householdId: formData.get("householdId"), obligationId: formData.get("obligationId") });
  if (!parsed.success) return { error: "Please try again." };
  const { householdId, obligationId } = parsed.data;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo or PDF first." };
  if (file.size > BILL_FILE_MAX_BYTES) return { error: "That file is over 4 MB. Try a smaller photo." };
  try {
    const supabase = await createClient();
    const admin = await requireHouseholdAdmin(supabase, householdId);
    if (!(await hitRateLimitFair(adminClientFor(adminGrant.householdAdmin(admin, "bill file rate limit (11-021)"), householdId), "homesend.intake", { memberId: admin.memberId, householdId }))) return { error: rateLimitMessage("homesend.intake") };
    await addBillAttachment(supabase, {
      householdId,
      memberId: admin.memberId,
      obligationId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      claimedType: file.type,
      filename: file.name || null,
    });
    revalidatePath(`/bills/${obligationId}`);
    return { notice: "Attached." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}

/** Takes a file off the bill's record; it is kept, not deleted (rule 12). */
export async function removeBillFileAction(input: { householdId: string; obligationId: string; attachmentId: string }): Promise<{ error?: string }> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const admin = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await removeBillAttachment(supabase, { ...parsed.data, memberId: admin.memberId });
    revalidatePath(`/bills/${parsed.data.obligationId}`);
    return {};
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}
