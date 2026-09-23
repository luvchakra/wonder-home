import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";

/**
 * Email forwarding, observed end to end (Wave 5 §14).
 *
 * Every inbound delivery leaves a trail of closed-word events:
 *   - delivered, or refused for a bad signature;
 *   - unrouted (no household address matched);
 *   - a duplicate of one already kept;
 *   - the message or an attachment could not be fetched, or an attachment
 *     was too large;
 *   - the reading failed and a retry was queued;
 *   - over the household's limit;
 *   - processed, with its latency.
 * Nothing from the email itself is ever recorded, so all of it can be
 * counted platform-wide.
 *
 * The §14 alert conditions are evaluated over those counts. A condition
 * that fires is returned by the platform-admin HomeSend metrics and logged
 * at error level, which goes to whatever error reporter the deployment
 * has wired (`observability/error-reporter.ts`). There is no paging
 * integration configured, and nothing here claims one.
 */

export const EMAIL_EVENT_KINDS = [
  "delivered",
  "signature_failed",
  "unrouted",
  "duplicate",
  "fetch_failed",
  "attachment_failed",
  "attachment_too_large",
  "classification_failed",
  "processed",
  "rate_limited",
  "retry_queued",
] as const;

export type EmailEventKind = (typeof EMAIL_EVENT_KINDS)[number];

export type EmailEvent = { kind: EmailEventKind; householdId?: string | null; latencyMs?: number | null; count?: number | null };

/** Records events, best-effort: telemetry never costs a household its email. */
export async function recordEmailEvents(admin: SupabaseClient, events: readonly EmailEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { error } = await admin.from("homesend_email_events").insert(
    events.map((event) => ({
      kind: event.kind,
      household_id: event.householdId ?? null,
      latency_ms: event.latencyMs ?? null,
      count: event.count ?? null,
    })),
  );
  if (error) log.warn("homesend email events not recorded", { reason: error.code ?? "unknown", allow: ["reason"] });
}

export type EmailEventRow = { kind: EmailEventKind; latency_ms: number | null; created_at: string };

export type EmailAlert = { condition: "provider_failures" | "queue_backlog" | "duplicate_spike" | "attachment_failures"; detail: string };

export type EmailMonitoring = {
  windowHours: number;
  counts: Record<EmailEventKind, number>;
  /** Processing latency for processed deliveries, in milliseconds. */
  latencyMs: { median: number | null; p90: number | null; of: number };
  /** Forwarded emails (and their attachments) waiting on a person right now. */
  reviewQueueDepth: number;
  /** Of the forwarded emails that arrived in the window: routed into a domain, and failed safely. */
  routed: { count: number; of: number };
  rejected: { count: number; of: number };
  alerts: EmailAlert[];
};

/**
 * The §14 alert thresholds. Each one counts things that went wrong in the
 * last hour, not averages, so a single bad minute on a quiet day does not
 * page anyone and a real outage does.
 */
export const EMAIL_ALERT_THRESHOLDS = {
  /** The provider's API failed to hand over messages repeatedly. */
  providerFailures: 3,
  /** Forwarded items waiting on a person. */
  queueBacklog: 50,
  /** Duplicates as a share of deliveries, once there are enough deliveries to judge. */
  duplicateShare: 0.5,
  duplicateMinimumDeliveries: 10,
  /** Attachments that could not be fetched or processed. */
  attachmentFailures: 5,
} as const;

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

/** Pure: the same rows always give the same monitoring picture. */
export function summarizeEmail(
  events: readonly EmailEventRow[],
  items: { status: string }[],
  options: { windowHours: number; reviewQueueDepth: number; now: Date },
): EmailMonitoring {
  const counts = Object.fromEntries(EMAIL_EVENT_KINDS.map((kind) => [kind, 0])) as Record<EmailEventKind, number>;
  for (const event of events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;

  const latencies = events
    .filter((event) => event.kind === "processed" && event.latency_ms !== null)
    .map((event) => event.latency_ms!)
    .sort((a, b) => a - b);

  const lastHour = options.now.getTime() - 3_600_000;
  const recent = events.filter((event) => Date.parse(event.created_at) >= lastHour);
  const recentCount = (kind: EmailEventKind) => recent.filter((event) => event.kind === kind).length;

  const alerts: EmailAlert[] = [];
  const t = EMAIL_ALERT_THRESHOLDS;
  if (recentCount("fetch_failed") >= t.providerFailures) {
    alerts.push({ condition: "provider_failures", detail: `${recentCount("fetch_failed")} messages could not be fetched from the email provider in the last hour.` });
  }
  if (options.reviewQueueDepth >= t.queueBacklog) {
    alerts.push({ condition: "queue_backlog", detail: `${options.reviewQueueDepth} forwarded items are waiting on a person.` });
  }
  const deliveries = recentCount("delivered");
  if (deliveries >= t.duplicateMinimumDeliveries && recentCount("duplicate") / deliveries >= t.duplicateShare) {
    alerts.push({ condition: "duplicate_spike", detail: `${recentCount("duplicate")} of ${deliveries} deliveries in the last hour were duplicates.` });
  }
  const attachmentTrouble = recentCount("attachment_failed") + recentCount("attachment_too_large");
  if (attachmentTrouble >= t.attachmentFailures) {
    alerts.push({ condition: "attachment_failures", detail: `${attachmentTrouble} attachments failed in the last hour.` });
  }

  return {
    windowHours: options.windowHours,
    counts,
    latencyMs: { median: percentile(latencies, 50), p90: percentile(latencies, 90), of: latencies.length },
    reviewQueueDepth: options.reviewQueueDepth,
    routed: { count: items.filter((item) => item.status === "routed").length, of: items.length },
    rejected: { count: items.filter((item) => item.status === "failed").length, of: items.length },
    alerts,
  };
}

/** Reads and summarises, platform-wide, with an admin client. Fired alerts are logged at error level. */
export async function loadEmailMonitoring(admin: SupabaseClient, options: { windowHours?: number; now?: Date } = {}): Promise<EmailMonitoring> {
  const windowHours = Math.min(Math.max(Math.trunc(options.windowHours ?? 24), 1), 24 * 30);
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - windowHours * 3_600_000).toISOString();
  const [events, items, queue] = await Promise.all([
    admin.from("homesend_email_events").select("kind, latency_ms, created_at").gte("created_at", since).limit(50_000),
    admin.from("home_send_items").select("status").in("source", ["email", "email_attachment"]).gte("created_at", since).limit(50_000),
    admin.from("home_send_items").select("id", { count: "exact", head: true }).in("source", ["email", "email_attachment"]).in("status", ["received", "classified"]),
  ]);
  if (events.error) throw new Error(`loadEmailMonitoring events failed: ${events.error.code ?? "unknown"}`);
  if (items.error) throw new Error(`loadEmailMonitoring items failed: ${items.error.code ?? "unknown"}`);
  const summary = summarizeEmail((events.data ?? []) as EmailEventRow[], (items.data ?? []) as { status: string }[], {
    windowHours,
    reviewQueueDepth: queue.count ?? 0,
    now,
  });
  for (const alert of summary.alerts) log.error("homesend email alert", { condition: alert.condition, allow: ["condition"] });
  return summary;
}
