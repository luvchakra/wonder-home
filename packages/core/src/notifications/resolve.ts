import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one way WonderHome clears a notification it no longer needs (owner,
 * 2026-11-22: "keep clearing notifications as decisions are taken and
 * notifications are stale or not applicable anymore").
 *
 * A cleared notification is `resolved`, with when and why; it leaves the bell
 * and the list and stays in history, never deleted. The reasons:
 * - `decided`: the question it asked was answered, by anyone, anywhere;
 * - `superseded`: a newer proposal replaced the one it was about;
 * - `source_gone`: the record behind it was removed or switched off;
 * - `settled`: the record shows it done (an appointment completed or
 *   cancelled, a measurement logged);
 * - `past`: an event it was about has ended, with nothing left to do;
 * - `expired`: its own `expires_at` passed, or the proposal expired;
 * - `duplicate`: a newer open notification about the same thing exists.
 * Money and health are never cleared for `past` or `expired` (`stale.ts`).
 */
export const RESOLVE_REASONS = ["decided", "superseded", "source_gone", "settled", "past", "expired", "duplicate"] as const;
export type ResolveReason = (typeof RESOLVE_REASONS)[number];

const OPEN = ["generated", "delivered", "seen"] as const;

export type ResolveTarget =
  | { householdId: string; ids: readonly string[] }
  | { householdId: string; sourceType: string; sourceIds: readonly string[] };

/**
 * Resolves the open notifications named, with the reason. Returns how many
 * were cleared. Safe before the `resolved_reason` column exists (migration
 * 20261122230000): it retries without it. Never throws.
 */
export async function resolveNotifications(admin: SupabaseClient, target: ResolveTarget, reason: ResolveReason, now: Date = new Date()): Promise<number> {
  const ids = "ids" in target ? target.ids : target.sourceIds;
  if (ids.length === 0) return 0;
  const run = async (withReason: boolean) => {
    let query = admin
      .from("notifications")
      .update({ status: "resolved", resolved_at: now.toISOString(), ...(withReason ? { resolved_reason: reason } : {}) })
      .eq("household_id", target.householdId)
      .in("status", [...OPEN]);
    query = "ids" in target ? query.in("id", [...ids]) : query.eq("source_type", target.sourceType).in("source_id", [...ids]);
    return query.select("id");
  };
  try {
    let { data, error } = await run(true);
    if (error && (error as { code?: string }).code === "42703") ({ data, error } = await run(false));
    return error ? 0 : (data?.length ?? 0);
  } catch {
    return 0;
  }
}
