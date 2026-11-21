"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { auditChange } from "@wonderhome/core/api/audit";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { saveShares } from "@wonderhome/core/finance/bill-split";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

const schema = z.object({
  householdId: z.uuid(),
  obligationId: z.uuid(),
  shares: z.array(z.object({ memberId: z.uuid(), basisPoints: z.number().int().min(1).max(10000) })).max(8),
});

/** "Split between adults" on a bill (11-026): saves the shares, or takes the split off when empty. */
export async function saveBillSplitAction(input: z.input<typeof schema>): Promise<{ error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Please check the shares." };
  try {
    const supabase = await createClient();
    const admin = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await saveShares(supabase, parsed.data);
    after(() => auditChange({ householdId: parsed.data.householdId, actorMemberId: admin.memberId, eventType: "finance.bill_changed", targetTable: "obligations", targetId: parsed.data.obligationId, metadata: { change: parsed.data.shares.length > 0 ? "split" : "unsplit" } }));
    revalidatePath("/bills");
    return {};
  } catch (thrown) {
    return { error: toErrorBody(thrown, "finance").body.error.message };
  }
}
