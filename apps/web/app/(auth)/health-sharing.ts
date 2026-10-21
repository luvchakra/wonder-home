import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { grantHealthConsent, listHealthConsents, revokeHealthConsent, type PrivacyScope } from "@wonderhome/core/health/repository";
import { planSharingChange } from "@wonderhome/core/health/sharing";

/**
 * The "People I choose" list every health sheet shows under "Who can see
 * this" (`_components/health-privacy-field.tsx`, the owner, 2026-10-21).
 * The list is the subject's own sharing list (`health_consents`), so saving
 * a sheet with "People I choose" makes that list equal to what was ticked.
 *
 * Called by every health create and update action after its own write
 * succeeded, with the actor's own session: RLS
 * (`health_consents_write_subject_or_guardian`) decides who may change whose
 * list, never this helper. Nothing happens unless the sheet actually showed
 * the list for this same subject — a sheet that never offered it never
 * clears anyone's sharing.
 */
const sharingSchema = z.object({
  shown: z.literal("1"),
  subject: z.uuid(),
  viewers: z.array(z.uuid()).max(100),
});

/** Returns null when nothing needed doing or it all went through; otherwise the household-facing reason it did not. */
export async function applyHealthSharing(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  formData: FormData,
  record: { subjectMemberId: string; privacyScope: PrivacyScope },
): Promise<string | null> {
  if (record.privacyScope !== "selected_family") return null;

  const parsed = sharingSchema.safeParse({
    shown: formData.get("shareShown"),
    subject: formData.get("shareSubject"),
    viewers: formData.getAll("shareWith"),
  });
  if (!parsed.success || parsed.data.subject !== record.subjectMemberId) return null;

  try {
    const current = await listHealthConsents(supabase, actor.householdId, record.subjectMemberId);
    const change = planSharingChange({ subjectMemberId: record.subjectMemberId, current, ticked: parsed.data.viewers });
    if (change.grant.length === 0 && change.revoke.length === 0) return null;

    await Promise.all([
      ...change.grant.map((viewerMemberId) => grantHealthConsent(supabase, actor, { subjectMemberId: record.subjectMemberId, viewerMemberId })),
      ...change.revoke.map((consentId) => revokeHealthConsent(supabase, actor, consentId)),
    ]);
    return null;
  } catch (thrown) {
    return toErrorBody(thrown, "health-sharing").body.error.message;
  }
}

/** The words a create action adds to its notice, or an update action returns as its error, when the list could not be saved. */
export function sharingNotSaved(reason: string): string {
  return `Who can see it was not changed: ${reason}`;
}
