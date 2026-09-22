import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { isExpired, RETENTION, type RetentionClass } from "./retention";

/**
 * Applying the retention schedule (story 15-007).
 *
 * The Privacy Centre shows a household how long each kind of thing is kept.
 * That screen is a promise, and this is what makes it true. A retention policy
 * that is published but never applied is worse than none at all, because a
 * household reads it and believes it.
 *
 * The map below is the only place a retention class is connected to the rows
 * it governs. Anything listed here is genuinely deleted on schedule; anything
 * not listed is kept forever, which is why `retention.test.ts` insists every
 * class with a finite window has a target. A class that quietly fell out of
 * this map would leave the screen still promising and the rows still there.
 *
 * It runs on the admin client, by design: purging crosses every household at
 * once, which is exactly the kind of work that must never be reachable from a
 * household's own session. The route that calls it authorises separately.
 */

export type PurgeTarget = {
  table: string;
  /** The column the age is measured from. */
  column: string;
};

/**
 * Where each class lives.
 *
 * `household_content` is deliberately absent: the household wrote it, and
 * nothing here expires a household's own words on a timer. `deleted_member`
 * is absent too, but for a different reason: it does not fit this map's
 * age-cutoff shape at all. A deletion request acts on its own `acts_at`, not
 * on how old a row is, so it is its own job — `privacy/fulfill-deletion.ts`'s
 * `fulfillMaturedDeletions`, called from the same `/platform/retention`
 * sweep this module's `purgeExpired` is.
 */
export const PURGE_TARGETS: Partial<Record<RetentionClass, PurgeTarget[]>> = {
  conversation: [
    { table: "conversation_messages", column: "created_at" },
    { table: "conversation_sessions", column: "updated_at" },
  ],
  memory: [{ table: "memories", column: "updated_at" }],
  notifications: [
    { table: "notifications", column: "created_at" },
    { table: "notification_events", column: "created_at" },
  ],
  integration_events: [{ table: "integration_events", column: "received_at" }],
  usage: [{ table: "usage_counters", column: "updated_at" }],
  audit: [{ table: "audit_events", column: "created_at" }],
  step_up: [{ table: "step_up_verifications", column: "verified_at" }],
};

export type PurgeOutcome = {
  retentionClass: RetentionClass;
  table: string;
  deleted: number;
  /** Set when this table could not be purged. The rest still are. */
  error?: string;
};

/**
 * Deletes everything past its keeping.
 *
 * One table failing does not stop the others. A purge that aborts halfway
 * because one table was locked would silently stop applying the whole policy,
 * and the next run would face the same table — so each is attempted, each
 * result is reported, and the caller can see exactly what did and did not
 * happen.
 */
export async function purgeExpired(
  adminClient: SupabaseClient,
  now: Date = new Date(),
): Promise<PurgeOutcome[]> {
  const outcomes: PurgeOutcome[] = [];

  for (const [key, targets] of Object.entries(PURGE_TARGETS) as [RetentionClass, PurgeTarget[]][]) {
    const days = RETENTION[key].days;
    if (days === null) continue;

    const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();

    for (const target of targets) {
      const { data, error } = await adminClient
        .from(target.table)
        .delete()
        .lt(target.column, cutoff)
        .select("id");

      if (error) {
        outcomes.push({ retentionClass: key, table: target.table, deleted: 0, error: error.code ?? "unknown" });
        log.error("retention purge failed", {
          table: target.table,
          reason: error.code ?? "unknown",
          allow: ["table", "reason"],
        });
        continue;
      }

      outcomes.push({ retentionClass: key, table: target.table, deleted: (data ?? []).length });
    }
  }

  return outcomes;
}

/** A one-line summary for the operational log. Counts only, never content. */
export function summarise(outcomes: readonly PurgeOutcome[]): string {
  const deleted = outcomes.reduce((total, outcome) => total + outcome.deleted, 0);
  const failed = outcomes.filter((outcome) => outcome.error).length;
  return `${deleted} rows past their keeping removed across ${outcomes.length} tables${failed > 0 ? `, ${failed} failed` : ""}.`;
}

/** Whether a row of this class, last touched then, should already be gone. */
export { isExpired };
