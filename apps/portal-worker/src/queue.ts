import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The job queue, backed by `portal_fetch_jobs` (story 08-033). The worker only
 * claims and completes; enqueueing is the web app's "Fetch now" (an Admin, via
 * `enqueue_portal_fetch_job`) and pg_cron's twice-daily `enqueue_all_portal_fetch_jobs`.
 * Claiming uses FOR UPDATE SKIP LOCKED in the SQL function, so running more than
 * one worker is safe.
 */

export type ClaimedJob = { id: string; householdId: string; integrationId: string | null; connectionId: string | null; attempts: number };

type Row = Record<string, unknown>;

export async function claimJob(admin: SupabaseClient): Promise<ClaimedJob | null> {
  const { data, error } = await admin.rpc("claim_portal_fetch_job");
  if (error) throw new Error(`claimJob failed: ${error.code ?? error.message ?? "unknown"}`);
  const row = ((data as Row[] | null) ?? [])[0];
  if (!row) return null;
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    integrationId: (row.integration_id as string | null) ?? null,
    connectionId: (row.connection_id as string | null) ?? null,
    attempts: Number(row.attempts ?? 0),
  };
}

export async function completeJob(
  admin: SupabaseClient,
  jobId: string,
  outcome: { status: "done" | "failed"; reason?: string | null; result?: unknown },
): Promise<void> {
  const { error } = await admin
    .from("portal_fetch_jobs")
    .update({
      status: outcome.status,
      reason: outcome.reason ?? null,
      result: outcome.result ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`completeJob failed: ${error.code ?? "unknown"}`);
}
