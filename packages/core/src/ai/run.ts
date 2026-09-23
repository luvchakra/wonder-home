import type { SupabaseClient } from "@supabase/supabase-js";

import { may } from "../billing/repository";
import { createAdminClient } from "../db/admin";
import { lookupAutonomy } from "../household/autonomy-lookup";
import type { PermissionContext } from "../identity/permissions";
import { createNotification } from "../notifications/create";
import { decideNotification, type Candidate, type HouseholdEvent } from "../notifications/decide";
import { householdAssessments } from "./gather-assessments";
import { runExecutor, type ExecutorResult } from "./executors";
import {
  advance,
  approvalFingerprint,
  executeStep,
  type AgentRun,
  type PlannedStep,
  type StepOutcome,
} from "./orchestrator";
import { coordinate } from "./specialists";
import { findTool } from "./tools";

/**
 * Running a household's specialists for real (14-001 through 14-007, made
 * live).
 *
 * Everything this calls already existed and was already correct —
 * `householdAssessments` gathers what every domain screen already computes,
 * `coordinate` plans against the real tool registry, `executeStep`/`advance`
 * decide what may happen. What was missing was a caller: nothing ever
 * created a real `agent_runs` row, resolved a real autonomy setting, called
 * a real write, or told anyone real. This is that caller — the first place
 * any of this touches the live database.
 *
 * A run stops at its first step that is not cleanly `executed`, exactly as
 * `advance()` already intends: the steps after it were planned assuming it
 * happened, so continuing would act on a premise nobody agreed to. A
 * household with several independent things waiting sees them one run at a
 * time, which is slower than parallel but never wrong about what it did.
 */

export type RunActor = {
  memberId: string;
  roles: PermissionContext["roles"];
  memberType?: PermissionContext["memberType"];
};

export type RunSummary = {
  runId: string | null;
  executed: number;
  awaitingApproval: number;
  refused: number;
  headline: string;
};

export async function runHouseholdAgents(
  supabase: SupabaseClient,
  householdId: string,
  actor: RunActor,
): Promise<RunSummary> {
  const entitlement = await may(supabase, householdId, "ai.agent_runs");
  if (!entitlement.allowed) {
    return { runId: null, executed: 0, awaitingApproval: 0, refused: 0, headline: entitlement.reason };
  }

  const admin = createAdminClient();

  const { data: inserted, error: insertError } = await admin
    .from("agent_runs")
    .insert({
      household_id: householdId,
      initiating_member_id: actor.memberId,
      agent_type: "household_agents",
      status: "running",
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return { runId: null, executed: 0, awaitingApproval: 0, refused: 0, headline: "I could not start a check just now — try again in a moment." };
  }
  const runId = (inserted as { id: string }).id;

  const assessments = await householdAssessments(supabase, householdId);
  const { steps, contracts } = coordinate(runId, assessments);

  let run: AgentRun = {
    id: runId,
    householdId,
    phase: "act",
    status: "running",
    steps,
    completedSteps: 0,
    contracts,
    summary: "",
  };

  const permission: PermissionContext = { roles: actor.roles, memberType: actor.memberType };
  const candidate: Candidate = { memberId: actor.memberId, role: "administrator", canAct: true, availability: null };

  let executed = 0;
  let awaitingApproval = 0;
  let refused = 0;

  for (const step of steps) {
    const outcomeKey = typeof step.arguments.outcomeKey === "string" ? step.arguments.outcomeKey : step.toolName;
    // The household's own setting, read by the trusted server for the
    // household this request was already authorised against. Anything but a
    // clean read of a known mode is "observe" (fail closed); what the mode
    // then permits is still decided by authorizeToolCall below.
    const { mode } = await lookupAutonomy(admin, householdId, outcomeKey);

    const { outcome, authorization } = executeStep(step, run, {
      actor: permission,
      actorHouseholdId: householdId,
      autonomy: () => mode,
      entitled: () => true,
    });

    if (outcome.kind === "executed") {
      // The executor's own result decides whether this is done — an
      // authorised step whose write failed, or threw, is refused, never
      // reported as handled.
      const result = await runExecutor(supabase, householdId, step, admin).catch(
        (): ExecutorResult => ({ performed: false, reason: "That could not be completed just now." }),
      );
      const finalOutcome: StepOutcome = result.performed
        ? outcome
        : { kind: "refused", toolName: step.toolName, reason: result.reason };
      await logToolCall(admin, runId, householdId, finalOutcome);
      if (result.performed) executed += 1;
      else refused += 1;
      run = advance(run, finalOutcome);
      if (finalOutcome.kind !== "executed") break;
      continue;
    }

    const refusalCode = outcome.kind === "refused" && !authorization.allowed ? authorization.code : null;
    await logToolCall(admin, runId, householdId, outcome, refusalCode);
    if (outcome.kind === "awaiting_approval") {
      awaitingApproval += 1;
      await notifyApproval(admin, householdId, candidate, step, outcome.reason);
    } else {
      refused += 1;
    }
    run = advance(run, outcome);
    break;
  }

  if (run.status === "running") run = { ...run, status: "succeeded", phase: "done" };
  const headline = summarize(executed, awaitingApproval, refused);

  await admin
    .from("agent_runs")
    .update({
      phase: run.phase,
      status: run.status,
      plan: run.steps,
      completed_steps: run.completedSteps,
      contracts: run.contracts,
      summary: headline.slice(0, 500),
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return { runId, executed, awaitingApproval, refused, headline };
}

async function logToolCall(
  admin: SupabaseClient,
  runId: string,
  householdId: string,
  outcome: StepOutcome,
  refusalCode: string | null = null,
): Promise<void> {
  await admin.from("agent_tool_calls").insert({
    household_id: householdId,
    agent_run_id: runId,
    tool_name: outcome.toolName,
    outcome: outcome.kind,
    refusal_code: outcome.kind === "refused" ? refusalCode : null,
    reason: outcome.kind === "executed" ? null : outcome.reason,
  });
}

/**
 * A run only ever reports what needs a person — routine work stays silent
 * (`decideNotification` already refuses to speak up for a completed,
 * self-resolving thing; this only ever asks it about steps waiting for
 * approval, so it is never called for the quiet, ordinary case).
 */
async function notifyApproval(
  admin: SupabaseClient,
  householdId: string,
  candidate: Candidate,
  step: PlannedStep,
  reason: string,
): Promise<void> {
  const tool = findTool(step.toolName);
  const riskLevel: HouseholdEvent["riskLevel"] =
    tool?.risk === "spends_money" || tool?.risk === "changes_access" ? "high" : tool?.risk === "changes_household" ? "medium" : "low";

  const event: HouseholdEvent = {
    threadKey: approvalFingerprint(step),
    outcomeKey: step.toolName,
    kind: "approval_needed",
    aiResolvable: false,
    riskLevel,
    dueAt: null,
    impact: step.rationale,
    recommendedAction: { action: step.toolName },
  };

  const decision = decideNotification(event, { candidates: [candidate], openThreadKeys: [], now: new Date() });
  if (decision.kind !== "notify") return;

  await createNotification(admin, {
    householdId,
    decision,
    title: "Waiting for your OK",
    body: `${tool?.description ?? step.toolName}: ${step.rationale} — ${reason}`,
  });
}

function summarize(executed: number, awaitingApproval: number, refused: number): string {
  if (executed === 0 && awaitingApproval === 0 && refused === 0) return "I checked, and everything is on track — nothing needs you right now.";
  const parts: string[] = [];
  if (executed > 0) parts.push(`handled ${executed} thing${executed === 1 ? "" : "s"}`);
  if (awaitingApproval > 0) parts.push(`${awaitingApproval} waiting for your OK`);
  if (refused > 0) parts.push(`${refused} I could not act on`);
  return `I checked on things: ${parts.join(", ")}.`;
}
