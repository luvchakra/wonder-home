import { describe, expect, it } from "vitest";

import { platformCan, type PlatformAdmin } from "./admin";
import { listPlatformAuditEvents } from "./audit-log";

const support: PlatformAdmin = { profileId: "p-1", role: "support" };
const operator: PlatformAdmin = { profileId: "p-2", role: "operator" };
const owner: PlatformAdmin = { profileId: "p-3", role: "owner" };

/** Throws if ever touched — proves the guard runs before any query. */
const untouchableClient = new Proxy(
  {},
  {
    get() {
      throw new Error("reached the database despite a role with no audit.read_platform capability");
    },
  },
) as never;

const ROWS = [
  {
    id: "e-1",
    household_id: "h-1",
    event_type: "feature_flag.changed",
    actor_profile_id: "p-2",
    actor_member_id: null,
    target_table: "household_feature_flags",
    target_id: "f-1",
    metadata: { flagKey: "early_access_ai", enabled: true },
    created_at: "2026-09-21T00:00:00.000Z",
  },
  {
    id: "e-2",
    household_id: "h-2",
    event_type: "support.access_granted",
    actor_profile_id: "p-2",
    actor_member_id: null,
    target_table: "support_access_grants",
    target_id: "g-1",
    metadata: { reasonCode: "billing_dispute" },
    created_at: "2026-09-20T00:00:00.000Z",
  },
];

/** Chainable select that records the filters applied, resolving with the fixed rows. */
function fakeAdminClient() {
  const calls: { eventType?: string; limit?: number }[] = [];
  const call: { eventType?: string; limit?: number } = {};
  calls.push(call);

  const builder = {
    eq: (_column: string, value: string) => {
      call.eventType = value;
      return builder;
    },
    order: () => builder,
    limit: (value: number) => {
      call.limit = value;
      return builder;
    },
    then: (resolve: (result: { data: unknown; error: null }) => unknown) => {
      const rows = call.eventType ? ROWS.filter((row) => row.event_type === call.eventType) : ROWS;
      return resolve({ data: rows, error: null });
    },
  };

  return {
    calls,
    client: {
      from: () => ({ select: () => builder }),
    } as never,
  };
}

describe("audit.read_platform", () => {
  it("is operator and owner only — support has no fleet-wide standing here", () => {
    expect(platformCan(support, "audit.read_platform")).toBe(false);
    expect(platformCan(operator, "audit.read_platform")).toBe(true);
    expect(platformCan(owner, "audit.read_platform")).toBe(true);
  });

  it("refuses support before touching the database", async () => {
    await expect(listPlatformAuditEvents(untouchableClient, support)).rejects.toThrowError(
      /cannot view the platform-wide audit trail/,
    );
  });
});

describe("listing the platform audit trail", () => {
  it("returns events across households, most recent first as queried", async () => {
    const { client } = fakeAdminClient();
    const events = await listPlatformAuditEvents(client, operator);

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.householdId)).toEqual(["h-1", "h-2"]);
  });

  it("filters to one event type when asked", async () => {
    const { client } = fakeAdminClient();
    const events = await listPlatformAuditEvents(client, owner, { eventType: "feature_flag.changed" });

    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("feature_flag.changed");
  });

  it("clamps an out-of-range limit rather than passing it through unchecked", async () => {
    const { client, calls } = fakeAdminClient();
    await listPlatformAuditEvents(client, operator, { limit: 10_000 });
    expect(calls[0]!.limit).toBe(200);

    const { client: client2, calls: calls2 } = fakeAdminClient();
    await listPlatformAuditEvents(client2, operator, { limit: -5 });
    expect(calls2[0]!.limit).toBe(1);
  });

  it("never exposes more than the redacted metadata already written", async () => {
    const { client } = fakeAdminClient();
    const [event] = await listPlatformAuditEvents(client, operator, { eventType: "feature_flag.changed" });
    expect(event!.metadata).toEqual({ flagKey: "early_access_ai", enabled: true });
  });
});
