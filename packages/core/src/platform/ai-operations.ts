import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { platformCan, type PlatformAdmin } from "./admin";

/**
 * AI operations monitoring (story 16-006).
 *
 * `agent_runs` and `agent_tool_calls` (migration 20260917023243) were already
 * built to be operator-safe: a run holds a bounded summary and never a raw
 * prompt, and a tool call holds the tool's name, its outcome and — for a
 * refusal — a code and a short reason. Nothing here adds new storage; it is
 * the platform-side read of what that schema already guarantees cannot hold.
 *
 * A failure is read platform-wide, not per household, and without a support
 * access grant — a tool name and a refusal code describe what WonderHome's
 * own governance did, not what a family said to it. But it is still more
 * detail than a bare count, naming a household and what an agent tried
 * there, so it is `operator`/`owner` only: the migration's own comment says
 * this schema was shaped to be safe "for an operator" to read, and support
 * — scoped to one household at a time, through a reason-coded grant — has
 * no standing need to see failures fleet-wide.
 */

const FAILURE_STATUS = "failed";

export type AgentToolCallOutcome = "executed" | "awaiting_approval" | "refused";

export type AgentToolCallSummary = {
  toolName: string;
  outcome: AgentToolCallOutcome;
  refusalCode: string | null;
  reason: string | null;
  createdAt: string;
};

export type AgentFailureSummary = {
  runId: string;
  householdId: string;
  agentType: string;
  status: string;
  phase: string;
  /** The bounded, prompt-free summary the run itself carries. */
  summary: string | null;
  startedAt: string;
  finishedAt: string | null;
  toolCalls: AgentToolCallSummary[];
};

export type AiOperationsSummary = {
  runningNow: number;
  waitingForApproval: number;
  failedLast24h: number;
};

function requireAiOperationsAccess(actor: PlatformAdmin): void {
  if (!platformCan(actor, "ai_operations.read")) {
    throw ApiError.forbidden("Your platform role cannot view AI operations.");
  }
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit as number), 1), 200);
}

/** Platform-wide counts. System health, not any household's content. */
export async function aiOperationsSummary(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
): Promise<AiOperationsSummary> {
  requireAiOperationsAccess(actor);

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [running, waiting, failed] = await Promise.all([
    adminClient.from("agent_runs").select("id", { count: "exact", head: true }).eq("status", "running"),
    adminClient
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting_for_approval"),
    adminClient
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", FAILURE_STATUS)
      .gte("started_at", since),
  ]);

  return {
    runningNow: running.count ?? 0,
    waitingForApproval: waiting.count ?? 0,
    failedLast24h: failed.count ?? 0,
  };
}

type RunRow = {
  id: string;
  household_id: string;
  agent_type: string;
  status: string;
  phase: string;
  summary: string | null;
  started_at: string;
  finished_at: string | null;
};

type ToolCallRow = {
  agent_run_id: string;
  tool_name: string;
  outcome: string;
  refusal_code: string | null;
  reason: string | null;
  created_at: string;
};

function toSummary(row: RunRow, toolCalls: AgentToolCallSummary[]): AgentFailureSummary {
  return {
    runId: row.id,
    householdId: row.household_id,
    agentType: row.agent_type,
    status: row.status,
    phase: row.phase,
    summary: row.summary,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    toolCalls,
  };
}

function toToolCall(row: ToolCallRow): AgentToolCallSummary {
  return {
    toolName: row.tool_name,
    outcome: row.outcome as AgentToolCallOutcome,
    refusalCode: row.refusal_code,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

async function toolCallsFor(
  adminClient: SupabaseClient,
  runIds: readonly string[],
): Promise<Map<string, AgentToolCallSummary[]>> {
  if (runIds.length === 0) return new Map();

  const { data, error } = await adminClient
    .from("agent_tool_calls")
    .select("agent_run_id, tool_name, outcome, refusal_code, reason, created_at")
    .in("agent_run_id", runIds)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`toolCallsFor failed: ${error.code ?? "unknown"}`);

  const byRun = new Map<string, AgentToolCallSummary[]>();
  for (const row of (data as ToolCallRow[] | null) ?? []) {
    const list = byRun.get(row.agent_run_id) ?? [];
    list.push(toToolCall(row));
    byRun.set(row.agent_run_id, list);
  }
  return byRun;
}

/**
 * Recent failed runs, across every household, most recent first.
 *
 * Empty when nothing has failed — a quiet platform is a valid answer, not a
 * missing one, matching the module's own "continues to work when [...]
 * unavailable" requirement for a dashboard with nothing to show.
 */
export async function listFailedAgentRuns(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
  options: { limit?: number } = {},
): Promise<AgentFailureSummary[]> {
  requireAiOperationsAccess(actor);

  const { data, error } = await adminClient
    .from("agent_runs")
    .select("id, household_id, agent_type, status, phase, summary, started_at, finished_at")
    .eq("status", FAILURE_STATUS)
    .order("started_at", { ascending: false })
    .limit(clampLimit(options.limit));

  if (error) throw new Error(`listFailedAgentRuns failed: ${error.code ?? "unknown"}`);

  const runs = (data as RunRow[] | null) ?? [];
  const toolCalls = await toolCallsFor(
    adminClient,
    runs.map((row) => row.id),
  );

  return runs.map((row) => toSummary(row, toolCalls.get(row.id) ?? []));
}

/** One run's full detail, for "why did this fail" — still nothing but tool names and outcomes. */
export async function agentRunDetail(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
  runId: string,
): Promise<AgentFailureSummary | null> {
  requireAiOperationsAccess(actor);

  const { data, error } = await adminClient
    .from("agent_runs")
    .select("id, household_id, agent_type, status, phase, summary, started_at, finished_at")
    .eq("id", runId)
    .maybeSingle();

  if (error) throw new Error(`agentRunDetail failed: ${error.code ?? "unknown"}`);
  if (!data) return null;

  const toolCalls = await toolCallsFor(adminClient, [runId]);
  return toSummary(data as RunRow, toolCalls.get(runId) ?? []);
}
