import { describe, expect, it } from "vitest";

import { assessWear, isFresh, signalIsUseful, verifyWith, type DeviceSignal } from "./signals";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const signal = (over: Partial<DeviceSignal> = {}): DeviceSignal => ({
  deviceKey: "washer",
  kind: "cycle_complete",
  observedAt: new Date("2026-09-17T08:00:00.000Z"),
  value: 1,
  confidence: 0.95,
  ...over,
});

describe("freshness", () => {
  it("keeps a supply level longer than a door sensor, because one of them still means something tomorrow", () => {
    const old = new Date("2026-09-16T09:00:00.000Z");

    expect(isFresh(signal({ kind: "supply_level", observedAt: old }), NOW)).toBe(true);
    expect(isFresh(signal({ kind: "door", observedAt: old }), NOW)).toBe(false);
  });

  it("rejects a reading from the future rather than trusting a wrong clock", () => {
    expect(isFresh(signal({ observedAt: new Date("2026-09-18T09:00:00.000Z") }), NOW)).toBe(false);
  });
});

describe("verifying with a device", () => {
  it("settles something a reliable device reported", () => {
    expect(verifyWith(signal(), { kind: "cycle_complete" }, NOW)).toMatchObject({
      verified: true,
      source: "observed",
    });
  });

  it("will not settle on an unreliable device's word", () => {
    expect(verifyWith(signal({ confidence: 0.4 }), { kind: "cycle_complete" }, NOW).verified).toBe(false);
  });

  it("does not treat silence as confirmation", () => {
    expect(verifyWith(null, { kind: "cycle_complete" }, NOW)).toMatchObject({
      verified: false,
      reason: "No device reported this.",
    });
  });

  it("holds out for the reading it was actually waiting for", () => {
    expect(
      verifyWith(signal({ kind: "supply_level", value: 2 }), { kind: "supply_level", atLeast: 10 }, NOW).verified,
    ).toBe(false);
  });

  it("records a device's word as observed, never as the household's", () => {
    expect(verifyWith(signal(), { kind: "cycle_complete" }, NOW).source).toBe("observed");
  });
});

describe("whether a signal is worth using at all", () => {
  it("ignores one that changes nothing, however fresh it is", () => {
    expect(signalIsUseful(signal(), NOW, false)).toMatchObject({ use: false });
  });

  it("uses one that changes what the household should do", () => {
    expect(signalIsUseful(signal(), NOW, true)).toMatchObject({ use: true });
  });
});

describe("wear", () => {
  it("brings service forward when a machine is drawing more than it used to", () => {
    const draws = [
      signal({ kind: "power_draw", value: 180, observedAt: new Date("2026-09-17T06:00:00.000Z") }),
      signal({ kind: "power_draw", value: 190, observedAt: new Date("2026-09-17T07:00:00.000Z") }),
    ];

    expect(assessWear(draws, { powerDraw: 120 }, NOW).bringForwardDays).toBe(60);
  });

  it("never pushes a service back, because a quiet appliance is not evidence of a healthy one", () => {
    const low = [signal({ kind: "power_draw", value: 10, observedAt: new Date("2026-09-17T07:00:00.000Z") })];

    expect(assessWear(low, { powerDraw: 120 }, NOW).bringForwardDays).toBe(0);
  });

  it("takes moisture seriously wherever it appears", () => {
    expect(
      assessWear([signal({ kind: "moisture", value: 1, observedAt: new Date("2026-09-17T06:00:00.000Z") })], { powerDraw: null }, NOW)
        .bringForwardDays,
    ).toBe(90);
  });

  it("says nothing without a baseline to compare against", () => {
    const draws = [signal({ kind: "power_draw", value: 900, observedAt: new Date("2026-09-17T07:00:00.000Z") })];

    expect(assessWear(draws, { powerDraw: null }, NOW).bringForwardDays).toBe(0);
  });
});
