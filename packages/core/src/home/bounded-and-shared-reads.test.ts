import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { sharedBills, sharedSchoolItems } from "../calendar/repository";
import { listEvents } from "../family/repository";
import type { Obligation } from "../finance/payments";
import { listMeals, listRecipeChoices, recipeSet } from "../meals/repository";
import type { SchoolItem } from "../school/items";

type Row = Record<string, unknown>;

/** A database that logs each read with its filters, so a test can assert the bound and the read count (PERF-03, PERF-10). */
function recordingDatabase(tables: Record<string, Row[]> = {}) {
  const reads: { table: string; filters: string[]; limit: number | null }[] = [];
  const client = {
    from(table: string) {
      const read = { table, filters: [] as string[], limit: null as number | null };
      reads.push(read);
      const query: Record<string, unknown> = {};
      for (const name of ["select", "eq", "is", "in", "gte", "lte", "order"]) {
        query[name] = (...args: unknown[]) => (read.filters.push(`${name}:${args.map(String).join(",")}`), query);
      }
      query.limit = (n: number) => ((read.limit = n), query);
      query.then = (resolve: (result: { data: Row[]; error: null }) => unknown) => resolve({ data: tables[table] ?? [], error: null });
      return query;
    },
  };
  return { supabase: client as unknown as SupabaseClient, reads };
}

describe("PERF-03: bounded reads", () => {
  it("listEvents applies the upper bound and the row limit it is given", async () => {
    const { supabase, reads } = recordingDatabase();
    await listEvents(supabase, "h1", { from: new Date("2026-10-29T00:00:00Z"), to: new Date("2026-11-28T00:00:00Z"), limit: 300 });
    expect(reads[0]!.filters).toContain("lte:starts_at,2026-11-28T00:00:00.000Z");
    expect(reads[0]!.limit).toBe(300);
  });

  it("listEvents without a limit stays unbounded (the Calendar's full list)", async () => {
    const { supabase, reads } = recordingDatabase();
    await listEvents(supabase, "h1", { from: new Date("2026-10-29T00:00:00Z") });
    expect(reads[0]!.limit).toBeNull();
  });

  it("listMeals applies the horizon and the limit, and stays open without them", async () => {
    const bounded = recordingDatabase();
    await listMeals(bounded.supabase, "h1", { from: "2026-10-29", to: "2026-11-28", limit: 200 });
    expect(bounded.reads[0]!.filters).toContain("lte:on_date,2026-11-28");
    expect(bounded.reads[0]!.limit).toBe(200);
    const open = recordingDatabase();
    await listMeals(open.supabase, "h1", { from: "2026-10-29" });
    expect(open.reads[0]!.limit).toBeNull();
  });

  it("a household with 500 future events asks the database for at most 300 inside the horizon", async () => {
    const { supabase, reads } = recordingDatabase();
    await listEvents(supabase, "h1", { from: new Date("2026-10-28T21:00:00Z"), to: new Date("2026-11-28T09:00:00Z"), limit: 300 });
    expect(reads).toHaveLength(1);
    expect(reads[0]!.limit).toBeLessThanOrEqual(300);
    expect(reads[0]!.filters.some((filter) => filter.startsWith("lte:starts_at"))).toBe(true);
  });
});

describe("PERF-09: the calendar takes the plan's bill and school rows", () => {
  const range = { from: "2026-10-29", to: "2026-10-29" };
  const bill = (id: string, dueOn: string | null) => ({ id, name: id, dueOn, status: "due", responsibleMemberId: null }) as unknown as Obligation;
  const item = (id: string, kind: string, dueAt: string | null) =>
    ({ id, childMemberId: "c1", kind, title: id, subject: null, status: "open", dueAt: dueAt ? new Date(dueAt) : null, dueTimeKnown: true, endsAt: null }) as unknown as SchoolItem;

  it("keeps only the bills due in the range", async () => {
    const out = await sharedBills(Promise.resolve([bill("a", "2026-10-29"), bill("b", "2026-10-30"), bill("c", null)]), range);
    expect(out.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("keeps the listed kinds due within the day either side of the range", async () => {
    const out = await sharedSchoolItems(
      Promise.resolve([item("hw", "homework", "2026-10-29T10:00:00Z"), item("other", "reading", "2026-10-29T10:00:00Z"), item("far", "exam", "2026-11-20T10:00:00Z"), item("none", "project", null)]),
      range,
      "UTC",
    );
    expect(out.map((entry) => entry.id)).toEqual(["hw"]);
  });
});

describe("PERF-10: one read per table on Meals", () => {
  it("reads recipes once for the cards and the pickers, and consumables not at all when the ids are shared", async () => {
    const { supabase, reads } = recordingDatabase({ recipes: [] });
    const set = recipeSet(supabase, "h1");
    await Promise.all([set.forEdit, listRecipeChoices(supabase, "h1", { recipes: set.withIngredients, consumableIds: Promise.resolve(new Set(["x"])) })]);
    expect(reads.filter((read) => read.table === "recipes")).toHaveLength(1);
    expect(reads.filter((read) => read.table === "consumables")).toHaveLength(0);
  });
});
