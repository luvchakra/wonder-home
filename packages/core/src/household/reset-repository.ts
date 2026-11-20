import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditEvent } from "../api/audit";
import { ApiError } from "../api/errors";
import { adminClientFor, type AdminGrant } from "../db/admin-context";
import { log } from "../observability/logger";
import { RESET_MANIFEST } from "./full-export";

/**
 * Reset home (story 15-014): the database part in one transaction, then the
 * home's uploaded files.
 *
 * The caller has already checked, in this order: the person is signed in, is
 * this household's owner (`mayResetHome`), typed the home's name, and passed a
 * fresh step-up. The grant can only be minted for the owner
 * (`adminGrant.householdOwner`) and only covers this household. The database
 * function checks the owner and the name again, itself.
 *
 * Files are removed after the commit (Storage is not in the transaction): each
 * batch is tried three times, and anything left is written to the audit trail
 * rather than forgotten. The owner's own photo stays with the owner.
 */

export type ResetOutcome = {
  membersRemoved: number;
  invitationsRevoked: number;
  rowsDeleted: number;
  filesRemoved: number;
  filesLeft: string[];
};

export class ResetUnavailableError extends Error {
  constructor() {
    super("Reset home isn't available yet.");
    this.name = "ResetUnavailableError";
  }
}

type RpcResult = { owner_member_id: string; members_removed: number; invitations_revoked: number; rows_deleted: number };

/** Every object under `prefix` in a bucket, depth first (service role: the files are being removed, not shown). */
async function allPaths(admin: SupabaseClient, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error || !data) break;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      if (item.id === null) paths.push(...(await allPaths(admin, bucket, path, depth + 1)));
      else paths.push(path);
    }
    if (data.length < 100) break;
  }
  return paths;
}

/** Removes the paths in batches, each tried up to three times; returns what is still there. */
export async function removeWithRetry(
  remove: (paths: string[]) => Promise<{ error: unknown }>,
  paths: string[],
  attempts = 3,
): Promise<string[]> {
  const left: string[] = [];
  for (let at = 0; at < paths.length; at += 100) {
    const batch = paths.slice(at, at + 100);
    let done = false;
    for (let attempt = 0; attempt < attempts && !done; attempt++) {
      const { error } = await remove(batch).catch((caught: unknown) => ({ error: caught }));
      done = !error;
    }
    if (!done) left.push(...batch);
  }
  return left;
}

export async function resetHousehold(
  grant: AdminGrant,
  input: { householdId: string; actorProfileId: string; confirmName: string },
): Promise<ResetOutcome> {
  const admin = adminClientFor(grant, input.householdId);

  const { data, error } = await admin.rpc("reset_household", {
    p_household_id: input.householdId,
    p_actor_profile_id: input.actorProfileId,
    p_confirm_name: input.confirmName,
  });

  if (error) {
    if (error.code === "PGRST202") throw new ResetUnavailableError();
    const message = error.message ?? "";
    if (/not_owner/.test(message)) throw new ApiError("forbidden", "Only the home's owner can reset it.");
    if (/name_mismatch/.test(message)) throw new ApiError("unprocessable", "That isn't the home's name. Nothing was changed.");
    log.error("household reset failed", { reason: error.code ?? "unknown", allow: ["reason"] });
    throw new ApiError("internal", "The reset didn't go through, so nothing was changed. Please try again.");
  }

  const result = data as RpcResult;

  // The owner keeps their own photo; every other file under the home goes.
  const { data: owner } = await admin
    .from("household_members")
    .select("avatar_path")
    .eq("household_id", input.householdId)
    .eq("id", result.owner_member_id)
    .maybeSingle();
  const keep = new Set([(owner as { avatar_path?: string | null } | null)?.avatar_path].filter((path): path is string => Boolean(path)));

  let filesRemoved = 0;
  const filesLeft: string[] = [];
  for (const bucket of RESET_MANIFEST.storageBuckets) {
    const paths = (await allPaths(admin, bucket, input.householdId).catch(() => [])).filter((path) => !(bucket === "avatars" && keep.has(path)));
    const left = await removeWithRetry((batch) => admin.storage.from(bucket).remove(batch), paths);
    filesRemoved += paths.length - left.length;
    filesLeft.push(...left.map((path) => `${bucket}/${path}`));
  }

  if (filesLeft.length > 0 || filesRemoved > 0) {
    await recordAuditEvent(admin, {
      householdId: input.householdId,
      eventType: "household.reset.files",
      actorMemberId: result.owner_member_id,
      actorProfileId: input.actorProfileId,
      targetTable: "households",
      targetId: input.householdId,
      metadata: { files_removed: filesRemoved, files_left: filesLeft.length, left: filesLeft.slice(0, 50) },
    });
  }
  if (filesLeft.length > 0) {
    log.warn("household reset left files behind", { count: filesLeft.length, allow: ["count"] });
  }

  return {
    membersRemoved: result.members_removed,
    invitationsRevoked: result.invitations_revoked,
    rowsDeleted: result.rows_deleted,
    filesRemoved,
    filesLeft,
  };
}

/** What the reset screen lists before anyone confirms: counted with the owner's own client. */
export async function resetPreview(supabase: SupabaseClient, householdId: string, ownerMemberId: string | null): Promise<{ otherMembers: number; pendingInvitations: number }> {
  const [members, invitations] = await Promise.all([
    supabase.from("household_members").select("id", { count: "exact", head: true }).eq("household_id", householdId).neq("id", ownerMemberId ?? ""),
    supabase
      .from("household_invitations")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .is("accepted_at", null)
      .is("revoked_at", null),
  ]);
  return { otherMembers: members.count ?? 0, pendingInvitations: invitations.count ?? 0 };
}
