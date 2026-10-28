import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reading the portal fetch queue from the web app (story 08-033).
 *
 * The worker writes job rows with the service role; a household may *read* its
 * own jobs (the `portal_fetch_jobs_select` policy). This is how the
 * Connect-school screen tells whether a just-requested "Test" or "Fetch now"
 * signed in or failed — the job's `status` and `reason` are the per-run outcome,
 * no portal content.
 */

export type PortalFetchJobStatus = "pending" | "running" | "done" | "failed";

export type PortalFetchJobView = {
  status: PortalFetchJobStatus;
  reason: string | null;
  requestedAt: Date;
  finishedAt: Date | null;
};

type Row = Record<string, unknown>;

/** The most recent fetch job for one connection, or null if none has ever run. */
export async function latestPortalFetchJob(
  supabase: SupabaseClient,
  householdId: string,
  integrationId: string,
): Promise<PortalFetchJobView | null> {
  const { data, error } = await supabase
    .from("portal_fetch_jobs")
    .select("status, reason, requested_at, finished_at")
    .eq("household_id", householdId)
    .eq("integration_id", integrationId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`latestPortalFetchJob failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as Row;
  return {
    status: row.status as PortalFetchJobStatus,
    reason: (row.reason as string | null) ?? null,
    requestedAt: new Date(row.requested_at as string),
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
  };
}

/** The most recent fetch job for one connection, or null if none has ever run. */
export async function latestConnectionFetchJob(supabase: SupabaseClient, householdId: string, connectionId: string): Promise<PortalFetchJobView | null> {
  const { data, error } = await supabase
    .from("portal_fetch_jobs")
    .select("status, reason, requested_at, finished_at")
    .eq("household_id", householdId)
    .eq("connection_id", connectionId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`latestConnectionFetchJob failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as Row;
  return {
    status: row.status as PortalFetchJobStatus,
    reason: (row.reason as string | null) ?? null,
    requestedAt: new Date(row.requested_at as string),
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
  };
}
