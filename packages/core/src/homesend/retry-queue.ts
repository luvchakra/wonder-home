import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { understand, type IngestDeps } from "./ingest";
import { getHomeSendItem } from "./repository";

/**
 * Persist first, retry where safe (Wave 5 §15 async processing, §16
 * provider timeout).
 *
 * When a configured provider could not read a HomeSend item (down, slow, or
 * nothing back), the item is already kept and waiting for a person. A
 * `homesend.classify` job asks for it to be read again later, on the shared
 * job queue. The queue brings:
 *   - leases, so two workers never read the same item;
 *   - exponential backoff;
 *   - a dead state after five attempts, so a broken item is visible rather
 *     than retried forever;
 *   - a dedupe key per item, so it is queued at most once while waiting.
 *
 * Retrying is safe because reading an item only ever sets its
 * classification. Nothing is routed into a domain until a person confirms
 * it, and a retry never touches an item someone has already acted on.
 *
 * Service-role only: `public.claim_jobs` / `public.complete_job` are
 * granted to it alone.
 */

export const CLASSIFY_RETRY_KIND = "homesend.classify";
const FIRST_RETRY_AFTER_SECONDS = 300;
const LEASE_SECONDS = 120;

export async function enqueueClassifyRetry(admin: SupabaseClient, input: { householdId: string; itemId: string; now?: Date }): Promise<boolean> {
  const runAfter = new Date((input.now ?? new Date()).getTime() + FIRST_RETRY_AFTER_SECONDS * 1000).toISOString();
  const { error } = await admin.from("jobs").insert({
    household_id: input.householdId,
    kind: CLASSIFY_RETRY_KIND,
    payload: { itemId: input.itemId },
    dedupe_key: input.itemId,
    run_after: runAfter,
  });
  // Already queued and waiting: the unique dedupe index says so, and that is fine.
  if (error && error.code !== "23505") throw new Error(`enqueueClassifyRetry failed: ${error.code ?? "unknown"}`);
  return !error;
}

type ClaimedJob = { id: string; household_id: string | null; kind: string; payload: { itemId?: unknown } | null; attempts: number };

export type DrainOutcome = { claimed: number; succeeded: number; retried: number; skipped: number };

/**
 * Claims due jobs and works through them. Anything this worker does not
 * know is completed with an error, so it backs off and eventually parks as
 * dead instead of being silently dropped.
 */
export async function drainJobs(admin: SupabaseClient, options: { limit?: number; workerId?: string; deps?: IngestDeps } = {}): Promise<DrainOutcome> {
  const { data, error } = await admin.rpc("claim_jobs", { p_worker_id: options.workerId ?? "wonderhome", p_limit: options.limit ?? 10, p_lease_seconds: LEASE_SECONDS });
  if (error) throw new Error(`claim_jobs failed: ${error.code ?? "unknown"}`);
  const jobs = (data ?? []) as ClaimedJob[];
  const outcome: DrainOutcome = { claimed: jobs.length, succeeded: 0, retried: 0, skipped: 0 };

  for (const job of jobs) {
    let failure: string | null = null;
    try {
      if (job.kind !== CLASSIFY_RETRY_KIND) {
        failure = "unknown job kind";
      } else {
        const result = await retryClassification(admin, job, options.deps);
        if (result === "skipped") outcome.skipped += 1;
        if (result === "failed") failure = "classification still unavailable";
      }
    } catch (thrown) {
      failure = thrown instanceof Error ? thrown.name : "error";
    }
    const { error: completeError } = await admin.rpc("complete_job", { p_job_id: job.id, p_error: failure });
    if (completeError) log.warn("complete_job failed", { reason: completeError.code ?? "unknown", allow: ["reason"] });
    if (failure) outcome.retried += 1;
    else outcome.succeeded += 1;
  }
  return outcome;
}

async function retryClassification(admin: SupabaseClient, job: ClaimedJob, deps?: IngestDeps): Promise<"read" | "skipped" | "failed"> {
  const itemId = typeof job.payload?.itemId === "string" ? job.payload.itemId : null;
  if (!itemId || !job.household_id) return "skipped";
  const item = await getHomeSendItem(admin, job.household_id, itemId);
  // Gone, already acted on, or already read: nothing to retry.
  if (!item || (item.status !== "received" && item.status !== "classified")) return "skipped";
  if (item.classifiedKind && item.classifiedKind !== "unknown") return "skipped";
  if (!item.rawText) return "skipped";

  const outcome = await understand(
    admin,
    job.household_id,
    item.id,
    {
      source: { text: item.rawText },
      channel: item.source === "email" ? "email" : "pasted_text",
      context: item.source === "email" ? { channel: "a forwarded email", subject: item.subject, from: item.senderAddress } : { channel: "pasted or forwarded text" },
      text: item.rawText,
    },
    deps,
  );
  return outcome.classifyFailed ? "failed" : "read";
}
