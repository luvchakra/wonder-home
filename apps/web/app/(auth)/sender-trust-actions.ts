"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient } from "@wonderhome/core/db/server";
import { answerSenderTrust } from "@wonderhome/core/homesend/sender-trust";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

/**
 * "New sender: x@y. Trust it from now on?" (decision 5, the owner
 * 2026-11-14). The "Needs you" list's Trust / Not ours buttons call this. An
 * Admin's answer only: checked through their own session first, then written
 * by the server (`homesend/sender-trust.ts`), audited either way.
 */
const schema = z.object({ householdId: z.uuid(), senderId: z.uuid(), answer: z.enum(["trust", "not_ours"]) });

export async function answerSenderTrustAction(input: { householdId: string; senderId: string; answer: "trust" | "not_ours" }): Promise<{ ok: true; released: number } | { ok: false; reason: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const admin = adminClientFor(adminGrant.householdAdmin(membership, "answer Trust this sender?"), parsed.data.householdId);
    const result = await answerSenderTrust(admin, { ...parsed.data, actorMemberId: membership.memberId });
    if (!result.ok) return { ok: false, reason: result.reason === "already_answered" ? "Someone already answered about this sender." : "That sender isn't waiting any more." };
    revalidatePath("/home-send");
    return result;
  } catch (thrown) {
    return { ok: false, reason: toErrorBody(thrown, "privacy").body.error.message };
  }
}
