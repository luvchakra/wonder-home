import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { AUTONOMY_MODES, type AutonomyMode } from "./autonomy";

/**
 * Reading a household's configured autonomy for an outcome, for the trusted
 * server runtime (`ai/run.ts`).
 *
 * This is infrastructure, not authorization: it only reports what the
 * household set. Whether a governed action may then proceed is still decided
 * by `authorizeToolCall` — scope, entitlement, permission, then autonomy —
 * and, for "execute", by the domain executor's own result.
 *
 * It fails closed. The only way to get anything other than "observe" is a
 * successful read that returned one of the four known modes; a missing
 * wrapper (the 404 / PGRST202 this module was written to end), a database
 * error, a timeout, null, or any value that is not a known mode all resolve
 * to "observe". There is deliberately no path that defaults to "execute".
 *
 * `client` must be the server's admin client: `public.autonomy_for` is
 * granted to service_role only, because `wh.autonomy_for` trusts its caller
 * with the household id. The caller is responsible for having already
 * authorised the request against `householdId`.
 */

export const AUTONOMY_LOOKUP_TIMEOUT_MS = 3000;

export type AutonomyLookupErrorCategory = "rpc_error" | "timeout" | "invalid_value" | "thrown";

export type AutonomyLookup = {
  mode: AutonomyMode;
  /** True only when the database answered with a known mode. */
  success: boolean;
  errorCategory: AutonomyLookupErrorCategory | null;
};

/** A known mode, or null for anything else — never a guess. */
export function parseAutonomyMode(value: unknown): AutonomyMode | null {
  return typeof value === "string" && (AUTONOMY_MODES as readonly string[]).includes(value) ? (value as AutonomyMode) : null;
}

const TIMED_OUT = Symbol("timed out");

export async function lookupAutonomy(
  client: Pick<SupabaseClient, "rpc">,
  householdId: string,
  outcomeKey: string,
  options: { timeoutMs?: number } = {},
): Promise<AutonomyLookup> {
  let result: AutonomyLookup;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), options.timeoutMs ?? AUTONOMY_LOOKUP_TIMEOUT_MS);
    });
    const response = await Promise.race([
      Promise.resolve(client.rpc("autonomy_for", { p_household_id: householdId, p_outcome_key: outcomeKey })),
      timeout,
    ]);
    if (response === TIMED_OUT) {
      result = { mode: "observe", success: false, errorCategory: "timeout" };
    } else if (response.error) {
      result = { mode: "observe", success: false, errorCategory: "rpc_error" };
    } else {
      const mode = parseAutonomyMode(response.data);
      result = mode ? { mode, success: true, errorCategory: null } : { mode: "observe", success: false, errorCategory: "invalid_value" };
    }
  } catch {
    result = { mode: "observe", success: false, errorCategory: "thrown" };
  } finally {
    if (timer) clearTimeout(timer);
  }

  const fields = {
    household_id: householdId,
    outcome_key: outcomeKey,
    resolved_autonomy: result.mode,
    lookup_success: result.success,
    lookup_error_category: result.errorCategory,
    allow: ["household_id", "outcome_key", "resolved_autonomy", "lookup_success", "lookup_error_category"],
  };
  if (result.success) log.info("autonomy lookup", fields);
  else log.warn("autonomy lookup failed closed to observe", fields);
  return result;
}
