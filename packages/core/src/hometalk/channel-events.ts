import type { SupabaseClient } from "@supabase/supabase-js";

import { percentile } from "../evaluation/metrics";
import { log } from "../observability/logger";
import { HOMETALK_CHANNELS, type HomeTalkChannel, type HomeTalkStatus } from "./contract";

/**
 * HomeTalk, observed per channel (voice integration phase 6, "Observability").
 *
 * Every turn through the gateway — and every channel event that is not a
 * turn: a Gemini Live session opened, a token the provider would not issue,
 * a speaker nobody has linked, a rate limit — leaves one row of closed words
 * and numbers. Never an utterance, a transcript or audio: the spec asks for
 * exactly this ("avoid collecting unnecessary voice/audio content"), and it
 * is what lets it be counted platform-wide.
 */

export const CHANNEL_EVENT_OUTCOMES = [
  "answered",
  "clarification_required",
  "approval_required",
  "completed",
  "failed",
  "not_authorized",
  "session_opened",
  "provider_error",
  "unlinked",
  "rate_limited",
] as const;
export type ChannelEventOutcome = (typeof CHANNEL_EVENT_OUTCOMES)[number];

export type ChannelEvent = {
  channel: HomeTalkChannel;
  outcome: ChannelEventOutcome | HomeTalkStatus;
  householdId?: string | null;
  latencyMs?: number | null;
  /** A redelivery answered from its first response — one logical action, counted once. */
  replayed?: boolean;
};

/** Records one event, best-effort: telemetry never costs a household its answer. */
export async function recordChannelEvent(admin: Pick<SupabaseClient, "from">, event: ChannelEvent): Promise<void> {
  try {
    const { error } = await admin.from("hometalk_channel_events").insert({
      channel: event.channel,
      outcome: event.outcome,
      household_id: event.householdId ?? null,
      latency_ms: event.latencyMs === null || event.latencyMs === undefined ? null : Math.max(0, Math.round(event.latencyMs)),
      replayed: event.replayed ?? false,
    });
    if (error) log.warn("hometalk channel event not recorded", { reason: error.code ?? "unknown", allow: ["reason"] });
  } catch {
    log.warn("hometalk channel event not recorded", { reason: "thrown", allow: ["reason"] });
  }
}

export type ChannelEventRow = { channel: HomeTalkChannel; outcome: ChannelEventOutcome; latency_ms: number | null; replayed: boolean };

type Ratio = { count: number; of: number };

/** The spec's metrics for one channel. Every rate is a count out of a count — never a percentage with no source. */
export type ChannelMetrics = {
  requests: number;
  success: Ratio;
  failure: Ratio;
  clarification: Ratio;
  approval: Ratio;
  actionSuccess: Ratio;
  actionFailure: Ratio;
  duplicate: Ratio;
  notAuthorized: Ratio;
  providerErrors: number;
  sessionsOpened: number;
  unlinked: number;
  rateLimited: number;
  latencyMs: { p50: number | null; p95: number | null; of: number };
};

const TURN_OUTCOMES: ReadonlySet<ChannelEventOutcome> = new Set(["answered", "clarification_required", "approval_required", "completed", "failed", "not_authorized"]);

/** Pure: the same rows always give the same picture. */
export function summarizeChannels(rows: readonly ChannelEventRow[]): Record<HomeTalkChannel, ChannelMetrics> {
  const result = {} as Record<HomeTalkChannel, ChannelMetrics>;
  for (const channel of HOMETALK_CHANNELS) {
    const mine = rows.filter((row) => row.channel === channel);
    const turns = mine.filter((row) => TURN_OUTCOMES.has(row.outcome));
    const firstDeliveries = turns.filter((row) => !row.replayed);
    const count = (outcome: ChannelEventOutcome) => firstDeliveries.filter((row) => row.outcome === outcome).length;
    const n = firstDeliveries.length;
    // An action is a turn that reached an executor: completed, or failed after being attempted.
    const actions = count("completed") + count("failed");
    const latencies = firstDeliveries.map((row) => row.latency_ms).filter((value): value is number => value !== null);
    result[channel] = {
      requests: turns.length,
      success: { count: count("answered") + count("completed"), of: n },
      failure: { count: count("failed"), of: n },
      clarification: { count: count("clarification_required"), of: n },
      approval: { count: count("approval_required"), of: n },
      actionSuccess: { count: count("completed"), of: actions },
      actionFailure: { count: count("failed"), of: actions },
      duplicate: { count: turns.length - n, of: turns.length },
      notAuthorized: { count: count("not_authorized"), of: n },
      providerErrors: mine.filter((row) => row.outcome === "provider_error").length,
      sessionsOpened: mine.filter((row) => row.outcome === "session_opened").length,
      unlinked: mine.filter((row) => row.outcome === "unlinked").length,
      rateLimited: mine.filter((row) => row.outcome === "rate_limited").length,
      latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), of: latencies.length },
    };
  }
  return result;
}

/** Reads and summarises, platform-wide, with an admin client. */
export async function loadChannelMetrics(admin: SupabaseClient, options: { windowHours?: number; now?: Date } = {}): Promise<{ windowHours: number; channels: Record<HomeTalkChannel, ChannelMetrics> }> {
  const windowHours = Math.min(Math.max(Math.trunc(options.windowHours ?? 24), 1), 24 * 90);
  const since = new Date((options.now ?? new Date()).getTime() - windowHours * 3_600_000).toISOString();
  const { data, error } = await admin.from("hometalk_channel_events").select("channel, outcome, latency_ms, replayed").gte("created_at", since).limit(100_000);
  if (error) throw new Error(`loadChannelMetrics failed: ${error.code ?? "unknown"}`);
  return { windowHours, channels: summarizeChannels((data ?? []) as ChannelEventRow[]) };
}
