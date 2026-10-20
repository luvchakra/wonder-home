"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";

/**
 * An adult answers a child's or helper's request (`conversation/referral.ts`).
 * Who may answer is decided on the server from the approval itself, never
 * from the browser.
 */
const schema = z.object({ householdId: z.uuid(), approvalId: z.uuid(), decision: z.enum(["approved", "rejected"]) });

export async function answerRequestAction(input: { householdId: string; approvalId: string; decision: "approved" | "rejected" }): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = (await listMemberships(supabase)).find((entry) => entry.household.id === parsed.data.householdId);
    if (!membership || membership.memberType !== "adult") return { ok: false, reason: "Only a grown-up in the household can answer this." };
    const { answerReferral } = await import("../_lib/hometalk-turn");
    const result = await answerReferral({ supabase, householdId: parsed.data.householdId, approver: membership, approvalId: parsed.data.approvalId, decision: parsed.data.decision });
    revalidatePath("/notifications");
    revalidatePath("/");
    return result;
  } catch (error) {
    return { ok: false, reason: toErrorBody(error, "approval").body.error.message };
  }
}
