"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { grantHealthConsent, revokeHealthConsent, setHealthProfile } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * The health domain's own privacy controls (story 21-001) — who can see a
 * member's health data, and whether HomeBrain may use it at all. Every write
 * still goes through the household's own RLS-scoped client: `setHealthProfile`
 * and `grantHealthConsent` translate a real RLS refusal into a household-facing
 * message, they do not decide who may act.
 */
const scopeSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  privacyScope: z.enum(["private", "selected_family", "household_operational"]),
});

export async function setHealthPrivacyScopeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = scopeSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    privacyScope: formData.get("privacyScope"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    await setHealthProfile(
      supabase,
      { householdId: parsed.data.householdId, memberId: membership.memberId },
      { memberId: parsed.data.memberId, privacyScope: parsed.data.privacyScope },
    );

    revalidatePath("/health");
    return { notice: "Saved. This applies the next time anything new is recorded." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health").body.error.message };
  }
}

const aiSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  aiAssistanceEnabled: z.enum(["true", "false"]),
});

export async function setHealthAiAssistanceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = aiSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    aiAssistanceEnabled: formData.get("aiAssistanceEnabled"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    await setHealthProfile(
      supabase,
      { householdId: parsed.data.householdId, memberId: membership.memberId },
      { memberId: parsed.data.memberId, aiAssistanceEnabled: parsed.data.aiAssistanceEnabled === "true" },
    );

    revalidatePath("/health");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health").body.error.message };
  }
}

const grantSchema = z.object({
  householdId: z.uuid(),
  subjectMemberId: z.uuid(),
  viewerMemberId: z.uuid(),
});

export async function grantHealthConsentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = grantSchema.safeParse({
    householdId: formData.get("householdId"),
    subjectMemberId: formData.get("subjectMemberId"),
    viewerMemberId: formData.get("viewerMemberId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }
  if (parsed.data.subjectMemberId === parsed.data.viewerMemberId) {
    return { error: "A person cannot be given access to their own data — they already have it." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    await grantHealthConsent(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
      subjectMemberId: parsed.data.subjectMemberId,
      viewerMemberId: parsed.data.viewerMemberId,
    });

    revalidatePath("/health");
    return { notice: "Shared. They can now see this in their own view." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health").body.error.message };
  }
}

const revokeSchema = z.object({ householdId: z.uuid(), consentId: z.uuid() });

export async function revokeHealthConsentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = revokeSchema.safeParse({
    householdId: formData.get("householdId"),
    consentId: formData.get("consentId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await revokeHealthConsent(
      supabase,
      { householdId: parsed.data.householdId, memberId: membership.memberId },
      parsed.data.consentId,
    );

    revalidatePath("/health");
    return { notice: "Removed. They can no longer see this." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health").body.error.message };
  }
}
