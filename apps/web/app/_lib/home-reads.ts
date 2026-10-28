import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

import { listEvents } from "@wonderhome/core/family/repository";
import { listMeals } from "@wonderhome/core/meals/repository";

/** A local day, YYYY-MM-DD, on the household's clock. */
export function localDay(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
}

/** How far back Home's cat looks for something still on today (an evening that started yesterday). */
export const CAT_LOOKBACK_MS = 12 * 3600 * 1000;

/**
 * Home's events and meals, read once per request (performance audit B4) and
 * shared by the parts that stream separately: the household agenda (events
 * from now, meals from today in UTC, no upper bound), the fortnight list and
 * the cat's thought (events from twelve hours ago to two days ahead, tonight's
 * meals on the household's day). Each read starts at the earliest of those
 * and has no upper bound; every part keeps its own window of the rows.
 */
export const homeRows = cache((supabase: SupabaseClient, householdId: string, timezone: string, nowMs: number) => {
  const now = new Date(nowMs);
  const householdToday = localDay(timezone, now);
  const utcToday = now.toISOString().slice(0, 10);
  const rows = {
    events: listEvents(supabase, householdId, { from: new Date(nowMs - CAT_LOOKBACK_MS) }),
    meals: listMeals(supabase, householdId, { from: householdToday < utcToday ? householdToday : utcToday }),
  };
  // Each part attaches its own handling; a failed read is never unhandled.
  rows.events.catch(() => undefined);
  rows.meals.catch(() => undefined);
  return rows;
});
