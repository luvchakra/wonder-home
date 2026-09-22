import { describe, expect, it } from "vitest";

import { deliverPendingWebhooks } from "./deliver";

type Row = Record<string, unknown>;

const DUE_ROW: Row = {
  id: "d-1",
  webhook_id: "w-1",
  event_type: "member.added",
  event_id: "e-1",
  payload: { eventVersion: 1, eventId: "e-1", eventType: "member.added", householdId: "h-1", occurredAt: "2026-09-22T00:00:00.000Z", data: {} },
  attempt_count: 0,
  household_webhooks: { url: "https://example.com/hook", secret: "a-real-secret", status: "active" },
};

function fakeAdminClient(dueRows: Row[]) {
  const updates: { id: string; patch: Row }[] = [];

  const client = {
    from: (table: string) => {
      if (table === "webhook_deliveries") {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                limit: async () => ({ data: dueRows, error: null }),
              }),
            }),
          }),
          update: (patch: Row) => ({
            eq: async (_column: string, id: string) => {
              updates.push({ id, patch });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { client: client as never, updates };
}

describe("deliverPendingWebhooks", () => {
  it("marks a delivery delivered on a 2xx response", async () => {
    const { client, updates } = fakeAdminClient([DUE_ROW]);
    const fakeFetch = (async () => new Response(null, { status: 200 })) as typeof fetch;

    const outcomes = await deliverPendingWebhooks(client, new Date("2026-09-22T00:05:00.000Z"), fakeFetch);

    expect(outcomes).toEqual([{ deliveryId: "d-1", outcome: "delivered" }]);
    expect(updates[0]!.patch.status).toBe("delivered");
  });

  it("signs the request with the subscription's own secret and names the event", async () => {
    const { client } = fakeAdminClient([DUE_ROW]);
    let seenHeaders: Record<string, string> | undefined;
    let seenBody: string | undefined;
    const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
      seenHeaders = init?.headers as Record<string, string>;
      seenBody = init?.body as string;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    await deliverPendingWebhooks(client, new Date("2026-09-22T00:05:00.000Z"), fakeFetch);

    expect(seenHeaders?.["webhook-signature"]).toMatch(/^t=\d+,v1=/);
    expect(seenHeaders?.["webhook-id"]).toBe("e-1");
    expect(seenHeaders?.["webhook-event-type"]).toBe("member.added");
    expect(seenBody).toBe(JSON.stringify(DUE_ROW.payload));
  });

  it("schedules a retry on a non-2xx response, incrementing the attempt count", async () => {
    const { client, updates } = fakeAdminClient([DUE_ROW]);
    const fakeFetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;

    const outcomes = await deliverPendingWebhooks(client, new Date("2026-09-22T00:05:00.000Z"), fakeFetch);

    expect(outcomes).toEqual([{ deliveryId: "d-1", outcome: "retrying" }]);
    expect(updates[0]!.patch.attempt_count).toBe(1);
    expect(updates[0]!.patch.last_error).toBe("HTTP 500");
    expect(updates[0]!.patch.next_attempt_at).toBeDefined();
  });

  it("schedules a retry when the request itself throws", async () => {
    const { client, updates } = fakeAdminClient([DUE_ROW]);
    const fakeFetch = (async () => {
      throw new Error("network unreachable");
    }) as typeof fetch;

    const outcomes = await deliverPendingWebhooks(client, new Date("2026-09-22T00:05:00.000Z"), fakeFetch);

    expect(outcomes).toEqual([{ deliveryId: "d-1", outcome: "retrying" }]);
    expect(updates[0]!.patch.last_error).toBe("network unreachable");
  });

  it("exhausts a delivery once every retry has been used", async () => {
    const nearlyExhausted = { ...DUE_ROW, attempt_count: 6 };
    const { client, updates } = fakeAdminClient([nearlyExhausted]);
    const fakeFetch = (async () => new Response(null, { status: 500 })) as typeof fetch;

    const outcomes = await deliverPendingWebhooks(client, new Date("2026-09-22T00:05:00.000Z"), fakeFetch);

    expect(outcomes).toEqual([{ deliveryId: "d-1", outcome: "exhausted" }]);
    expect(updates[0]!.patch.status).toBe("exhausted");
  });

  it("skips a delivery whose subscription is disabled, without calling fetch", async () => {
    const disabled = { ...DUE_ROW, household_webhooks: { ...(DUE_ROW.household_webhooks as Row), status: "disabled" } };
    const { client, updates } = fakeAdminClient([disabled]);
    let fetchCalled = false;
    const fakeFetch = (async () => {
      fetchCalled = true;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const outcomes = await deliverPendingWebhooks(client, new Date("2026-09-22T00:05:00.000Z"), fakeFetch);

    expect(outcomes).toEqual([{ deliveryId: "d-1", outcome: "skipped" }]);
    expect(fetchCalled).toBe(false);
    expect(updates[0]!.patch.status).toBe("failed");
  });

  it("skips and never calls fetch when the URL is no longer valid (re-checked at delivery time)", async () => {
    const badUrl = { ...DUE_ROW, household_webhooks: { ...(DUE_ROW.household_webhooks as Row), url: "https://localhost/hook" } };
    const { client, updates } = fakeAdminClient([badUrl]);
    let fetchCalled = false;
    const fakeFetch = (async () => {
      fetchCalled = true;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const outcomes = await deliverPendingWebhooks(client, new Date("2026-09-22T00:05:00.000Z"), fakeFetch);

    expect(outcomes).toEqual([{ deliveryId: "d-1", outcome: "skipped" }]);
    expect(fetchCalled).toBe(false);
    expect(updates[0]!.patch.status).toBe("failed");
  });

  it("returns no outcomes when nothing is due", async () => {
    const { client } = fakeAdminClient([]);
    const outcomes = await deliverPendingWebhooks(client);
    expect(outcomes).toEqual([]);
  });
});
