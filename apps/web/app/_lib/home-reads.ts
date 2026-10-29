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
 * from now, meals from today in UTC), the fortnight list and
 * the cat's thought (events from twelve hours ago to two days ahead, tonight's
 * meals on the household's day). Each read starts at the earliest of those
 * and stops at HOME_HORIZON_DAYS ahead, capped by a row limit (performance plan PERF-03);
 * the Calendar and Meals screens keep their full lists. Every part keeps its own window of the rows.
 */
/** How far ahead Home reads: the agenda, the fortnight list and the cat's two days all sit inside it. */
export const HOME_HORIZON_DAYS = 30;
/** A row cap behind the horizon, so one household's calendar cannot grow the read without limit. */
export const HOME_EVENT_LIMIT = 300;
export const HOME_MEAL_LIMIT = 200;

export const homeRows = cache((supabase: SupabaseClient, householdId: string, timezone: string, nowMs: number) => {
  const now = new Date(nowMs);
  const householdToday = localDay(timezone, now);
  const utcToday = now.toISOString().slice(0, 10);
  const horizon = new Date(nowMs + HOME_HORIZON_DAYS * 86_400_000);
  const rows = {
    events: listEvents(supabase, householdId, { from: new Date(nowMs - CAT_LOOKBACK_MS), to: horizon, limit: HOME_EVENT_LIMIT }),
    meals: listMeals(supabase, householdId, {
      from: householdToday < utcToday ? householdToday : utcToday,
      to: horizon.toISOString().slice(0, 10),
      limit: HOME_MEAL_LIMIT,
    }),
  };
  // Each part attaches its own handling; a failed read is never unhandled.
  rows.events.catch(() => undefined);
  rows.meals.catch(() => undefined);
  return rows;
});
