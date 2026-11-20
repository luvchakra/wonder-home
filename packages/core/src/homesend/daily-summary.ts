import type { SupabaseClient } from "@supabase/supabase-js";

import { localMoment } from "../notifications/timing";

/**
 * Today's HomeSend report in the app (the owner, 2026-11-20: the daily summary
 * replaces "Looks right?"): how many entries HomeSend added today, how many of
 * them are still Checking, and how many things it set aside on its own. The
 * same counts the evening notice carries (`notifications/notices.ts`
 * `homesendSummaryNotices`); the lines themselves, each with Undo or Restore,
 * are HomeSend's own lists. Pure; counted on the household's clock.
 */
export type TodayCounts = { added: number; checking: number; setAside: number };

/** Set aside by a person: their own act, not part of the report. */
const BY_PERSON = new Set(["removed_by_person"]);

export function todayCounts(input: {
  changes: readonly { entityId: string; changeType: string; createdAt: string; undoneAt?: string | null; confirmationState?: string | null }[];
  setAside: readonly { archivedAt: string | null; archiveReason: string | null }[];
  timeZone: string;
  now: Date;
}): TodayCounts {
  const today = localMoment(input.now, input.timeZone).dateKey;
  const isToday = (at: string | null | undefined) => Boolean(at) && localMoment(new Date(at!), input.timeZone).dateKey === today;
  const added = new Map<string, boolean>();
  for (const change of input.changes) {
    if (change.changeType !== "created" || change.undoneAt || !isToday(change.createdAt)) continue;
    added.set(change.entityId, (added.get(change.entityId) ?? false) || change.confirmationState === "unconfirmed");
  }
  const setAside = input.setAside.filter((row) => isToday(row.archivedAt) && !(row.archiveReason && BY_PERSON.has(row.archiveReason))).length;
  return { added: added.size, checking: [...added.values()].filter(Boolean).length, setAside };
}

/** What was set aside in the last day, for `todayCounts`; empty when it can't be read. */
export async function listSetAsideLastDay(supabase: SupabaseClient, householdId: string, now: Date = new Date()): Promise<{ archivedAt: string | null; archiveReason: string | null }[]> {
  const { data, error } = await supabase
    .from("home_send_items")
    .select("archived_at, archive_reason")
    .eq("household_id", householdId)
    .eq("status", "archived")
    .gte("archived_at", new Date(now.getTime() - 86_400_000).toISOString())
    .limit(200);
  if (error) return [];
  return ((data ?? []) as { archived_at: string | null; archive_reason: string | null }[]).map((row) => ({ archivedAt: row.archived_at, archiveReason: row.archive_reason }));
}
