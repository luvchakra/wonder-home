import { describe, expect, it, vi } from "vitest";

import type { ConnectionState, ConnectorError } from "../integrations/connector";
import type { Connection } from "../integrations/repository";
import { syncCommerce, type CommerceSyncPorts } from "./commerce-sync";
import type { ExistingOrder, OrderSyncPlan } from "./commerce-connector";
import { createFixtureCommerceConnector, type CommercePayload } from "./orders";

/**
 * One commerce sync, end to end (story 17-005).
 *
 * The order of operations is the guarantee, so it is what is asserted: the
 * merchant is asked first, and a merchant that fails changes the connection's
 * health and nothing else.
 */

const CONNECTION: Connection = {
  id: "conn-1",
  householdId: "h-1",
  kind: "commerce",
  provider: "fixture",
  credentialRef: null,
  scopes: ["orders.read"],
  state: { status: "connected", consecutiveFailures: 0, lastErrorCode: null },
};

const CONNECTED: ConnectionState = { status: "connected", consecutiveFailures: 0, lastErrorCode: null };

function ports(overrides: Partial<CommerceSyncPorts> = {}, existing: ExistingOrder[] = []) {
  const applied: OrderSyncPlan[] = [];
  const events: { externalId: string; status: string }[] = [];

  const base: CommerceSyncPorts = {
    existingOrders: async () => existing,
    seenKeys: async () => new Set<string>(),
    apply: async (plan) => void applied.push(plan),
    recordEvents: async (entries) => {
      for (const entry of entries) events.push({ externalId: entry.record.externalId, status: entry.status });
    },
    recordOutcome: async () => CONNECTED,
    ...overrides,
  };

  return { ports: base, applied, events };
}

function payload(overrides: Partial<CommercePayload> = {}): CommercePayload {
  return { externalOrderId: "ord-1", status: "confirmed", ...overrides };
}

const EXISTING: ExistingOrder = {
  id: "row-1",
  externalId: "ord-1",
  status: "placed",
  totalMinor: 284_000,
  currency: "INR",
};

describe("a merchant that fails", () => {
  it("changes health and touches no order", async () => {
    const error: ConnectorError = { code: "unavailable", retryable: true, message: "Merchant is down." };
    const connector = createFixtureCommerceConnector({ provider: "fixture", records: [], failWith: error });
    const { ports: p, applied } = ports();
    const recordOutcome = vi.fn(async () => ({ ...CONNECTED, status: "degraded" as const }));

    const report = await syncCommerce({ connector, connection: CONNECTION, ports: { ...p, recordOutcome } });

    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe("unavailable");
    expect(applied, "an outage wrote to canonical state").toHaveLength(0);
    expect(recordOutcome).toHaveBeenCalledWith({ ok: false, error });
  });
});

describe("a merchant that answers", () => {
  it("applies what the lifecycle allows and reports what it refused", async () => {
    const connector = createFixtureCommerceConnector({
      provider: "fixture",
      records: [{ externalId: "ord-1", contentHash: "h", type: "order", observedAt: new Date(), payload: payload({ status: "shipped" }) }],
    });
    const { ports: p } = ports({}, [{ ...EXISTING, status: "delivered" }]);

    const report = await syncCommerce({ connector, connection: CONNECTION, ports: p });

    expect(report.ok).toBe(true);
    expect(report.updated).toBe(0);
    expect(report.refused).toHaveLength(1);
    expect(report.refused[0]).toMatchObject({ from: "delivered", to: "shipped" });
  });

  it("carries a reprice into the report rather than absorbing it into a count", async () => {
    const connector = createFixtureCommerceConnector({
      provider: "fixture",
      records: [
        { externalId: "ord-1", contentHash: "h", type: "order", observedAt: new Date(), payload: payload({ totalMinor: 842_000, currency: "INR" }) },
      ],
    });
    const { ports: p } = ports({}, [EXISTING]);

    const report = await syncCommerce({ connector, connection: CONNECTION, ports: p });

    expect(report.repriced).toHaveLength(1);
    expect(report.repriced[0]).toMatchObject({ approvedMinor: 284_000, reportedMinor: 842_000 });
  });

  it("records a refused record as ignored, not processed", async () => {
    // It arrived, it was read, and nothing came of it — which is exactly what
    // the event log is for.
    const connector = createFixtureCommerceConnector({
      provider: "fixture",
      records: [{ externalId: "ord-1", contentHash: "h", type: "order", observedAt: new Date(), payload: payload({ status: "placed" }) }],
    });
    const { ports: p, events } = ports({}, [{ ...EXISTING, status: "delivered" }]);

    await syncCommerce({ connector, connection: CONNECTION, ports: p });

    expect(events).toEqual([{ externalId: "ord-1", status: "ignored" }]);
  });

  it("reports an order the household does not have as unmatched", async () => {
    const connector = createFixtureCommerceConnector({
      provider: "fixture",
      records: [
        { externalId: "ord-9", contentHash: "h", type: "order", observedAt: new Date(), payload: payload({ externalOrderId: "ord-9" }) },
      ],
    });
    const { ports: p } = ports({}, [EXISTING]);

    const report = await syncCommerce({ connector, connection: CONNECTION, ports: p });

    expect(report.unmatched).toBe(1);
    expect(report.updated).toBe(0);
  });

  it("refuses a connector of the wrong kind rather than syncing the wrong thing", async () => {
    const calendar = { ...createFixtureCommerceConnector({ provider: "fixture", records: [] }), kind: "calendar" as const };
    const { ports: p } = ports();

    await expect(syncCommerce({ connector: calendar, connection: CONNECTION, ports: p })).rejects.toThrow(
      /calendar connector/,
    );
  });
});
