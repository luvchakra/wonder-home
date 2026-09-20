"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { applyReview, type CertificationItem } from "@wonderhome/core/household/certification";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";

import type { ActionState } from "./actions";

/**
 * Reviewing what WonderHome believes: confirm, correct, remove or defer.
 *
 * Reviews are written server-side so the reviewer is the authenticated
 * member rather than whoever the request claimed, and the item's status
 * follows the domain rule in `applyReview` rather than a free-text update.
 */
const schema = z
  .object({
    householdId: z.uuid(),
    itemId: z.uuid(),
    decision: z.enum(["confirmed", "corrected", "removed", "deferred"]),
    correction: z.string().trim().max(300).optional(),
  })
  .refine((value) => value.decision !== "corrected" || Boolean(value.correction), {
    error: "Say what’s actually true before correcting it.",
    path: ["correction"],
  });

const addBeliefSchema = z.object({
  householdId: z.uuid(),
  category: z.enum(["family_roles", "home_routines", "education", "finance", "lifestyle", "safety"]),
  claim: z.string().trim().min(1, { error: "Say what's true." }).max(300),
});

/**
 * Telling WonderHome something directly — the manual half of Certification's
 * "add a belief", which previously only opened the AI chat (rule 3: one door
 * to the assistant, not a shortcut duplicated on every screen; rule 2: an
 * entity a household can create must have a manual path too).
 *
 * Written straight to `confirmed`: a household member typing this in has
 * stated it, the same standing a correction already gets in
 * `reviewCertificationAction`.
 */
export async function addBeliefAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = addBeliefSchema.safeParse({
    householdId: formData.get("householdId"),
    category: formData.get("category"),
    claim: formData.get("claim"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const supabase = await createClient();
  try {
    const membership = await requireMembership(supabase, parsed.data.householdId);
    if (membership.memberType === "child") {
      return { error: "Only an adult in the household can tell WonderHome something new." };
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("certification_items").insert({
      household_id: parsed.data.householdId,
      category: parsed.data.category,
      claim: parsed.data.claim,
      scope: "household",
      source_type: "setup",
      source_detail: `added by ${membership.displayName}`,
      status: "confirmed",
      risk_level: "low",
      last_reviewed_at: now,
      last_reviewed_by: membership.memberId,
    });
    if (error) throw new Error(`addBelief failed: ${error.code ?? "unknown"}`);

    revalidatePath("/certification");
    return { notice: "Added, and confirmed — it's your own household saying so." };
  } catch (error) {
    log.warn("adding a belief failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { error: "That didn't go through. Please try again." };
  }
}

export async function reviewCertificationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    householdId: formData.get("householdId"),
    itemId: formData.get("itemId"),
    decision: formData.get("decision"),
    correction: formData.get("correction") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That review could not be read. Please try again." };
  }

  const supabase = await createClient();
  try {
    const membership = await requireMembership(supabase, parsed.data.householdId);
    // Children read their own items; changing what the household believes is an adult's call.
    if (membership.memberType === "child") {
      return { error: "Only an adult in the household can review what WonderHome believes." };
    }

    const { data: row } = await supabase
      .from("certification_items")
      .select("id, category, claim, scope, member_id, source_type, source_detail, status, risk_level, last_reviewed_at")
      .eq("id", parsed.data.itemId)
      .eq("household_id", parsed.data.householdId)
      .maybeSingle();
    if (!row) {
      return { error: "That item is no longer there — it may already have been reviewed." };
    }

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
    const correction = parsed.data.decision === "corrected" ? parsed.data.correction ?? null : null;

    const admin = createAdminClient();
    // The retired item keeps the claim it had: the correction is a new item
    // (below), so what was believed and what replaced it are both on record.
    await admin
      .from("certification_items")
      .update({
        status: updated.status,
        last_reviewed_at: now.toISOString(),
        last_reviewed_by: membership.memberId,
      })
      .eq("id", item.id);

    if (correction) {
      const { error: insertError } = await admin.from("certification_items").insert({
        household_id: parsed.data.householdId,
        category: item.category,
        claim: correction,
        scope: row.scope,
        member_id: row.member_id,
        source_type: "conversation",
        source_detail: `corrected by ${membership.displayName}`,
        // A person just stated it, so it is confirmed by the family from the start.
        status: "confirmed",
        risk_level: item.riskLevel,
        last_reviewed_at: now.toISOString(),
        last_reviewed_by: membership.memberId,
      });
      if (insertError) throw new Error(`replacement insert failed: ${insertError.code ?? "unknown"}`);
    }

    await admin.from("certification_reviews").insert({
      household_id: parsed.data.householdId,
      item_id: item.id,
      reviewer_member_id: membership.memberId,
      decision: parsed.data.decision,
      previous_value: { claim: item.claim, status: item.status },
      new_value: { claim: correction ?? item.claim, status: updated.status },
    });

    revalidatePath("/certification");
    return {
      notice:
        parsed.data.decision === "confirmed"
          ? "Confirmed."
          : parsed.data.decision === "removed"
            ? "Removed."
            : parsed.data.decision === "corrected"
              ? `Corrected. WonderHome now believes: “${correction}” — it’s under Confirmed.`
              : "Left for later.",
    };
  } catch (error) {
    log.warn("certification review failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { error: "That review didn’t go through. Please try again." };
  }
}
