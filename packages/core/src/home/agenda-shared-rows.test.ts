import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { familyAgenda, listEvents } from "../family/repository";
import { listMeals, mealAgenda } from "../meals/repository";

type Row = Record<string, unknown>;

/**
 * A database of plain rows with the PostgREST filters the readers use
 * (eq, gte, lte, in, order), and a log of every table read, so a test can
 * prove both that an agenda given rows answers exactly as its own read does
 * and that it did not read the table again (performance audit B4).
 */
function fakeDatabase(tables: Record<string, Row[]>) {
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      let rows = [...(tables[table] ?? [])];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => ((rows = rows.filter((row) => row[column] === value)), query),
        in: (column: string, values: unknown[]) => ((rows = rows.filter((row) => values.includes(row[column]))), query),
        gte: (column: string, value: string) => ((rows = rows.filter((row) => String(row[column]) >= value)), query),
        lte: (column: string, value: string) => ((rows = rows.filter((row) => String(row[column]) <= value)), query),
        order: (column: string) => ((rows = rows.sort((a, b) => String(a[column]).localeCompare(String(b[column])))), query),
        then: (resolve: (result: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      };
      return query;
    },
  };
  return { supabase: client as unknown as SupabaseClient, reads };
}

const HOUSEHOLD = "h1";
const NOW = new Date("2026-10-28T09:00:00.000Z");

const event = (id: string, startsAt: string, endsAt: string, status = "planned"): Row => ({
  id,
  household_id: HOUSEHOLD,
  title: `Event ${id}`,
  kind: "family_time",
  starts_at: startsAt,
  ends_at: endsAt,
  protected: false,
  owner_member_id: null,
  status,
  action_state: id === "e3" ? "needs_reply" : null,
  action_due_at: null,
  all_day: false,
  location: null,
  event_participants: [],
});

const meal = (id: string, onDate: string, status = "planned"): Row => ({
  id,
  household_id: HOUSEHOLD,
  name: `Meal ${id}`,
  slot: "dinner",
  on_date: onDate,
  ready_by: `${onDate}T14:00:00.000Z`,
  cook_member_id: null,
  status,
  ready_at: null,
  servings: 4,
  recipes: null,
  meal_ingredient_needs: [],
  origin: null,
});

describe("an agenda given rows a screen already read", () => {
  const events = [
    event("e1", "2026-10-28T02:00:00.000Z", "2026-10-28T03:00:00.000Z"), // earlier today, over
    event("e2", "2026-10-28T08:30:00.000Z", "2026-10-28T09:30:00.000Z"), // running now
    event("e3", "2026-10-29T10:00:00.000Z", "2026-10-29T11:00:00.000Z"),
    event("e4", "2026-12-24T10:00:00.000Z", "2026-12-24T11:00:00.000Z"),
  ];

  it("family: answers exactly as its own read, and never reads family_events again", async () => {
    const own = fakeDatabase({ family_events: events });
    const alone = await familyAgenda(own.supabase, HOUSEHOLD, { now: NOW });

    const shared = fakeDatabase({ family_events: events });
    // Today's screen reads from the start of the day, wider than the agenda.
    const rows = await listEvents(shared.supabase, HOUSEHOLD, { from: new Date("2026-10-28T00:00:00.000Z") });
    shared.reads.length = 0;
    const given = await familyAgenda(shared.supabase, HOUSEHOLD, { now: NOW, events: rows });

    expect(given).toEqual(alone);
    expect(given.rows.map((row) => row.id)).toEqual(["e2", "e3", "e4"]);
    expect(given.checked).toBe(alone.checked);
    expect(shared.reads).not.toContain("family_events");
  });

  const meals = [meal("m1", "2026-10-26"), meal("m2", "2026-10-27"), meal("m3", "2026-10-28"), meal("m4", "2026-11-02"), meal("m5", "2027-01-10")];

  it("meals: answers exactly as its own read, and never reads meals again", async () => {
    const own = fakeDatabase({ meals });
    const alone = await mealAgenda(own.supabase, HOUSEHOLD, { now: NOW });

    const shared = fakeDatabase({ meals });
    // The Meals screen reads from the week's Monday, before today.
    const rows = await listMeals(shared.supabase, HOUSEHOLD, { from: "2026-10-26" });
    shared.reads.length = 0;
    const given = await mealAgenda(shared.supabase, HOUSEHOLD, { now: NOW, meals: rows });

    expect(given).toEqual(alone);
    expect(given.rows.map((row) => row.id)).toEqual(["m3", "m4", "m5"]);
    expect(shared.reads).not.toContain("meals");
  });
});
