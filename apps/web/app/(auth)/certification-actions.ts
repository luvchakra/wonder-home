"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { applyReview, type CertificationItem } from "@wonderhome/core/household/certification";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";

/**
 * Reviewing what WonderHome believes: confirm, correct, remove or defer.
 *
 * Reviews are written server-side so the reviewer is the authenticated
 * member rather than whoever the request claimed, and the item's status
 * follows the domain rule in `applyReview` rather than a free-text update.
 */
const schema = z.object({
  householdId: z.uuid(),
  itemId: z.uuid(),
  decision: z.enum(["confirmed", "corrected", "removed", "deferred"]),
  correction: z.string().trim().max(300).optional(),
});

export async function reviewCertificationAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    householdId: formData.get("householdId"),
    itemId: formData.get("itemId"),
    decision: formData.get("decision"),
    correction: formData.get("correction") || undefined,
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  try {
    const membership = await requireMembership(supabase, parsed.data.householdId);
    // Children read their own items; changing what the household believes is an adult's call.
    if (membership.memberType === "child") return;

    const { data: row } = await supabase
      .from("certification_items")
      .select("id, category, claim, source_type, source_detail, status, risk_level, last_reviewed_at")
      .eq("id", parsed.data.itemId)
      .eq("household_id", parsed.data.householdId)
      .maybeSingle();
    if (!row) return;

    const item: CertificationItem = {
      id: row.id as string,
      category: row.category as CertificationItem["category"],
      claim: row.claim as string,
      sourceType: row.source_type as CertificationItem["sourceType"],
      sourceDetail: (row.source_detail as string | null) ?? null,
      status: row.status as CertificationItem["status"],
      riskLevel: row.risk_level as CertificationItem["riskLevel"],
      lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at as string) : null,
    };
    const now = new Date();
    const updated = applyReview(item, parsed.data.decision, now);

    const admin = createAdminClient();
    await admin
      .from("certification_items")
      .update({
        status: updated.status,
        claim: parsed.data.decision === "corrected" && parsed.data.correction ? parsed.data.correction : item.claim,
        last_reviewed_at: now.toISOString(),
        last_reviewed_by: membership.memberId,
      })
      .eq("id", item.id);
    await admin.from("certification_reviews").insert({
      household_id: parsed.data.householdId,
      item_id: item.id,
      reviewer_member_id: membership.memberId,
      decision: parsed.data.decision,
      previous_value: { claim: item.claim, status: item.status },
      new_value: { claim: parsed.data.correction ?? item.claim, status: updated.status },
    });
  } catch (error) {
    log.warn("certification review failed", { reason: error instanceof Error ? error.name : "unknown" });
  }

  revalidatePath("/certification");
}
