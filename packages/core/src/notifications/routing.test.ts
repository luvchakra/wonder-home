import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { channelAllowed, isCategory, isRoutable, loadMutes, muteKey, mutesFrom, setRoute } from "./routing";

describe("which channel carries which kind", () => {
  it("allows everything until a person says otherwise", () => {
    expect(channelAllowed(new Set(), "bills", "push")).toBe(true);
  });

  it("keeps one kind off one channel, and only that one", () => {
    const kept = new Set([muteKey("bills", "whatsapp")]);
    expect(channelAllowed(kept, "bills", "whatsapp")).toBe(false);
    expect(channelAllowed(kept, "bills", "push")).toBe(true);
    expect(channelAllowed(kept, "school", "whatsapp")).toBe(true);
  });

  it("never mutes the in-app list, and never a reminder of no known kind", () => {
    const kept = new Set([muteKey("bills", "in_app"), muteKey("bills", "push")]);
    expect(channelAllowed(kept, "bills", "in_app")).toBe(true);
    expect(channelAllowed(kept, null, "push")).toBe(true);
    expect(channelAllowed(kept, undefined, "push")).toBe(true);
  });

  it("reads only kinds and channels from the closed lists", () => {
    expect(mutesFrom([{ category: "bills", channel: "push" }, { category: "gossip", channel: "push" }, { category: "bills", channel: "in_app" }, { category: "pets", channel: "email" }])).toEqual([
      { category: "bills", channel: "push" },
      { category: "pets", channel: "email" },
    ]);
    expect(mutesFrom(null)).toEqual([]);
    expect(isCategory("meals")).toBe(true);
    expect(isCategory("gossip")).toBe(false);
    expect(isRoutable("whatsapp")).toBe(true);
    expect(isRoutable("in_app")).toBe(false);
  });
});

/** A database that records what is written and answers a read with the rows it was given. */
function fake(options: { rows?: unknown[]; insertError?: { code: string } | null } = {}) {
  const calls: { op: string; values?: unknown; filters: [string, unknown][] }[] = [];
  const client = {
    from() {
      const record = (op: string, values?: unknown) => {
        const call = { op, values, filters: [] as [string, unknown][] };
        calls.push(call);
        const chain: Record<string, unknown> = {
          eq: (column: string, value: unknown) => {
            call.filters.push([column, value]);
            return chain;
          },
          then: (resolve: (value: unknown) => void) => resolve({ data: options.rows ?? [], error: op === "insert" ? (options.insertError ?? null) : null }),
        };
        return chain;
      };
      return { select: () => record("select"), delete: () => record("delete"), insert: (values: unknown) => record("insert", values) };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("saving a choice", () => {
  const base = { householdId: "h1", memberId: "m1" };

  it("keeps a kind off a channel by adding a row, and allows it again by removing it", async () => {
    const database = fake();
    await setRoute(database.client, { ...base, category: "bills", channel: "push", allowed: false });
    await setRoute(database.client, { ...base, category: "bills", channel: "push", allowed: true });
    expect(database.calls[0]).toMatchObject({ op: "insert", values: { household_id: "h1", member_id: "m1", category: "bills", channel: "push" } });
    expect(database.calls[1]).toMatchObject({ op: "delete", filters: [["member_id", "m1"], ["category", "bills"], ["channel", "push"]] });
  });

  it("takes keeping it off twice as the answer asked for", async () => {
    await expect(setRoute(fake({ insertError: { code: "23505" } }).client, { ...base, category: "bills", channel: "push", allowed: false })).resolves.toBeUndefined();
    await expect(setRoute(fake({ insertError: { code: "42501" } }).client, { ...base, category: "bills", channel: "push", allowed: false })).rejects.toThrow();
  });

  it("refuses a kind or a channel outside the lists, touching nothing", async () => {
    const database = fake();
    await expect(setRoute(database.client, { ...base, category: "gossip", channel: "push", allowed: false })).rejects.toThrow();
    await expect(setRoute(database.client, { ...base, category: "bills", channel: "in_app", allowed: false })).rejects.toThrow();
    expect(database.calls).toEqual([]);
  });

  it("reads a member's mutes", async () => {
    expect(await loadMutes(fake({ rows: [{ category: "school", channel: "email" }] }).client, "m1")).toEqual([{ category: "school", channel: "email" }]);
  });
});
