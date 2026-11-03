import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const audits: { eventType: string; targetId?: string | null; metadata?: Record<string, unknown> }[] = [];
vi.mock("../api/audit", () => ({ auditChange: async (entry: (typeof audits)[number]) => void audits.push(entry) }));
// What is on record: a title listed here is "already on record".
const onRecord = new Set<string>();
vi.mock("./reconcile", () => ({
  reconcileHomeSend: async (_client: unknown, _household: string, candidate: { title: string }) =>
    onRecord.has(candidate.title) ? { proposal: { type: "duplicate" }, existingId: "rec-1", existing: {}, verdict: "exact_match", message: "" } : null,
}));

vi.mock("../identity/households", () => ({ listMembers: async () => [{ displayName: "Upasana", nickname: null }] }));

import { restoreHomeSendItem } from "./repository";
import { runHomeSendTidy } from "./tidy-run";
import type { TidyJudge } from "./tidy-model";
import type { TidyVerdict } from "./tidy";

type Row = Record<string, unknown>;

/** The value of a column, or of a JSON path ("understanding->checking", "understanding->>change"). */
function read(row: Row, path: string): unknown {
  const [column, ...rest] = path.split(/->>?/);
  let value: unknown = row[column!];
  for (const key of rest) value = value && typeof value === "object" ? (value as Row)[key] : undefined;
  return value;
}

/** A small database for the tidy: aliased JSON selects, filters, a primary key on the day's run, and updates that only touch what matches. */
function database(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => structuredClone(row))]));
  const from = (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let columns: string | null = null;
    let mode: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row[] = [];
    const rows = () => (tables[table] ??= []);
    const shape = (row: Row) => {
      if (!columns || columns === "*") return { ...row };
      const out: Row = {};
      for (const part of columns.split(",").map((value) => value.trim())) {
        const [alias, path] = part.includes(":") ? part.split(":") : [part.split(/->>?/).pop()!, part];
        out[alias!] = read(row, path!) ?? null;
      }
      return out;
    };
    const builder: Record<string, unknown> = {
      select: (wanted?: string) => ((columns = wanted ?? "*"), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => read(row, column) === value), builder),
      is: (column: string, value: unknown) => (filters.push((row) => (read(row, column) ?? null) === value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(read(row, column))), builder),
      gte: (column: string, value: string) => (filters.push((row) => String(read(row, column) ?? "") >= value), builder),
      order: () => builder,
      limit: () => builder,
      update: (values: Row) => ((mode = "update"), (patch = values), builder),
      insert: (values: Row | Row[]) => {
        mode = "insert";
        inserted = Array.isArray(values) ? values : [values];
        return builder;
      },
      maybeSingle: async () => ({ data: rows().filter((row) => filters.every((test) => test(row))).map(shape)[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => {
        if (mode === "insert") {
          if (table === "homesend_tidy_runs" && inserted.some((row) => rows().some((existing) => existing.household_id === row.household_id && existing.run_on === row.run_on))) {
            return resolve({ data: null, error: { code: "23505" } });
          }
          rows().push(...inserted.map((row) => ({ ...row })));
          return resolve({ data: inserted.map(shape), error: null });
        }
        const hit = rows().filter((row) => filters.every((test) => test(row)));
        if (mode === "update") for (const row of hit) Object.assign(row, patch, table === "home_send_items" ? { updated_at: "2026-11-03T06:00:01Z" } : {});
        resolve({ data: hit.map(shape), error: null });
      },
    };
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, tables };
}

const NOW = new Date("2026-11-03T02:00:00Z"); // 07:30 in Kolkata
const HOUSEHOLD = "h1";

function sent(id: string, extracted: Row, over: Row = {}): Row {
  return {
    id,
    household_id: HOUSEHOLD,
    status: "classified",
    classified_kind: "school_item",
    extracted,
    understanding: { contentSummary: "", change: "new" },
    created_by_member_id: "m1",
    sender_address: null,
    created_at: "2026-10-20T05:00:00Z",
    updated_at: "2026-10-20T05:00:00Z",
    failure_reason: null,
    retry_count: 0,
    retry_requested_at: null,
    archived_at: null,
    archived_from: null,
    archive_reason: null,
    ...over,
  };
}

function seed(items: Row[], policies: Row[] = []) {
  return database({
    households: [{ id: HOUSEHOLD, timezone: "Asia/Kolkata" }],
    home_send_items: items,
    homesend_tidy_runs: [],
    homesend_changes: [],
    household_members: [{ household_id: HOUSEHOLD, display_name: "Upasana", nickname: null }],
    policies,
  });
}

const judgeSaying = (verdict: Omit<TidyVerdict, "item">): (() => Promise<TidyJudge>) => async () => ({
  provider: "anthropic",
  judge: async (_today, questions) => new Map(questions.map((question) => [question.label, { item: question.label, ...verdict }])),
});

const status = (db: ReturnType<typeof database>, id: string) => {
  const row = db.tables.home_send_items!.find((item) => item.id === id)!;
  return `${row.status}${row.archive_reason ? ` ${row.archive_reason}` : ""}`;
};

beforeEach(() => {
  audits.length = 0;
  onRecord.clear();
});

describe("the daily tidy, run", () => {
  it("archives a past event, a duplicate and a superseded one; keeps what is still ahead; audits each", async () => {
    onRecord.add("Milk");
    const db = seed([
      sent("past", { title: "Sports day", dueDate: "2026-10-30" }),
      sent("ahead", { title: "Annual day", dueDate: "2026-11-20" }),
      sent("dupe", { title: "Milk" }, { classified_kind: "grocery_item" }),
      sent("old", { title: "Picnic form" }, { created_at: "2026-10-21T05:00:00Z" }),
      sent("new", { title: "Picnic form" }, { created_at: "2026-10-25T05:00:00Z" }),
    ]);
    const result = await runHomeSendTidy(db.client, { now: NOW, sweep: false, judgeFor: async () => null });
    expect(result.ready).toBe(true);
    expect(status(db, "past")).toBe("archived past_date");
    expect(status(db, "ahead")).toBe("classified");
    expect(status(db, "dupe")).toBe("archived already_recorded");
    expect(status(db, "old")).toBe("archived superseded");
    expect(status(db, "new")).toBe("classified");
    expect(audits.map((entry) => [entry.eventType, entry.targetId, entry.metadata?.reason, entry.metadata?.by])).toEqual([
      ["homesend.auto_archived", "past", "past_date", "rule"],
      ["homesend.auto_archived", "dupe", "already_recorded", "rule"],
      ["homesend.auto_archived", "old", "superseded", "rule"],
    ]);
    const run = db.tables.homesend_tidy_runs![0]!;
    expect(run).toMatchObject({ household_id: HOUSEHOLD, run_on: "2026-11-03", state: "done", kept: 2 });
    expect(run.archived).toEqual([
      { id: "past", reason: "past_date", by: "rule", memberId: "m1" },
      { id: "dupe", reason: "already_recorded", by: "rule", memberId: "m1" },
      { id: "old", reason: "superseded", by: "rule", memberId: "m1" },
    ]);
  });

  it("runs once a day: a second run the same day changes nothing", async () => {
    const db = seed([sent("past", { title: "Sports day", dueDate: "2026-10-30" })]);
    await runHomeSendTidy(db.client, { now: NOW, sweep: false, judgeFor: async () => null });
    db.tables.home_send_items!.push(sent("past2", { title: "Book fair", dueDate: "2026-10-29" }));
    const again = await runHomeSendTidy(db.client, { now: new Date(NOW.getTime() + 3_600_000), sweep: false, judgeFor: async () => null });
    expect(again.households).toEqual([]);
    expect(status(db, "past2")).toBe("classified");
    expect(audits).toHaveLength(1);
  });

  it("waits for 04:00 on the household's own clock", async () => {
    const db = seed([sent("past", { title: "Sports day", dueDate: "2026-10-30" })]);
    const early = await runHomeSendTidy(db.client, { now: new Date("2026-11-02T21:00:00Z"), sweep: false, judgeFor: async () => null }); // 02:30 in Kolkata
    expect(early.households).toEqual([]);
    expect(status(db, "past")).toBe("classified");
  });

  it("does nothing when an Admin turned it off", async () => {
    const db = seed([sent("past", { title: "Sports day", dueDate: "2026-10-30" })], [
      { household_id: HOUSEHOLD, category: "ai_autonomy", name: "Tidy up HomeSend items that no longer apply", active: true, rule: { on: false } },
    ]);
    const result = await runHomeSendTidy(db.client, { now: NOW, sweep: false, judgeFor: async () => null });
    expect(result.households[0]).toMatchObject({ state: "off", archived: [] });
    expect(status(db, "past")).toBe("classified");
    expect(audits).toEqual([]);
  });

  it("keeps a past bill nobody recorded; archives one already on record", async () => {
    onRecord.add("Water bill");
    const db = seed([
      sent("bill", { title: "Electricity bill", dueDate: "2026-10-05", amount: 2140 }, { classified_kind: "bill" }),
      sent("recorded", { title: "Water bill", dueDate: "2026-10-05", amount: 640 }, { classified_kind: "bill" }),
    ]);
    await runHomeSendTidy(db.client, { now: NOW, sweep: false, judgeFor: judgeSaying({ stale: true, reason: "past_date", cited: ["title"], date: "2026-10-05" }) });
    expect(status(db, "bill")).toBe("classified");
    expect(status(db, "recorded")).toBe("archived already_recorded");
  });

  it("archives on a model verdict that checks out, and keeps on one with a wrong date", async () => {
    const good = seed([sent("costume", { title: "Fancy dress", dateText: "Fancy dress on 10th October 2026" })]);
    await runHomeSendTidy(good.client, { now: NOW, sweep: false, judgeFor: judgeSaying({ stale: true, reason: "past_date", cited: ["dateText"], date: "2026-10-10" }) });
    expect(status(good, "costume")).toBe("archived past_date");
    expect(audits[0]).toMatchObject({ eventType: "homesend.auto_archived", metadata: { reason: "past_date", by: "ai" } });

    audits.length = 0;
    const wrong = seed([sent("costume", { title: "Fancy dress", dateText: "Fancy dress on 10th October 2026" })]);
    await runHomeSendTidy(wrong.client, { now: NOW, sweep: false, judgeFor: judgeSaying({ stale: true, reason: "past_date", cited: ["dateText"], date: "2026-10-01" }) });
    expect(status(wrong, "costume")).toBe("classified");
    expect(audits).toEqual([]);
  });

  it("an archived item restores to where it was, its reason cleared by the database", async () => {
    const db = seed([sent("past", { title: "Sports day", dueDate: "2026-10-30" })]);
    await runHomeSendTidy(db.client, { now: NOW, sweep: false, judgeFor: async () => null });
    expect(status(db, "past")).toBe("archived past_date");
    expect(await restoreHomeSendItem(db.client, HOUSEHOLD, "past", "m1")).toBe(true);
    expect(db.tables.home_send_items![0]).toMatchObject({ status: "classified", archived_at: null, archived_from: null });
  });
});
