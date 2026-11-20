import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { answerTeaches, teachFromEntry } from "./teach-from-entry";

type Row = Record<string, unknown>;

/** A chainable stand-in: `maybeSingle` answers from `rows[table]`; upserts are recorded. */
function fakeClient(rows: Record<string, Row | null>) {
  const upserts: Row[] = [];
  const client = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: table === "homesend_learned_defaults" ? null : (rows[table] ?? null), error: null }),
        upsert: async (row: Row) => {
          upserts.push(row);
          return { error: null };
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, upserts };
}

const base = { householdId: "h1", itemId: "i1", memberId: "mum" };

describe("every answer teaches: which answers", () => {
  it.each([
    ["homesend_check", "looks_right"],
    ["homesend_add", "add"],
    ["homesend_update", "update"],
    ["homebrain_conflict", "keep"],
  ])("a person's %s %s teaches", (source, answer) => {
    expect(answerTeaches(source, answer, false)).toBe(true);
  });
  it("a default never teaches", () => {
    expect(answerTeaches("homesend_check", "looks_right", true)).toBe(false);
    expect(answerTeaches("homesend_update", "update", true)).toBe(false);
  });
  it.each([
    ["homesend_check", "not_right"],
    ["homesend_check", "keep_checking"],
    ["homesend_add", "set_aside"],
    ["homebrain_conflict", "remove"],
    ["sender_trust", "trust"],
    ["homesend_waiting", "note"],
  ])("%s %s teaches nothing", (source, answer) => {
    expect(answerTeaches(source, answer, false)).toBe(false);
  });
});

describe("every answer teaches: what the entry says", () => {
  it("a kept bill teaches the sender's area and the payee's category", async () => {
    const { client, upserts } = fakeClient({
      home_send_items: { classified_kind: "bill", extracted: { payee: "BESCOM Ltd.", billKind: "electricity", amount: 1200 }, sender_address: "billing@bescom.in", understanding: null, routed_table: "obligations", routed_id: "o1" },
    });
    expect(await teachFromEntry(client, base)).toBe(2);
    expect(upserts.map((row) => [row.kind, row.key, row.value_text])).toEqual([
      ["sender_area", "sender:billing@bescom.in", "bill"],
      ["vendor_category", "vendor:bescom", "electricity"],
    ]);
    // Never an amount.
    expect(JSON.stringify(upserts)).not.toContain("1200");
    expect(upserts.every((row) => row.source === "pick" && row.learned_by_member_id === "mum")).toBe(true);
  });

  it("a kept school notice teaches which child, from the routed row", async () => {
    const { client, upserts } = fakeClient({
      home_send_items: { classified_kind: "school_item", extracted: {}, sender_address: null, understanding: { provenance: { sender: "notices@greenwood.edu" } }, routed_table: "school_items", routed_id: "s1" },
      school_items: { child_member_id: "anya" },
    });
    expect(await teachFromEntry(client, base)).toBe(2);
    expect(upserts.map((row) => [row.kind, row.value_member_id ?? row.value_text])).toEqual([
      ["sender_area", "school_item"],
      ["sender_child", "anya"],
    ]);
  });

  it("a health document teaches nothing", async () => {
    const { client, upserts } = fakeClient({
      home_send_items: { classified_kind: "health_document", extracted: {}, sender_address: "dr.rao@clinic.in", understanding: null, routed_table: "health_records", routed_id: "r1" },
    });
    expect(await teachFromEntry(client, base)).toBe(0);
    expect(upserts).toEqual([]);
  });

  it("with no sender, only a bill's category is taught", async () => {
    const { client, upserts } = fakeClient({
      home_send_items: { classified_kind: "bill", extracted: { payee: "Airtel", billKind: "internet" }, sender_address: null, understanding: null, routed_table: "obligations", routed_id: "o1" },
    });
    expect(await teachFromEntry(client, base)).toBe(1);
    expect(upserts[0]!.kind).toBe("vendor_category");
  });

  it("never throws", async () => {
    const client = { from: () => { throw new Error("down"); } } as unknown as SupabaseClient;
    expect(await teachFromEntry(client, base)).toBe(0);
  });
});
