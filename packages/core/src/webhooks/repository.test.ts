import { describe, expect, it } from "vitest";

import {
  createWebhookSubscription,
  disableWebhookSubscription,
  enableWebhookSubscription,
  generateWebhookSecret,
  listWebhookSubscriptions,
  rotateWebhookSecret,
} from "./repository";

type Row = Record<string, unknown>;

const ADMIN = { householdId: "h-1", memberId: "m-1", isAdmin: true };
const NON_ADMIN = { householdId: "h-1", memberId: "m-2", isAdmin: false };

/** Throws if ever touched — proves `requireAdmin` runs before any query. */
const untouchableClient = new Proxy(
  {},
  {
    get() {
      throw new Error("reached the database despite a non-admin actor");
    },
  },
) as never;

const SUBSCRIPTION_ROW: Row = {
  id: "w-1",
  url: "https://example.com/hook",
  event_types: ["member.added", "not-a-real-event"],
  status: "active",
  created_at: "2026-09-01T00:00:00.000Z",
  rotated_at: null,
  disabled_at: null,
};

function fakeAdminClient(options: { matched?: boolean } = {}) {
  const matched = options.matched ?? true;
  const inserted: Row[] = [];
  const updated: Row[] = [];

  const client = {
    from: (table: string) => {
      if (table === "household_webhooks") {
        return {
          insert: (row: Row) => {
            inserted.push(row);
            return {
              select: () => ({
                single: async () => ({ data: { ...SUBSCRIPTION_ROW, ...row }, error: null }),
              }),
            };
          },
          update: (patch: Row) => {
            updated.push(patch);
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    single: async () =>
                      matched
                        ? { data: { ...SUBSCRIPTION_ROW, ...patch }, error: null }
                        : { data: null, error: { code: "PGRST116" } },
                  }),
                }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { client: client as never, inserted, updated };
}

function fakeRlsClient(rows: Row[] | null, errorCode?: string) {
  return {
    rpc: async () => (errorCode ? { data: null, error: { code: errorCode } } : { data: rows, error: null }),
  } as never;
}

describe("generateWebhookSecret", () => {
  it("produces a long, url-safe, non-deterministic secret", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("admin guard", () => {
  it("refuses every write for a non-admin actor before touching the database", async () => {
    await expect(
      createWebhookSubscription(untouchableClient, NON_ADMIN, { url: "https://example.com/hook", eventTypes: ["member.added"] }),
    ).rejects.toThrowError(/Admin/);
    await expect(rotateWebhookSecret(untouchableClient, NON_ADMIN, "w-1")).rejects.toThrowError(/Admin/);
    await expect(disableWebhookSubscription(untouchableClient, NON_ADMIN, "w-1")).rejects.toThrowError(/Admin/);
    await expect(enableWebhookSubscription(untouchableClient, NON_ADMIN, "w-1")).rejects.toThrowError(/Admin/);
  });
});

describe("createWebhookSubscription", () => {
  it("refuses a URL that fails the outbound policy, before writing anything", async () => {
    const { client, inserted } = fakeAdminClient();
    await expect(createWebhookSubscription(client, ADMIN, { url: "http://example.com/hook", eventTypes: ["member.added"] })).rejects.toThrow();
    expect(inserted).toHaveLength(0);
  });

  it("refuses an empty event-type list", async () => {
    const { client } = fakeAdminClient();
    await expect(createWebhookSubscription(client, ADMIN, { url: "https://example.com/hook", eventTypes: [] })).rejects.toThrowError(
      /at least one event/,
    );
  });

  it("refuses an event type that is not real", async () => {
    const { client } = fakeAdminClient();
    await expect(
      createWebhookSubscription(client, ADMIN, { url: "https://example.com/hook", eventTypes: ["not.a.real.event"] }),
    ).rejects.toThrowError(/Not a real event type/);
  });

  it("creates a subscription and returns the secret exactly once", async () => {
    const { client, inserted } = fakeAdminClient();
    const result = await createWebhookSubscription(client, ADMIN, {
      url: "https://example.com/hook",
      eventTypes: ["member.added", "member.removed"],
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.household_id).toBe("h-1");
    expect(inserted[0]!.created_by_member_id).toBe("m-1");
    expect(inserted[0]!.event_types).toEqual(["member.added", "member.removed"]);
    expect(typeof inserted[0]!.secret).toBe("string");

    expect(result.secret).toBe(inserted[0]!.secret);
    expect(result.householdId).toBe("h-1");
  });
});

describe("rotateWebhookSecret", () => {
  it("rotates to a new secret and returns it", async () => {
    const { client, updated } = fakeAdminClient();
    const result = await rotateWebhookSecret(client, ADMIN, "w-1");

    expect(updated[0]!.secret).toBeDefined();
    expect(updated[0]!.rotated_at).toBeDefined();
    expect(result.secret).toBe(updated[0]!.secret);
  });

  it("reports not-found when no matching webhook exists for the household", async () => {
    const { client } = fakeAdminClient({ matched: false });
    await expect(rotateWebhookSecret(client, ADMIN, "missing")).rejects.toThrowError(/no webhook with that id/);
  });
});

describe("disableWebhookSubscription / enableWebhookSubscription", () => {
  it("disables a subscription, stamping disabled_at", async () => {
    const { client, updated } = fakeAdminClient();
    const result = await disableWebhookSubscription(client, ADMIN, "w-1");
    expect(updated[0]).toEqual({ status: "disabled", disabled_at: expect.any(String) });
    expect(result.status).toBe("disabled");
  });

  it("re-enables a subscription, clearing disabled_at", async () => {
    const { client, updated } = fakeAdminClient();
    await enableWebhookSubscription(client, ADMIN, "w-1");
    expect(updated[0]).toEqual({ status: "active", disabled_at: null });
  });

  it("reports not-found when no matching webhook exists for the household", async () => {
    const { client } = fakeAdminClient({ matched: false });
    await expect(disableWebhookSubscription(client, ADMIN, "missing")).rejects.toThrowError(/no webhook with that id/);
  });
});

describe("listWebhookSubscriptions", () => {
  it("lists subscriptions, silently dropping an event type that is no longer real", async () => {
    const client = fakeRlsClient([SUBSCRIPTION_ROW]);
    const subscriptions = await listWebhookSubscriptions(client, "h-1");

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]!.id).toBe("w-1");
    expect(subscriptions[0]!.eventTypes).toEqual(["member.added"]);
    expect((subscriptions[0] as unknown as { secret?: string }).secret).toBeUndefined();
  });

  it("returns an empty list rather than throwing when there are none", async () => {
    const client = fakeRlsClient(null);
    expect(await listWebhookSubscriptions(client, "h-1")).toEqual([]);
  });

  it("throws when the RPC call fails", async () => {
    const client = fakeRlsClient(null, "boom");
    await expect(listWebhookSubscriptions(client, "h-1")).rejects.toThrow();
  });
});
