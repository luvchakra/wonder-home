import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditEvent } from "../api/audit";
import { log } from "../observability/logger";

/**
 * Fulfilling a matured deletion request (story 16-007).
 *
 * `privacy/repository.ts`'s `requestDeletion` has always recorded a real
 * grace window and let a household change its mind — but nothing ever acted
 * once that window passed. `purge.ts`'s own comment named the gap: "a
 * member's data goes when their deletion request matures, which is a
 * different job with different consequences and is not yet built." This is
 * that job.
 *
 * The scope is deliberately narrower than "delete everything this person
 * touched": this scrubs the member's own PII — their name, birthday,
 * nickname, occupation, avatar photo, the extended profile fields a
 * household filled in about them — and detaches them from their account and
 * their roles, but it does not touch any other domain table (a bill they
 * were on, a chore they logged, a meal note that mentions them). Two
 * reasons, both already established in this codebase's own design:
 *
 * - `household_members` rows are never hard-deleted (see `deactivateMember`'s
 *   doc comment) — every other table's `member_id` reference keeps resolving
 *   to the same row, which now carries an anonymized name instead of a real
 *   one, automatically. Nothing else needs to change for the reference to
 *   stop being personal.
 * - Free-text content the household itself wrote (a chore's notes, a meal's
 *   description) is exactly what `purge.ts` already refuses to touch on a
 *   timer ("household_content is deliberately absent: the household wrote
 *   it"). A deletion request does not get a bigger claim on that content
 *   than the retention schedule does — scanning prose for a name and
 *   redacting it is not a thing this can do reliably, and pretending
 *   otherwise would be a worse promise than the honest, narrower one.
 *
 * A person's platform identity (`profiles`/`auth.users`) is untouched too:
 * `privacy_requests` is household-scoped, and the same profile could still
 * belong to another household. Detaching `household_members.profile_id`
 * ends this household's link to it; deleting the account itself, if that is
 * ever wanted, is a bigger, separate decision this table's shape does not
 * claim to make.
 */

type Row = Record<string, unknown>;

export type DeletionFulfillmentOutcome = {
  requestId: string;
  householdId: string;
  subjectMemberId: string | null;
  fulfilled: boolean;
  error?: string;
};

/**
 * Every deletion request past its `acts_at`, still pending — the same
 * "count, don't guess" shape `purge.ts` uses, but keyed to a matured request
 * rather than a row's own age.
 */
export async function fulfillMaturedDeletions(
  adminClient: SupabaseClient,
  now: Date = new Date(),
): Promise<DeletionFulfillmentOutcome[]> {
  const { data, error } = await adminClient
    .from("privacy_requests")
    .select("id, household_id, subject_member_id")
    .eq("kind", "deletion")
    .eq("status", "pending")
    .lte("acts_at", now.toISOString());

  if (error) throw new Error(`fulfillMaturedDeletions lookup failed: ${error.code ?? "unknown"}`);

  const outcomes: DeletionFulfillmentOutcome[] = [];

  for (const row of (data ?? []) as Row[]) {
    const requestId = row.id as string;
    const householdId = row.household_id as string;
    const subjectMemberId = (row.subject_member_id as string | null) ?? null;

    if (!subjectMemberId) {
      // The member row this pointed at is already gone by some other path.
      // Nothing left to scrub — mark it done rather than retrying forever.
      const { error: closeError } = await adminClient
        .from("privacy_requests")
        .update({ status: "completed", completed_at: now.toISOString() })
        .eq("id", requestId);
      outcomes.push({
        requestId,
        householdId,
        subjectMemberId: null,
        fulfilled: !closeError,
        error: closeError ? (closeError.code ?? "unknown") : undefined,
      });
      continue;
    }

    try {
      await fulfillOne(adminClient, { requestId, householdId, subjectMemberId }, now);
      outcomes.push({ requestId, householdId, subjectMemberId, fulfilled: true });
    } catch (thrown) {
      const reason = thrown instanceof Error ? thrown.message : "unknown";
      log.error("deletion fulfillment failed", { requestId, reason, allow: ["requestId", "reason"] });
      outcomes.push({ requestId, householdId, subjectMemberId, fulfilled: false, error: reason });
    }
  }

  return outcomes;
}

async function fulfillOne(
  adminClient: SupabaseClient,
  input: { requestId: string; householdId: string; subjectMemberId: string },
  now: Date,
): Promise<void> {
  const { data: memberRow, error: lookupError } = await adminClient
    .from("household_members")
    .select("avatar_path")
    .eq("id", input.subjectMemberId)
    .maybeSingle();
  if (lookupError) throw new Error(`member lookup failed: ${lookupError.code ?? "unknown"}`);

  const avatarPath = (memberRow as Row | null)?.avatar_path as string | null | undefined;
  if (avatarPath) {
    // Best-effort — a storage hiccup must not block the PII scrub itself,
    // which is the part that actually matters for the deletion promise.
    await adminClient.storage
      .from("avatars")
      .remove([avatarPath])
      .catch(() => undefined);
  }

  const { error: memberError } = await adminClient
    .from("household_members")
    .update({
      display_name: "Removed member",
      date_of_birth: null,
      nickname: null,
      relationship: null,
      occupation: null,
      school_or_work_location: null,
      special_occasion_label: null,
      special_occasion_date: null,
      avatar_path: null,
      profile_id: null,
      status: "inactive",
    })
    .eq("id", input.subjectMemberId)
    .eq("household_id", input.householdId);
  if (memberError) throw new Error(`member scrub failed: ${memberError.code ?? "unknown"}`);

  // Roles lapse with membership, same as any other removal.
  const { error: rolesError } = await adminClient
    .from("household_roles")
    .delete()
    .eq("household_id", input.householdId)
    .eq("member_id", input.subjectMemberId);
  if (rolesError) throw new Error(`role cleanup failed: ${rolesError.code ?? "unknown"}`);

  const { error: requestError } = await adminClient
    .from("privacy_requests")
    .update({ status: "completed", completed_at: now.toISOString() })
    .eq("id", input.requestId);
  if (requestError) throw new Error(`request completion failed: ${requestError.code ?? "unknown"}`);

  await recordAuditEvent(adminClient, {
    householdId: input.householdId,
    eventType: "privacy.deletion_fulfilled",
    targetTable: "household_members",
    targetId: input.subjectMemberId,
    metadata: { requestId: input.requestId },
  });
}
