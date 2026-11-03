import { describe, expect, it } from "vitest";

import { memoryDatabase } from "../notifications/test-support";
import { claimWaitingHomeSendItem } from "./repository";

describe("claiming a waiting item for one write (bulk add)", () => {
  it("lets one of two overlapping requests through, and never a handled item", async () => {
    const { client, tables } = memoryDatabase({ home_send_items: [{ id: "i1", household_id: "h1", status: "classified", updated_at: "2026-11-03T10:00:00.000Z" }, { id: "i2", household_id: "h1", status: "routed", updated_at: "2026-11-03T10:00:00.000Z" }] });
    // The table's trigger moves updated_at on every write; the memory table is told to do the same.
    const original = client.from.bind(client);
    client.from = ((table: string) => {
      const builder = original(table) as unknown as { update: (patch: Record<string, unknown>) => unknown };
      const update = builder.update.bind(builder);
      builder.update = (patch: Record<string, unknown>) => update({ ...patch, updated_at: new Date(Date.parse(String(tables.home_send_items![0]!.updated_at)) + 1000).toISOString() });
      return builder;
    }) as typeof client.from;
    const [first, second] = await Promise.all([claimWaitingHomeSendItem(client, "h1", "i1"), claimWaitingHomeSendItem(client, "h1", "i1")]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await claimWaitingHomeSendItem(client, "h1", "i2")).toBe(false);
  });
});
