import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const audited: { eventType: string; metadata?: Record<string, unknown> }[] = [];
vi.mock("../api/audit", () => ({ auditChange: async (entry: { eventType: string; metadata?: Record<string, unknown> }) => void audited.push(entry) }));
vi.mock("../webhooks/dispatch", () => ({ dispatchWebhookEvent: async () => undefined }));

const { confirmHomeSendEntry, recordHomeSendChange, unconfirmedEntityIds, withConfirmation } = await import("./changes");

type Row = Record<string, unknown>;

/** A `homesend_changes` table in memory; `columns: false` is a database before the migration. */
function table(rows: Row[], columns = true) {
  const NEW = ["confirmation_state", "confidence", "confirmed_at", "confirmed_by_member_id"];
  const from = () => {
    const filters: ((row: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let selected = "";
    const matching = () => rows.filter((row) => filters.every((test) => test(row)));
    const missing = (keys: string[]) => !columns && keys.some((key) => NEW.includes(key));
    const result = () => {
      if (missing([...(patch ? Object.keys(patch) : []), ...selected.split(",").map((c) => c.trim()), ...filtered])) return { data: null, error: { code: "42703" } };
      const hit = matching();
      if (patch) for (const row of hit) Object.assign(row, patch);
      return { data: hit, error: null };
    };
    const filtered: string[] = [];
    const builder: Record<string, unknown> = {
      select: (columnsAsked: string) => ((selected = columnsAsked ?? ""), builder),
      eq: (column: string, value: unknown) => (filtered.push(column), filters.push((row) => row[column] === value), builder),
      is: (column: string, value: unknown) => (filters.push((row) => (row[column] ?? null) === value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
      limit: () => builder,
      order: () => builder,
      update: (values: Row) => ((patch = values), builder),
      insert: (values: Row) => {
        const bad = missing(Object.keys(values));
        const row = { id: `c${rows.length + 1}`, created_at: "2026-11-03T10:00:00Z", undone_at: null, undone_by_member_id: null, ...(columns ? { confirmation_state: "confirmed", confidence: null } : {}), ...values };
        if (!bad) rows.push(row);
        const chain: Record<string, unknown> = { select: () => chain, single: async () => (bad ? { data: null, error: { code: "PGRST204" } } : { data: row, error: null }) };
        return chain;
      },
      then: (resolve: (value: unknown) => void) => resolve(result()),
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

const BASE = { householdId: "h1", intakeId: "i1", domain: "grocery_item" as const, entityId: "e1", createdByMemberId: "m1" };

describe("an entry HomeSend added, and whether it is still being checked (the owner, 2026-11-03)", () => {
  beforeEach(() => void (audited.length = 0));

  it("records below the bar as unconfirmed, with how sure and from where, audited as added on its own", async () => {
    const rows: Row[] = [];
    const change = await recordHomeSendChange(table(rows), { ...BASE, auto: { state: "unconfirmed", confidence: 0.8234, source: "whatsapp" } });
    expect(rows[0]).toMatchObject({ confirmation_state: "unconfirmed", confidence: 0.823 });
    expect(change).toMatchObject({ confirmationState: "unconfirmed", confidence: 0.823 });
    expect(audited).toEqual([expect.objectContaining({ eventType: "homesend.auto_added", metadata: expect.objectContaining({ confirmationState: "unconfirmed", confidence: 0.823, source: "whatsapp" }) })]);
  });

  it("keeps a person's own confirm as it was: confirmed, audited as applied", async () => {
    const rows: Row[] = [];
    await recordHomeSendChange(table(rows), BASE);
    expect(rows[0]).not.toHaveProperty("confidence", 0.8);
    expect(rows[0]!.confirmation_state).toBe("confirmed");
    expect(audited[0]!.eventType).toBe("homesend.applied");
  });

  it("still adds the entry before the migration is live, and reads every change as confirmed", async () => {
    const rows: Row[] = [];
    const client = table(rows, false);
    await recordHomeSendChange(client, { ...BASE, auto: { state: "unconfirmed", confidence: 0.8, source: "paste" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("confirmation_state");
    const [read] = await withConfirmation(client, "h1", [{ id: rows[0]!.id } as never]);
    expect(read).toMatchObject({ confirmationState: "confirmed", confidence: null });
    expect(await unconfirmedEntityIds(client, "h1")).toEqual(new Set());
  });

  it("lists only live, unconfirmed entries of this household as held", async () => {
    const rows: Row[] = [
      { id: "a", household_id: "h1", entity_id: "e1", confirmation_state: "unconfirmed", undone_at: null },
      { id: "b", household_id: "h1", entity_id: "e2", confirmation_state: "confirmed", undone_at: null },
      { id: "c", household_id: "h1", entity_id: "e3", confirmation_state: "unconfirmed", undone_at: "2026-11-03T11:00:00Z" },
      { id: "d", household_id: "h2", entity_id: "e4", confirmation_state: "unconfirmed", undone_at: null },
    ];
    expect(await unconfirmedEntityIds(table(rows), "h1")).toEqual(new Set(["e1"]));
  });

  it("confirms every live write of the item once, by a person, and never another household's", async () => {
    const rows: Row[] = [
      { id: "a", household_id: "h1", intake_id: "i1", domain: "purchase", entity_id: "p1", confirmation_state: "unconfirmed", undone_at: null },
      { id: "b", household_id: "h1", intake_id: "i1", domain: "purchase", entity_id: "p2", confirmation_state: "unconfirmed", undone_at: null },
      { id: "c", household_id: "h2", intake_id: "i1", domain: "purchase", entity_id: "p3", confirmation_state: "unconfirmed", undone_at: null },
    ];
    const client = table(rows);
    expect(await confirmHomeSendEntry(client, "h1", "i1", { memberId: "m1", how: "person" })).toBe(2);
    expect(rows.map((row) => row.confirmation_state)).toEqual(["confirmed", "confirmed", "unconfirmed"]);
    expect(rows[0]).toMatchObject({ confirmed_by_member_id: "m1" });
    expect(audited.map((entry) => entry.eventType)).toEqual(["homesend.confirmed", "homesend.confirmed"]);
    // A second "Looks right" moves nothing and audits nothing.
    expect(await confirmHomeSendEntry(client, "h1", "i1", { memberId: "m1", how: "person" })).toBe(0);
    expect(audited).toHaveLength(2);
  });

  it("confirmed by answers records the new score and no person", async () => {
    const rows: Row[] = [{ id: "a", household_id: "h1", intake_id: "i1", domain: "bill", entity_id: "b1", confirmation_state: "unconfirmed", undone_at: null }];
    await confirmHomeSendEntry(table(rows), "h1", "i1", { memberId: "m1", how: "answers", confidence: 0.97 });
    expect(rows[0]).toMatchObject({ confirmation_state: "confirmed", confirmed_by_member_id: null, confidence: 0.97 });
  });
});
