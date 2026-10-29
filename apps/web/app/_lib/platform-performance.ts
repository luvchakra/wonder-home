import "server-only";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import type { PlatformAdmin } from "@wonderhome/core/platform/admin";
import {
  countAdvisorLints,
  parseSnapshot,
  type AdvisorCounts,
  type Budgets,
  type Snapshot,
} from "@wonderhome/core/platform/performance";

import advisorBaseline from "../../../../perf/advisor-baseline.json";
import bundleBudget from "../../../../perf/bundle-budget.json";
import queryBudget from "../../../../perf/query-budget.json";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "kqxndableyysxqhxiorz";

export type Measured<T> = { state: "ok"; value: T } | { state: "unavailable"; reason: string };

/** The database's own statistics, aggregate only, through the staff-only RPC. */
export async function databaseSnapshot(staff: PlatformAdmin): Promise<Measured<Snapshot>> {
  try {
    const admin = adminClientFor(adminGrant.platformAdmin(staff, "read the aggregate performance snapshot"));
    const { data, error } = await admin.rpc("platform_performance_snapshot", { p_staff_profile_id: staff.profileId });
    if (error) return { state: "unavailable", reason: "The database did not return the snapshot." };
    const snapshot = parseSnapshot(data);
    return snapshot ? { state: "ok", value: snapshot } : { state: "unavailable", reason: "The snapshot came back in a shape this page does not know." };
  } catch {
    return { state: "unavailable", reason: "The database could not be reached." };
  }
}

export type LastRun = { action: string; target: string | null; outcome: string; reason: string | null; at: string };

/** The last run of every action and target, for the status line on each button. Empty when unavailable. */
export async function lastRuns(staff: PlatformAdmin): Promise<LastRun[]> {
  try {
    const admin = adminClientFor(adminGrant.platformAdmin(staff, "read the last performance action runs"));
    const { data, error } = await admin.rpc("platform_perf_last_runs", { p_staff_profile_id: staff.profileId });
    if (error || !Array.isArray(data)) return [];
    return data.map((r: Record<string, unknown>) => ({
      action: String(r.action ?? ""),
      target: r.target ? String(r.target) : null,
      outcome: String(r.outcome ?? ""),
      reason: r.reason ? String(r.reason) : null,
      at: String(r.at ?? ""),
    }));
  } catch {
    return [];
  }
}

const baselineCounts = (): AdvisorCounts => {
  const byLint = Object.fromEntries(Object.entries(advisorBaseline.gated as Record<string, string[]>).map(([name, list]) => [name, list.length]));
  const gated = Object.values(byLint).reduce((sum, n) => sum + n, 0);
  return { source: "baseline", gated, info: Object.values(advisorBaseline.info as Record<string, number>).reduce((sum, n) => sum + n, 0), accepted: gated, byLint };
};

/** Live from the Management API when a token is set; otherwise the committed baseline ("as of the last CI run"). */
export async function advisorCounts(): Promise<AdvisorCounts> {
  const baseline = baselineCounts();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) return baseline;
  try {
    const parts = await Promise.all(
      (["security", "performance"] as const).map(async (type) => {
        const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/advisors/${type}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!response.ok) throw new Error("advisor request failed");
        return countAdvisorLints(await response.json());
      }),
    );
    const byLint: Record<string, number> = {};
    for (const p of parts) for (const [name, n] of Object.entries(p.byLint)) byLint[name] = (byLint[name] ?? 0) + n;
    return { source: "live", gated: parts[0].gated + parts[1].gated, info: parts[0].info + parts[1].info, accepted: baseline.accepted, byLint };
  } catch {
    return baseline;
  }
}

/** The committed budgets: what CI enforces, as of the last build. */
export function committedBudgets(): Budgets {
  return {
    sharedCapGz: bundleBudget.sharedCapGz,
    routes: Object.entries(bundleBudget.routes as Record<string, number>)
      .map(([route, capGz]) => ({ route, capGz }))
      .sort((a, b) => b.capGz - a.capGz),
    queries: Object.entries(queryBudget.queries as Record<string, { maxBuffers: number; maxRowsRead: number; maxMs: number; noSeqScan: string[] }>).map(([id, q]) => ({ id, ...q })),
  };
}
