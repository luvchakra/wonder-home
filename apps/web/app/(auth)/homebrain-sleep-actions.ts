"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { forgetHouseholdContext } from "@wonderhome/core/conversation/brain";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { undoConsolidation } from "@wonderhome/core/homebrain/sleep/undo";
import { isHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";

/**
 * Undoing what a night's sleep changed (HomeBrain Sleep): a merge, a split,
 * a move, a memory let go, or a resting one brought back. Admins only — the
 * same people who read the list. The change is put back exactly as it was,
 * from what it recorded.
 */
const schema = z.object({ householdId: z.uuid(), consolidationId: z.uuid() });

export async function undoSleepChangeAction(input: { householdId: string; consolidationId: string }): Promise<{ ok: true } | { ok: false; reason: "forbidden" | "changed_since" | "failed" }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "failed" };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    if (!isHouseholdAdmin(membership)) return { ok: false, reason: "forbidden" };
    const outcome = await undoConsolidation(createAdminClient(), { householdId: parsed.data.householdId, consolidationId: parsed.data.consolidationId, memberId: membership.memberId });
    if (outcome === "changed_since") return { ok: false, reason: "changed_since" };
    if (outcome !== "undone" && outcome !== "already_undone") return { ok: false, reason: "failed" };
    forgetHouseholdContext(parsed.data.householdId);
    revalidatePath("/certification");
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
