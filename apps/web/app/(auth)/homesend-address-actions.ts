"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { createHomeSendAddress, platformHomeSendEmailDomain, rotateHomeSendAddress, revokeHomeSendAddress } from "@wonderhome/core/homesend/addresses";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

/**
 * Setting up, rotating and turning off the household's own HomeSend email
 * address (Phase 5, the UI for Phase 2's already-real backend). Every
 * action here is admin-only — `requireHouseholdAdmin` is the application
 * check `homesend/addresses.ts`'s RLS-level 42501 already backs up, not a
 * replacement for it.
 */

export type HomeSendAddressState = { error?: string; notice?: string };

const schema = z.object({ householdId: z.uuid() });

export async function createHomeSendAddressAction(_previous: HomeSendAddressState, formData: FormData): Promise<HomeSendAddressState> {
  const parsed = schema.safeParse({ householdId: formData.get("householdId") });
  if (!parsed.success) return { error: "Please try again." };

  const domain = platformHomeSendEmailDomain();
  if (!domain) return { error: "Email forwarding isn't set up for this deployment yet." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await createHomeSendAddress(supabase, { householdId: parsed.data.householdId, actorMemberId: membership.memberId, domain });
    revalidatePath("/home-send");
    return { notice: "Email forwarding is on." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

export async function rotateHomeSendAddressAction(_previous: HomeSendAddressState, formData: FormData): Promise<HomeSendAddressState> {
  const parsed = schema.safeParse({ householdId: formData.get("householdId") });
  if (!parsed.success) return { error: "Please try again." };

  const domain = platformHomeSendEmailDomain();
  if (!domain) return { error: "Email forwarding isn't set up for this deployment yet." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await rotateHomeSendAddress(supabase, { householdId: parsed.data.householdId, actorMemberId: membership.memberId, domain });
    revalidatePath("/home-send");
    return { notice: "New address ready — the old one no longer works." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}

export async function revokeHomeSendAddressAction(_previous: HomeSendAddressState, formData: FormData): Promise<HomeSendAddressState> {
  const parsed = schema.safeParse({ householdId: formData.get("householdId") });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await revokeHomeSendAddress(supabase, parsed.data.householdId, membership.memberId);
    revalidatePath("/home-send");
    return { notice: "Email forwarding is off." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "homesend").body.error.message };
  }
}
