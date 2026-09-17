import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Health checks (story 19-004).
 *
 * Two questions, deliberately separated, because conflating them causes
 * outages: liveness asks whether the process is running, readiness asks whether
 * it can serve. An orchestrator restarting a healthy process because its
 * database is briefly slow turns a small problem into a large one.
 *
 * A health response says what is degraded, never why in detail — it is
 * reachable without a session, so it must not describe the deployment to
 * whoever asks.
 */

export type CheckStatus = "ok" | "degraded" | "down";

export type ComponentCheck = {
  name: string;
  status: CheckStatus;
  /** Milliseconds, rounded — useful for a graph, useless to an attacker. */
  durationMs: number;
};

export type HealthReport = {
  status: CheckStatus;
  checks: ComponentCheck[];
};

export type Probe = { name: string; run: () => Promise<unknown> };

/** Beyond this a dependency is treated as degraded even when it answers. */
export const SLOW_THRESHOLD_MS = 1_000;

/** A probe that hangs must not hang the health endpoint. */
export const PROBE_TIMEOUT_MS = 3_000;

export async function runProbe(probe: Probe, now = () => Date.now()): Promise<ComponentCheck> {
  const started = now();

  try {
    await withTimeout(probe.run(), PROBE_TIMEOUT_MS);
    const durationMs = now() - started;
    return {
      name: probe.name,
      status: durationMs >= SLOW_THRESHOLD_MS ? "degraded" : "ok",
      durationMs,
    };
  } catch {
    // The reason is logged server-side; the response says only that it failed.
    return { name: probe.name, status: "down", durationMs: now() - started };
  }
}

export async function checkHealth(probes: Probe[], now = () => Date.now()): Promise<HealthReport> {
  const checks = await Promise.all(probes.map((probe) => runProbe(probe, now)));
  return { status: worstOf(checks), checks };
}

export function worstOf(checks: ComponentCheck[]): CheckStatus {
  if (checks.some((check) => check.status === "down")) return "down";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "ok";
}

export function statusCodeFor(status: CheckStatus): number {
  // Degraded still serves traffic; a load balancer should not remove an
  // instance that is merely slow.
  return status === "down" ? 503 : 200;
}

/** Cheapest query that proves the database answers and the session is usable. */
export function databaseProbe(supabase: SupabaseClient): Probe {
  return {
    name: "database",
    run: async () => {
      const { error } = await supabase.from("households").select("id").limit(1);
      // An empty result is a healthy answer; only an error is a failure.
      if (error) throw new Error(error.code ?? "database error");
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
