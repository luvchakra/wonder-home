import type { SupabaseClient } from "@supabase/supabase-js";

import type { HomeSendReviewDecision, HomeSendReviewProposal, HomeSendReviewSubject, HomeSendSource, HomeSendStatus } from "./items";

/**
 * HomeSend's metrics (Wave 3 §19): optimize for correct household outcomes,
 * not AI parse counts.
 *
 * Every figure is a count of things HomeSend evaluated, returned as a
 * numerator and the denominator it is out of (rule 9: a number someone can
 * explain), never a bare percentage. They are read only from closed-word
 * columns — source, status, failure reason, kind, and the review outcome
 * recorded when a person confirmed or set something aside — so they can be
 * counted platform-wide without reading anything a household sent.
 */

export type Ratio = { count: number; of: number };

export type HomeSendMetrics = {
  windowDays: number;
  /** Everything that arrived in the window, by where it came from. */
  intakeBySource: Partial<Record<HomeSendSource, number>>;
  /** Read into something WonderHome recognised, out of everything that got as far as being read. */
  parsingSuccess: Ratio;
  /** Who it was for was resolved from the content, out of reviews where that mattered. */
  entityResolution: Ratio;
  /** "Who is this for?" had to be asked, out of the same. */
  ambiguity: Ratio;
  /** Reviews where reconciliation found the item already on record in some form, out of all reviews. */
  duplicateDetection: Ratio;
  /** What WonderHome proposed was acted on (added, updated, cancelled, applied), out of all reviews. */
  proposalAcceptance: Ratio;
  /** The person changed what was read before confirming it, out of confirmed items WonderHome had read. */
  correction: Ratio;
  /** Writes into a domain that stood, out of every write HomeSend made (the rest were undone). */
  downstreamWriteSuccess: Ratio;
  /** Kept and shown under "Failed safely" instead of acted on, out of everything that arrived. */
  safeRejection: Ratio;
  /** Waiting on a person right now (not windowed). */
  queueDepth: number;
  /** Minutes from arriving to being routed into a domain, for items routed in the window. */
  timeToOutcomeMinutes: { median: number | null; p90: number | null; of: number };
};

export type MetricsItemRow = {
  source: HomeSendSource;
  status: HomeSendStatus;
  classified_kind: string | null;
  review_decision: HomeSendReviewDecision | null;
  review_proposal: HomeSendReviewProposal | null;
  review_subject: HomeSendReviewSubject | null;
  review_corrected: boolean | null;
  created_at: string;
  routed_at: string | null;
};

export type MetricsChangeRow = { undone_at: string | null };

const ACTED: ReadonlySet<HomeSendReviewDecision> = new Set(["added", "updated", "cancelled", "auto_added"]);
const CONFIRMED_BY_A_PERSON: ReadonlySet<HomeSendReviewDecision> = new Set(["added", "updated", "cancelled"]);

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

/** Pure: the same rows always give the same metrics. */
export function summarizeHomeSend(
  rows: readonly MetricsItemRow[],
  changes: readonly MetricsChangeRow[],
  options: { windowDays: number; queueDepth: number },
): HomeSendMetrics {
  const intakeBySource: Partial<Record<HomeSendSource, number>> = {};
  for (const row of rows) intakeBySource[row.source] = (intakeBySource[row.source] ?? 0) + 1;

  // Still "received" means nothing has read it yet — neither a success nor a failure.
  const read = rows.filter((row) => row.status !== "received");
  const recognised = read.filter((row) => row.classified_kind !== null && row.classified_kind !== "unknown");

  const reviewed = rows.filter((row) => row.review_decision !== null);
  const personal = reviewed.filter((row) => row.review_subject === "resolved" || row.review_subject === "asked");
  const confirmed = reviewed.filter((row) => CONFIRMED_BY_A_PERSON.has(row.review_decision!) && row.review_corrected !== null);

  const minutes = rows
    .filter((row) => row.status === "routed" && row.routed_at)
    .map((row) => (Date.parse(row.routed_at!) - Date.parse(row.created_at)) / 60_000)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  return {
    windowDays: options.windowDays,
    intakeBySource,
    parsingSuccess: { count: recognised.length, of: read.length },
    entityResolution: { count: personal.filter((row) => row.review_subject === "resolved").length, of: personal.length },
    ambiguity: { count: personal.filter((row) => row.review_subject === "asked").length, of: personal.length },
    duplicateDetection: { count: reviewed.filter((row) => row.review_proposal !== null).length, of: reviewed.length },
    proposalAcceptance: { count: reviewed.filter((row) => ACTED.has(row.review_decision!)).length, of: reviewed.length },
    correction: { count: confirmed.filter((row) => row.review_corrected === true).length, of: confirmed.length },
    downstreamWriteSuccess: { count: changes.filter((change) => change.undone_at === null).length, of: changes.length },
    safeRejection: { count: rows.filter((row) => row.status === "failed").length, of: rows.length },
    queueDepth: options.queueDepth,
    timeToOutcomeMinutes: {
      median: minutes.length ? Math.round(percentile(minutes, 50)! * 10) / 10 : null,
      p90: minutes.length ? Math.round(percentile(minutes, 90)! * 10) / 10 : null,
      of: minutes.length,
    },
  };
}

/**
 * The same metrics, read. Pass an admin client for the platform-wide view,
 * or a member's own client to count only what their household can see.
 */
export async function loadHomeSendMetrics(supabase: SupabaseClient, options: { windowDays?: number; now?: Date } = {}): Promise<HomeSendMetrics> {
  const windowDays = Math.min(Math.max(Math.trunc(options.windowDays ?? 30), 1), 365);
  const since = new Date((options.now ?? new Date()).getTime() - windowDays * 86_400_000).toISOString();

  const [items, changes, queue] = await Promise.all([
    supabase
      .from("home_send_items")
      .select("source, status, classified_kind, review_decision, review_proposal, review_subject, review_corrected, created_at, routed_at")
      .gte("created_at", since)
      .limit(50_000),
    supabase.from("homesend_changes").select("undone_at").gte("created_at", since).limit(50_000),
    supabase.from("home_send_items").select("id", { count: "exact", head: true }).in("status", ["received", "classified"]),
  ]);
  if (items.error) throw new Error(`loadHomeSendMetrics items failed: ${items.error.code ?? "unknown"}`);
  if (changes.error) throw new Error(`loadHomeSendMetrics changes failed: ${changes.error.code ?? "unknown"}`);

  return summarizeHomeSend((items.data ?? []) as MetricsItemRow[], (changes.data ?? []) as MetricsChangeRow[], {
    windowDays,
    queueDepth: queue.count ?? 0,
  });
}
