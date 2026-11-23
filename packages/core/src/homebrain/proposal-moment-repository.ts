import type { SupabaseClient } from "@supabase/supabase-js";

import { expandSeries, parseRecurrence } from "../calendar/recurrence";
import { localMoment, shiftDate } from "../notifications/timing";
import type { MomentOccurrence } from "./proposal-moment";

/**
 * The calendar side of `proposal-moment.ts`: the occurrences of what a
 * proposal moves ("morning walk"), from the household's own family events, in
 * the eight days from `from`. Bounded and never throws: a read that fails
 * gives none, and the rules carry on from the words alone.
 */

const FILLER = new Set(["the", "my", "our", "a", "an", "his", "her", "their", "today", "tomorrow", "tonight", "this", "next", "s"]);

export function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !FILLER.has(word));
}

/** Whether an event's title is the thing named: every word said is in the title. */
export function titleMatches(title: string, said: string): boolean {
  const wanted = wordsOf(said);
  const have = wordsOf(title);
  return wanted.length > 0 && wanted.every((word) => have.some((h) => h.startsWith(word) || word.startsWith(h)));
}

export async function targetOccurrences(admin: SupabaseClient, householdId: string, what: string, from: Date, timezone: string): Promise<MomentOccurrence[]> {
  if (wordsOf(what).length === 0) return [];
  try {
    const until = new Date(from.getTime() + 8 * 86_400_000);
    // Two parameterised reads (never an interpolated filter expression): the repeating events, and the one-offs in range.
    const base = () =>
      admin.from("family_events").select("title, starts_at, ends_at, all_day, recurrence, status").eq("household_id", householdId).is("soft_deleted_at", null);
    const [repeating, oneOff] = await Promise.all([
      base().not("recurrence", "is", null).limit(50),
      base().gte("starts_at", from.toISOString()).lte("starts_at", until.toISOString()).limit(50),
    ]);
    if (repeating.error || oneOff.error) return [];
    const data = [...(repeating.data ?? []), ...(oneOff.data ?? [])];
    const fromDay = localMoment(from, timezone).dateKey;
    const range = { from: fromDay, to: shiftDate(fromDay, 8) };
    const out: MomentOccurrence[] = [];
    for (const row of data as { title: string; starts_at: string; ends_at: string | null; all_day: boolean | null; recurrence: unknown; status: string | null }[]) {
      if (row.status === "cancelled" || !titleMatches(row.title ?? "", what)) continue;
      const start = new Date(row.starts_at);
      const end = row.ends_at ? new Date(row.ends_at) : start;
      for (const occurrence of expandSeries({ start, end, allDay: Boolean(row.all_day), timeZone: timezone, rule: parseRecurrence(row.recurrence) }, range)) {
        if (occurrence.start.getTime() > from.getTime()) out.push({ start: occurrence.start });
      }
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 20);
  } catch {
    return [];
  }
}
