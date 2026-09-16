import "server-only";

import {
  WONDERHOME_PROJECT_REF,
  getPublishableKey,
  getSupabaseUrl,
} from "./project";

export type SupabaseHealth =
  | { ok: true; projectRef: string; url: string; latencyMs: number }
  | { ok: false; projectRef: string; error: string };

/**
 * Checks that the pinned WonderHome project is actually reachable.
 *
 * This deliberately performs a real HTTP round trip to the project's Auth
 * health endpoint. Calling `supabase.auth.getUser()` instead would be a false
 * positive: with no session cookie it fails locally, without touching the
 * network, and would report a healthy connection to an unreachable project.
 */
export async function checkSupabaseHealth(
  timeoutMs = 5000,
): Promise<SupabaseHealth> {
  const startedAt = Date.now();

  try {
    const url = getSupabaseUrl();
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: getPublishableKey() },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `Supabase Auth health check returned HTTP ${response.status}.`,
      );
    }

    return {
      ok: true,
      projectRef: WONDERHOME_PROJECT_REF,
      url,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      projectRef: WONDERHOME_PROJECT_REF,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
