import { createClient } from "@wonderhome/core/db/server";
import { checkHealth, databaseProbe, statusCodeFor } from "@wonderhome/core/observability/health";

/**
 * Readiness: can this instance serve requests?
 *
 * Separate from /health, which only reports that the process is alive. An
 * orchestrator that restarts a healthy process because its database is briefly
 * slow turns a small problem into a large one.
 *
 * Unauthenticated, so the body names components and timings and nothing about
 * the deployment.
 */
export async function GET() {
  const supabase = await createClient();
  const report = await checkHealth([databaseProbe(supabase)]);

  return new Response(JSON.stringify(report), {
    status: statusCodeFor(report.status),
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const dynamic = "force-dynamic";
