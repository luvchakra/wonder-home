import { describe, expect, it } from "vitest";

import { resolveNotifications } from "./resolve";
import { isMoneyOrHealth, planStale, type OpenNotification, type StaleFacts } from "./stale";

const NOW = new Date("2026-11-22T18:00:00Z");

const row = (id: string, over: Partial<OpenNotification> = {}): OpenNotification => ({
  id,
  household_id: "h",
  recipient_member_id: "m",
  source_type: "approval",
  source_id: "a1",
  thread_key: `t:${id}`,
  category: "system",
  expires_at: null,
  scheduled_for: "2026-11-22T10:00:00Z",
  created_at: "2026-11-22T10:00:00Z",
  ...over,
});

const facts = (over: Partial<StaleFacts> = {}): StaleFacts => ({
  actions: new Map(),
  approvals: new Map(),
  appointments: new Map(),
  routines: new Map(),
  events: new Map(),
  ...over,
});

const reasons = (rows: OpenNotification[], f: StaleFacts) => Object.fromEntries(planStale(rows, f, NOW).map((item) => [item.id, item.reason]));

describe("planStale: each reason (owner, 2026-11-22)", () => {
  it("decided: the proposal it reminds about was answered", () => {
    expect(reasons([row("n")], facts({ actions: new Map([["a1", { status: "approved", reason: null }]]) }))).toEqual({ n: "decided" });
    expect(reasons([row("n")], facts({ actions: new Map([["a1", { status: "rejected", reason: null }]]) }))).toEqual({ n: "decided" });
    expect(reasons([row("n")], facts({ approvals: new Map([["a1", { status: "consumed" }]]) }))).toEqual({ n: "decided" });
  });

  it("superseded: a newer proposal replaced it", () => {
    expect(reasons([row("n")], facts({ actions: new Map([["a1", { status: "expired", reason: "superseded" }]]) }))).toEqual({ n: "superseded" });
  });

  it("expired: the proposal expired, or the notification's own expiry passed", () => {
    expect(reasons([row("n")], facts({ actions: new Map([["a1", { status: "expired", reason: "not_answered" }]]) }))).toEqual({ n: "expired" });
    expect(reasons([row("n", { source_type: "chat_thread", source_id: "c", expires_at: "2026-11-22T17:00:00Z" })], facts())).toEqual({ n: "expired" });
  });

  it("source_gone: the record behind it no longer exists or was switched off", () => {
    expect(reasons([row("n")], facts())).toEqual({ n: "source_gone" });
    expect(reasons([row("n", { source_type: "health_appointment", source_id: "x" })], facts())).toEqual({ n: "source_gone" });
    expect(reasons([row("n", { source_type: "health_routine", source_id: "r", thread_key: "health_routine:r:2026-11-20" })], facts({ routines: new Map([["r", { status: "paused", reminderEnabled: true, nextDueOn: "2026-11-20" }]]) }))).toEqual({ n: "source_gone" });
  });

  it("settled: an appointment completed or cancelled, a measurement logged", () => {
    expect(reasons([row("n", { source_type: "health_appointment", source_id: "x" })], facts({ appointments: new Map([["x", { status: "completed" }]]) }))).toEqual({ n: "settled" });
    expect(reasons([row("n", { source_type: "health_routine", source_id: "r", thread_key: "health_routine:r:2026-10-24" })], facts({ routines: new Map([["r", { status: "active", reminderEnabled: true, nextDueOn: "2026-10-31" }]]) }))).toEqual({ n: "settled" });
  });

  it("past: replies to an event that has ended", () => {
    expect(reasons([row("n", { source_type: "event_replies", source_id: "e" })], facts({ events: new Map([["e", { startsAt: "2026-11-01T10:00:00Z", endsAt: "2026-11-01T12:00:00Z", status: "confirmed" }]]) }))).toEqual({ n: "past" });
  });

  it("duplicate: the older of two about the same thing for the same person", () => {
    const older = row("old", { source_type: "health_appointment", source_id: "x", scheduled_for: "2026-10-22T03:00:00Z" });
    const newer = row("new", { source_type: "health_appointment", source_id: "x", scheduled_for: "2026-10-23T01:30:00Z" });
    expect(reasons([older, newer], facts({ appointments: new Map([["x", { status: "confirmed" }]]) }))).toEqual({ old: "duplicate" });
  });
});

describe("planStale: never cleared while it still needs a person", () => {
  it("a proposal or approval still waiting stays", () => {
    expect(reasons([row("n")], facts({ actions: new Map([["a1", { status: "proposed", reason: null }]]) }))).toEqual({});
    expect(reasons([row("n")], facts({ approvals: new Map([["a1", { status: "pending" }]]) }))).toEqual({});
  });

  it("a past health appointment whose record is not settled stays", () => {
    expect(reasons([row("n", { source_type: "health_appointment", source_id: "x", expires_at: "2026-10-24T00:00:00Z" })], facts({ appointments: new Map([["x", { status: "confirmed" }]]) }))).toEqual({});
  });

  it("a measurement not yet logged stays, however late", () => {
    expect(reasons([row("n", { source_type: "health_routine", source_id: "r", thread_key: "health_routine:r:2026-10-24" })], facts({ routines: new Map([["r", { status: "active", reminderEnabled: true, nextDueOn: "2026-10-24" }]]) }))).toEqual({});
  });

  it("a bill or 'check before paying' is never cleared because its expiry passed", () => {
    expect(reasons([row("n", { source_type: "obligation", source_id: "b", category: "bills", expires_at: "2026-11-01T00:00:00Z" })], facts())).toEqual({});
    expect(isMoneyOrHealth({ source_type: "homesend_item", category: "bills" })).toBe(true);
  });

  it("an event still to come keeps its replies", () => {
    expect(reasons([row("n", { source_type: "event_replies", source_id: "e" })], facts({ events: new Map([["e", { startsAt: "2026-12-08T18:30:00Z", endsAt: "2026-12-09T18:30:00Z", status: "confirmed" }]]) }))).toEqual({});
  });

  it("a person's own HomeTalk reminder and different months of a bill are never duplicates", () => {
    const bills = [row("a", { source_type: "obligation", source_id: "b", category: "bills", thread_key: "bill:b:2026-10-24" }), row("b", { source_type: "obligation", source_id: "b", category: "bills", thread_key: "bill:b:2026-11-24" })];
    expect(reasons([...bills, row("r", { source_type: "reminder", source_id: null })], facts())).toEqual({});
  });
});

describe("resolveNotifications", () => {
  it("resolves with its reason, and retries without the column before the migration", async () => {
    const writes: Record<string, unknown>[] = [];
    const admin = {
      from: () => {
        const query: Record<string, unknown> = {};
        let values: Record<string, unknown> = {};
        query.update = (v: Record<string, unknown>) => {
          values = v;
          writes.push(v);
          return query;
        };
        for (const name of ["eq", "in"]) query[name] = () => query;
        query.select = async () => ("resolved_reason" in values ? { data: null, error: { code: "42703" } } : { data: [{ id: "n" }], error: null });
        return query;
      },
    } as never;
    expect(await resolveNotifications(admin, { householdId: "h", ids: ["n"] }, "decided", NOW)).toBe(1);
    expect(writes[0]).toMatchObject({ status: "resolved", resolved_reason: "decided" });
    expect(writes[1]).toEqual({ status: "resolved", resolved_at: NOW.toISOString() });
  });

  it("does nothing for nothing", async () => {
    expect(await resolveNotifications({ from: () => { throw new Error("no"); } } as never, { householdId: "h", ids: [] }, "past")).toBe(0);
  });
});
