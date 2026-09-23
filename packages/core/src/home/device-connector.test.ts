import { describe, expect, it, vi } from "vitest";

import type { ConnectionState, ConnectorError, ProviderRecord } from "../integrations/connector";
import { createFixtureConnector } from "../integrations/registry";
import type { Connection } from "../integrations/repository";
import {
  DEVICE_CONFIDENCE_CEILING,
  DEVICE_DEFAULT_CONFIDENCE,
  describeDeviceLink,
  deviceKeyFor,
  planDeviceSync,
  translateDeviceReadings,
  type DeviceLink,
  type DevicePayload,
  type DeviceSyncPlan,
} from "./device-connector";
import { syncDevices, type DeviceSyncPorts } from "./device-sync";

/**
 * Optional device connectors (story 17-008): a device is stated, never
 * inferred; only a reading that could still change a decision is kept; a
 * provider's outage changes the connection's health and nothing else.
 */

const NOW = new Date("2026-09-24T09:00:00.000Z");

function record(payload: Partial<DevicePayload> = {}, externalId = "r-1"): ProviderRecord<DevicePayload> {
  return {
    externalId,
    contentHash: `hash-${externalId}`,
    type: "reading",
    observedAt: NOW,
    payload: {
      deviceId: "washer-7f3a",
      deviceName: "Bosch washer",
      kind: "power_draw",
      value: 540,
      observedAt: "2026-09-24T08:30:00.000Z",
      confidence: 0.8,
      ...payload,
    },
  };
}

const LINKED: DeviceLink = {
  id: "link-1",
  externalDeviceId: "washer-7f3a",
  deviceKey: "fixture:washer-7f3a",
  label: "Bosch washer",
  assetId: "asset-washer",
  ignored: false,
};

describe("translating a provider's readings", () => {
  it("keeps a fresh reading of a kind WonderHome uses", () => {
    const { readings, skipped } = translateDeviceReadings([record()], NOW);

    expect(skipped).toHaveLength(0);
    expect(readings[0]).toMatchObject({ externalDeviceId: "washer-7f3a", kind: "power_draw", value: 540, confidence: 0.8 });
  });

  it("says why it skipped what it could not use, and never drops it silently", () => {
    const { readings, skipped } = translateDeviceReadings(
      [
        record({ deviceId: "" }, "a"),
        record({ kind: "humidity_percent" }, "b"),
        record({ value: Number.NaN }, "c"),
        record({ observedAt: "not a date" }, "d"),
        record({ observedAt: "2026-09-25T09:00:00.000Z" }, "e"),
      ],
      NOW,
    );

    expect(readings).toHaveLength(0);
    expect(skipped.map((entry) => entry.because)).toEqual([
      "The provider did not say which device this was.",
      "WonderHome does not use this kind of reading.",
      "The reading had no usable value.",
      "The reading had no believable time.",
      "The reading had no believable time.",
    ]);
  });

  it("drops a reading too old to change anything, by its own kind's window", () => {
    // A door report from three hours ago says nothing about now; a supply
    // level from a day ago still does.
    const { readings, skipped } = translateDeviceReadings(
      [
        record({ kind: "door", value: 1, observedAt: "2026-09-24T06:00:00.000Z" }, "door"),
        record({ kind: "supply_level", value: 0.2, observedAt: "2026-09-23T09:00:00.000Z" }, "supply"),
      ],
      NOW,
    );

    expect(readings.map((reading) => reading.kind)).toEqual(["supply_level"]);
    expect(skipped[0]!.because).toBe("Too old to change anything now.");
  });

  it("never takes a provider's confidence as certainty", () => {
    const { readings } = translateDeviceReadings(
      [record({ confidence: 1 }, "sure"), record({ confidence: null, kind: "moisture" }, "unsaid"), record({ confidence: -3, kind: "temperature" }, "odd")],
      NOW,
    );

    expect(readings.map((reading) => reading.confidence)).toEqual([DEVICE_CONFIDENCE_CEILING, DEVICE_DEFAULT_CONFIDENCE, 0]);
  });

  it("counts the same reading sent twice in one batch once", () => {
    const { readings, skipped } = translateDeviceReadings([record({}, "a"), record({}, "b")], NOW);

    expect(readings).toHaveLength(1);
    expect(skipped[0]!.because).toBe("The provider sent the same reading twice.");
  });
});

describe("the key a device's readings are recorded under", () => {
  it("is the provider and its device id", () => {
    expect(deviceKeyFor("fixture", "washer-7f3a")).toBe("fixture:washer-7f3a");
  });

  it("stays within 80 characters, and two long ids sharing a prefix stay two devices", () => {
    const long = "x".repeat(120);
    const a = deviceKeyFor("fixture", `${long}-a`);
    const b = deviceKeyFor("fixture", `${long}-b`);

    expect(a.length).toBeLessThanOrEqual(80);
    expect(a).not.toBe(b);
  });
});

describe("planning what a sync writes", () => {
  const plan = (links: DeviceLink[], seen = new Set<string>(), records = [record()]) =>
    planDeviceSync({ provider: "fixture", links, seen, readings: translateDeviceReadings(records, NOW).readings });

  it("makes a device it has never seen into a link to nothing, and records none of its readings", () => {
    const result = plan([]);

    expect(result.newDevices).toEqual([{ externalDeviceId: "washer-7f3a", deviceKey: "fixture:washer-7f3a", label: "Bosch washer" }]);
    expect(result.signals).toHaveLength(0);
    expect(result.waiting).toBe(1);
  });

  it("records a linked device's reading against the appliance the household named", () => {
    const result = plan([LINKED]);

    expect(result.newDevices).toHaveLength(0);
    expect(result.signals).toEqual([
      expect.objectContaining({ deviceKey: "fixture:washer-7f3a", assetId: "asset-washer", kind: "power_draw", value: 540 }),
    ]);
  });

  it("keeps waiting while nobody has said which appliance it is", () => {
    expect(plan([{ ...LINKED, assetId: null }])).toMatchObject({ signals: [], waiting: 1 });
  });

  it("uses nothing from a device the household ignores", () => {
    expect(plan([{ ...LINKED, ignored: true }])).toMatchObject({ signals: [], ignored: 1 });
  });

  it("does not record a reading a second time on a re-sync", () => {
    const [reading] = translateDeviceReadings([record()], NOW).readings;
    const result = plan([LINKED], new Set([`${reading!.externalId}:${reading!.contentHash}`]));

    expect(result).toMatchObject({ signals: [], unchanged: 1 });
  });

  it("keeps the household's link whatever the provider now calls the device", () => {
    const result = plan([LINKED], new Set(), [record({ deviceName: "Washer (renamed)" })]);

    expect(result.newDevices).toHaveLength(0);
    expect(result.signals[0]!.assetId).toBe("asset-washer");
  });
});

describe("how a device is described", () => {
  it("says plainly whether its readings are used", () => {
    expect(describeDeviceLink({ assetId: null, ignored: false }, null)).toContain("Not linked");
    expect(describeDeviceLink({ assetId: "a", ignored: false }, "Washing machine")).toBe("Readings count towards Washing machine.");
    expect(describeDeviceLink({ assetId: "a", ignored: true }, "Washing machine")).toContain("Ignored");
  });
});

const CONNECTION: Connection = {
  id: "conn-1",
  householdId: "h-1",
  kind: "smart_home",
  provider: "fixture",
  credentialRef: null,
  scopes: ["devices.read"],
  state: { status: "connected", consecutiveFailures: 0, lastErrorCode: null },
};

const CONNECTED: ConnectionState = { status: "connected", consecutiveFailures: 0, lastErrorCode: null };

function ports(links: DeviceLink[] = [LINKED], overrides: Partial<DeviceSyncPorts> = {}) {
  const applied: DeviceSyncPlan[] = [];
  const events: { externalId: string; status: string }[] = [];
  const base: DeviceSyncPorts = {
    existingLinks: async () => links,
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

describe("a device sync", () => {
  it("records a linked device's fresh reading and logs it, so a re-sync skips it", async () => {
    const connector = createFixtureConnector<DevicePayload>({ provider: "fixture", kind: "smart_home", records: [record()] });
    const { ports: p, applied, events } = ports();

    const report = await syncDevices({ connector, connection: CONNECTION, ports: p, now: NOW });

    expect(report).toMatchObject({ ok: true, recorded: 1, newDevices: 0, waiting: 0 });
    expect(applied[0]!.signals).toHaveLength(1);
    expect(events).toEqual([{ externalId: "washer-7f3a@2026-09-24T08:30:00.000Z#power_draw", status: "processed" }]);
  });

  it("does not log a reading from a device waiting to be linked, so linking it later still counts", async () => {
    const connector = createFixtureConnector<DevicePayload>({ provider: "fixture", kind: "smart_home", records: [record()] });
    const { ports: p, events } = ports([]);

    const report = await syncDevices({ connector, connection: CONNECTION, ports: p, now: NOW });

    expect(report).toMatchObject({ recorded: 0, newDevices: 1, waiting: 1 });
    expect(events).toHaveLength(0);
  });

  it("changes health and nothing else when the provider is down", async () => {
    const error: ConnectorError = { code: "unavailable", retryable: true, message: "Hub is down." };
    const connector = createFixtureConnector<DevicePayload>({ provider: "fixture", kind: "smart_home", failWith: error });
    const { ports: p, applied, events } = ports();
    const recordOutcome = vi.fn(async () => ({ ...CONNECTED, status: "degraded" as const, consecutiveFailures: 1 }));

    const report = await syncDevices({ connector, connection: CONNECTION, ports: { ...p, recordOutcome }, now: NOW });

    expect(report).toMatchObject({ ok: false, recorded: 0, error: { code: "unavailable" } });
    expect(applied, "an outage wrote a reading or a link").toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(recordOutcome).toHaveBeenCalledWith({ ok: false, error });
  });

  it("carries a rate limit's own retry delay back to the caller", async () => {
    const error: ConnectorError = { code: "rate_limited", retryable: true, message: "Slow down.", retryAfterSeconds: 120 };
    const connector = createFixtureConnector<DevicePayload>({ provider: "fixture", kind: "smart_home", failWith: error });

    const report = await syncDevices({ connector, connection: CONNECTION, ports: ports().ports, now: NOW });

    expect(report.error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 120 });
  });

  it("keeps a partial sync's readings and says the connection is degraded", async () => {
    const partial: ConnectorError = { code: "timeout", retryable: true, message: "One device did not answer." };
    const connector = createFixtureConnector<DevicePayload>({
      provider: "fixture",
      kind: "smart_home",
      records: [record()],
      partialFailures: [partial],
    });
    const recordOutcome = vi.fn(async () => ({ ...CONNECTED, status: "degraded" as const }));

    const report = await syncDevices({ connector, connection: CONNECTION, ports: { ...ports().ports, recordOutcome }, now: NOW });

    expect(report).toMatchObject({ ok: true, recorded: 1, partialFailures: 1 });
    expect(recordOutcome).toHaveBeenCalledWith({ ok: true, partialFailures: [partial] });
  });

  it("refuses a connector of another kind rather than reading it as devices", async () => {
    const connector = createFixtureConnector<DevicePayload>({ provider: "fixture", kind: "school" });

    await expect(syncDevices({ connector, connection: CONNECTION, ports: ports().ports, now: NOW })).rejects.toThrow(/school connector/);
  });

  it("is not live: a fixture never claims a real provider", () => {
    expect(createFixtureConnector<DevicePayload>({ provider: "fixture", kind: "smart_home" }).live).toBe(false);
  });
});
