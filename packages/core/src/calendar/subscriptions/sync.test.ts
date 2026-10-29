import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { ExistingSubscriptionEvent, SubscriptionEventInput } from "../../family/repository";
import type { CalendarFeedFetch } from "./fetch";
import type { CalendarSubscription } from "./repository";
import { planSubscriptionSync, syncDueSubscriptions, syncSubscription, type FeedFetcher } from "./sync";

// --- a tiny in-memory admin client covering exactly the sync's calls ---------
type Row = Record<string, unknown>;
function fakeAdmin(seed: Record<string, Row[]> = {}): { client: SupabaseClient; tables: Record<string, Row[]> } {
  const tables: Record<string, Row[]> = { households: [], calendar_subscriptions: [], family_events: [], ...seed };
  function query(table: string) {
    const rows = (tables[table] ??= []);
    const filters: ((row: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    const run = (): Row[] => {
      if (mode === "insert" && payload) {
        const inserted = (Array.isArray(payload) ? payload : [payload]).map((v) => ({ id: crypto.randomUUID(), ...v }));
        rows.push(...inserted);
        return inserted;
      }
      const matched = rows.filter((row) => filters.every((f) => f(row)));
      if (mode === "update" && payload) for (const row of matched) Object.assign(row, payload);
      if (mode === "delete") for (const row of matched) rows.splice(rows.indexOf(row), 1);
      return matched;
    };
    const builder: Record<string, unknown> = {
      select() { return builder; },
      insert(v: Row | Row[]) { mode = "insert"; payload = v; return builder; },
      update(v: Row) { mode = "update"; payload = v; return builder; },
      delete() { mode = "delete"; return builder; },
      eq(c: string, v: unknown) { filters.push((row) => row[c] === v); return builder; },
      in(c: string, vs: unknown[]) { filters.push((row) => vs.includes(row[c])); return builder; },
      async maybeSingle() { return { data: run()[0] ?? null, error: null }; },
      then<T>(resolve: (value: { data: Row[]; error: null }) => T) { return Promise.resolve({ data: run(), error: null }).then(resolve); },
    };
    return builder;
  }
  // The delivery clock claims due feeds through an RPC; the fake returns active, due rows and pushes next_sync_at forward.
  const rpc = async (name: string, args: { p_limit?: number }) => {
    if (name !== "claim_due_calendar_subscriptions") throw new Error(`unexpected rpc ${name}`);
    const due = (tables.calendar_subscriptions ?? []).filter((row) => row.status === "active" && String(row.next_sync_at) <= NOW.toISOString()).slice(0, args.p_limit ?? 25);
    for (const row of due) row.next_sync_at = new Date(NOW.getTime() + Number(row.sync_interval_minutes ?? 360) * 60_000).toISOString();
    return { data: due, error: null };
  };
  return { client: { from: (t: string) => query(t), rpc } as unknown as SupabaseClient, tables };
}

const CRLF = "\r\n";
function feedOf(...events: string[]): string {
  return `BEGIN:VCALENDAR${CRLF}VERSION:2.0${CRLF}${events.map((e) => `BEGIN:VEVENT${CRLF}${e}${CRLF}END:VEVENT`).join(CRLF)}${CRLF}END:VCALENDAR${CRLF}`;
}
const fetcherOf = (text: string): FeedFetcher => async (url) => ({ ok: true, finalUrl: url, text });
const NOW = new Date("2026-01-10T00:00:00Z");

function subscription(overrides: Partial<CalendarSubscription> = {}): CalendarSubscription {
  return {
    id: "sub-1", householdId: "hh-1", createdByMemberId: "m-1", name: "School", url: "https://cal.example.com/f.ics",
    color: null, visibility: "household", ownerMemberId: null, status: "active", lastSyncAt: null, lastSyncStatus: null,
    lastError: null, eventCount: 0, nextSyncAt: NOW, syncIntervalMinutes: 360, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

const evt = (externalId: string, title: string, ms: number): SubscriptionEventInput => ({ externalId, title, startsAt: new Date(ms), endsAt: new Date(ms + 3_600_000), allDay: false, timeZone: "UTC", location: null, notes: null });
const existing = (id: string, e: SubscriptionEventInput): ExistingSubscriptionEvent => ({ id, ...e });

describe("planSubscriptionSync", () => {
  it("inserts the new, updates the changed, deletes the dropped, leaves the same", () => {
    const a = evt("a", "A", 1000);
    const bOld = existing("id-b", evt("b", "B", 2000));
    const cOld = existing("id-c", evt("c", "C", 3000));
    const plan = planSubscriptionSync([bOld, cOld], [a, evt("b", "B changed", 2000)]);
    expect(plan.insert.map((e) => e.externalId)).toEqual(["a"]);
    expect(plan.update.map((u) => u.event.externalId)).toEqual(["b"]);
    expect(plan.deleteIds).toEqual(["id-c"]);
  });

  it("is a no-op for an unchanged feed", () => {
    const a = evt("a", "A", 1000);
    const plan = planSubscriptionSync([existing("id-a", a)], [evt("a", "A", 1000)]);
    expect(plan).toEqual({ insert: [], update: [], deleteIds: [] });
  });
});

describe("syncSubscription", () => {
  it("imports a feed's events read-only into family_events", async () => {
    const { client, tables } = fakeAdmin({ households: [{ id: "hh-1", timezone: "UTC" }] });
    const fetchFeed = fetcherOf(feedOf("UID:a\r\nSUMMARY:Sports day\r\nDTSTART:20260115T090000Z\r\nDTEND:20260115T100000Z"));
    const outcome = await syncSubscription(client, subscription(), { fetchFeed, now: NOW });
    expect(outcome).toMatchObject({ ok: true, inserted: 1, updated: 0, deleted: 0, eventCount: 1 });
    expect(tables.family_events!).toHaveLength(1);
    expect(tables.family_events![0]).toMatchObject({ source_subscription_id: "sub-1", external_id: "a", title: "Sports day", status: "confirmed", visibility: "household", owner_member_id: null });
  });

  it("is idempotent — a second run over the same feed writes nothing new", async () => {
    const { client, tables } = fakeAdmin({ households: [{ id: "hh-1", timezone: "UTC" }] });
    const fetchFeed = fetcherOf(feedOf("UID:a\r\nSUMMARY:Sports day\r\nDTSTART:20260115T090000Z\r\nDTEND:20260115T100000Z"));
    await syncSubscription(client, subscription(), { fetchFeed, now: NOW });
    const second = await syncSubscription(client, subscription(), { fetchFeed, now: NOW });
    expect(second).toMatchObject({ inserted: 0, updated: 0, deleted: 0 });
    expect(tables.family_events!).toHaveLength(1);
  });

  it("deletes an event the feed dropped", async () => {
    const { client, tables } = fakeAdmin({ households: [{ id: "hh-1", timezone: "UTC" }] });
    await syncSubscription(client, subscription(), { fetchFeed: fetcherOf(feedOf("UID:a\r\nDTSTART:20260115T090000Z", "UID:b\r\nDTSTART:20260116T090000Z")), now: NOW });
    expect(tables.family_events!).toHaveLength(2);
    const outcome = await syncSubscription(client, subscription(), { fetchFeed: fetcherOf(feedOf("UID:a\r\nDTSTART:20260115T090000Z")), now: NOW });
    expect(outcome).toMatchObject({ deleted: 1 });
    expect(tables.family_events!.map((r) => r.external_id)).toEqual(["a"]);
  });

  it("records an error and keeps existing events when the fetch fails", async () => {
    const { client, tables } = fakeAdmin({ households: [{ id: "hh-1", timezone: "UTC" }] });
    await syncSubscription(client, subscription(), { fetchFeed: fetcherOf(feedOf("UID:a\r\nDTSTART:20260115T090000Z")), now: NOW });
    expect(tables.family_events!).toHaveLength(1);
    const blocked: FeedFetcher = async () => ({ ok: false, reason: "blocked_address" }) as CalendarFeedFetch;
    const outcome = await syncSubscription(client, subscription({ eventCount: 1 }), { fetchFeed: blocked, now: NOW });
    expect(outcome).toMatchObject({ ok: false, status: "error", lastSyncStatus: "blocked_address" });
    expect(tables.family_events!).toHaveLength(1);
  });

  it("claims and syncs due feeds on the delivery clock (and skips a not-due one)", async () => {
    const due = { id: "sub-due", household_id: "hh-1", created_by_member_id: "m-1", name: "Due", url: "https://cal.example.com/due.ics", color: null, visibility: "household", owner_member_id: null, status: "active", last_sync_at: null, last_sync_status: null, last_error: null, event_count: 0, next_sync_at: new Date("2026-01-09T00:00:00Z").toISOString(), sync_interval_minutes: 360, created_at: NOW.toISOString(), updated_at: NOW.toISOString() };
    const later = { ...due, id: "sub-later", next_sync_at: new Date("2026-01-20T00:00:00Z").toISOString() };
    const { client, tables } = fakeAdmin({ households: [{ id: "hh-1", timezone: "UTC" }], calendar_subscriptions: [due, later] });
    const result = await syncDueSubscriptions(client, { fetchFeed: fetcherOf(feedOf("UID:a\r\nDTSTART:20260115T090000Z")), now: NOW });
    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(tables.family_events!.map((r) => r.source_subscription_id)).toEqual(["sub-due"]);
  });

  it("marks a personal feed's events private to its owner", async () => {
    const { client, tables } = fakeAdmin({ households: [{ id: "hh-1", timezone: "UTC" }] });
    await syncSubscription(client, subscription({ visibility: "private", ownerMemberId: "m-1" }), { fetchFeed: fetcherOf(feedOf("UID:a\r\nDTSTART:20260115T090000Z")), now: NOW });
    expect(tables.family_events![0]).toMatchObject({ visibility: "private", owner_member_id: "m-1" });
  });
});
