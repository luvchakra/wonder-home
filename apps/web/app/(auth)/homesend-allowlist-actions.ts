"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { addEmailAllowlistEntry, removeEmailAllowlistEntry } from "@wonderhome/core/homesend/email-allowlist";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

/**
 * Managing the household's approved email senders (story 17-016). Every
 * action is admin-only — `requireHouseholdAdmin` is the application check the
 * RLS 42501 on `homesend_email_allowlist` already backs up, not a substitute
 * for it. The list is the privacy gate: until a sender is approved,
 * WonderHome reads no forwarded mail at all.
 */

export type AllowlistActionState = { error?: string; notice?: string };

const addSchema = z.object({ householdId: z.uuid(), sender: z.string().min(1).max(320) });
const removeSchema = z.object({ householdId: z.uuid(), id: z.uuid() });

export async function addAllowlistSenderAction(_previous: AllowlistActionState, formData: FormData): Promise<AllowlistActionState> {
  const parsed = addSchema.safeParse({ householdId: formData.get("householdId"), sender: formData.get("sender") });
  if (!parsed.success) return { error: "Enter a full email address or a whole domain." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const entry = await addEmailAllowlistEntry(supabase, {
      householdId: parsed.data.householdId,
      actorMemberId: membership.memberId,
      raw: parsed.data.sender,
    });
    revalidatePath("/settings/connections");
    revalidatePath("/home-send");
    return { notice: `${entry.kind === "domain" ? `@${entry.value}` : entry.value} can now reach WonderHome.` };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

export async function removeAllowlistSenderAction(_previous: AllowlistActionState, formData: FormData): Promise<AllowlistActionState> {
  const parsed = removeSchema.safeParse({ householdId: formData.get("householdId"), id: formData.get("id") });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await removeEmailAllowlistEntry(supabase, {
      householdId: parsed.data.householdId,
      actorMemberId: membership.memberId,
      id: parsed.data.id,
    });
    revalidatePath("/settings/connections");
    revalidatePath("/home-send");
    return { notice: "Removed. WonderHome will no longer read mail from that sender." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}
