import { describe, expect, it } from "vitest";

import { enqueueWebhookEvent } from "./dispatch";

type Row = Record<string, unknown>;

function fakeAdminClient(subscriptionIds: string[]) {
  const inserted: Row[] = [];

  const client = {
    from: (table: string) => {
      if (table === "household_webhooks") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                contains: async () => ({ data: subscriptionIds.map((id) => ({ id })), error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "webhook_deliveries") {
        return {
          insert: async (rows: Row[]) => {
            inserted.push(...rows);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { client: client as never, inserted };
}

describe("enqueueWebhookEvent", () => {
  it("enqueues one delivery per active matching subscription", async () => {
    const { client, inserted } = fakeAdminClient(["w-1", "w-2"]);

    const count = await enqueueWebhookEvent(client, {
      householdId: "h-1",
      eventType: "member.added",
      data: { memberId: "m-1" },
    });

    expect(count).toBe(2);
    expect(inserted).toHaveLength(2);
    expect(inserted.map((row) => row.webhook_id)).toEqual(["w-1", "w-2"]);
  });

  it("does nothing when no subscription matches", async () => {
    const { client, inserted } = fakeAdminClient([]);
    const count = await enqueueWebhookEvent(client, { householdId: "h-1", eventType: "member.added", data: {} });
    expect(count).toBe(0);
    expect(inserted).toHaveLength(0);
  });

  it("gives every delivery a distinct event id, even for the same event", async () => {
    const { client, inserted } = fakeAdminClient(["w-1", "w-2"]);
    await enqueueWebhookEvent(client, { householdId: "h-1", eventType: "member.added", data: {} });

    const eventIds = inserted.map((row) => row.event_id);
    expect(new Set(eventIds).size).toBe(2);
  });

  it("stamps the payload with the versioned envelope, matching the row's own event id", async () => {
    const { client, inserted } = fakeAdminClient(["w-1"]);
    await enqueueWebhookEvent(client, { householdId: "h-1", eventType: "subscription.changed", data: { to: "pro" } });

    const row = inserted[0]!;
    const payload = row.payload as Record<string, unknown>;
    expect(payload.eventVersion).toBe(1);
    expect(payload.eventId).toBe(row.event_id);
    expect(payload.eventType).toBe("subscription.changed");
    expect(payload.householdId).toBe("h-1");
    expect(payload.data).toEqual({ to: "pro" });
  });

  it("throws when the lookup fails, so the caller's own catch can decide what to do", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ contains: async () => ({ data: null, error: { code: "boom" } }) }) }) }),
      }),
    } as never;

    await expect(enqueueWebhookEvent(client, { householdId: "h-1", eventType: "member.added", data: {} })).rejects.toThrow();
  });
});
