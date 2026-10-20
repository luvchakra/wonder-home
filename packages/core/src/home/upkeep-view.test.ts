import { describe, expect, it } from "vitest";

import type { HomeAsset } from "./assets";
import type { ServiceRequest } from "./services";
import { assetHeadline, comingUp, splitRequests } from "./upkeep-view";

const now = new Date("2026-10-21T06:00:00Z");
const asset = (patch: Partial<HomeAsset>): HomeAsset => ({
  id: "a1",
  name: "Water purifier",
  category: "appliance",
  location: null,
  serviceIntervalDays: null,
  lastServicedOn: null,
  warrantyExpiresOn: null,
  amcExpiresOn: null,
  responsibleMemberId: null,
  status: "active",
  ...patch,
});

describe("assetHeadline", () => {
  it("leads with the next service when the thing is serviced", () => {
    const line = assetHeadline(asset({ serviceIntervalDays: 90, lastServicedOn: "2026-09-01" }), now);
    expect(line?.kind).toBe("service");
    expect(line?.on.toISOString().slice(0, 10)).toBe("2026-11-30");
  });

  it("falls back to the cover in force, and says nothing for an undated or retired thing", () => {
    expect(assetHeadline(asset({ warrantyExpiresOn: "2027-03-31" }), now)?.kind).toBe("warranty");
    expect(assetHeadline(asset({}), now)).toBeNull();
    expect(assetHeadline(asset({ status: "retired", warrantyExpiresOn: "2027-03-31" }), now)).toBeNull();
  });
});

describe("comingUp", () => {
  it("lists services and cover ending within the window, soonest first, skipping what already needs a person", () => {
    const assets = [
      asset({ id: "a1", name: "AC", serviceIntervalDays: 30, lastServicedOn: "2026-10-01" }),
      asset({ id: "a2", name: "Fridge", warrantyExpiresOn: "2026-11-05", amcExpiresOn: "2027-06-01" }),
      asset({ id: "a3", name: "Geyser", serviceIntervalDays: 10, lastServicedOn: "2026-10-15" }),
    ];
    const dates = comingUp(assets, now, 60, new Set(["a3"]));
    expect(dates.map((date) => `${date.name}:${date.kind}`)).toEqual(["AC:service", "Fridge:warranty"]);
  });
});

describe("splitRequests", () => {
  it("keeps open and settled apart, newest change first", () => {
    const request = (id: string, status: ServiceRequest["status"], day: number): ServiceRequest => ({
      id,
      assetId: null,
      subject: id,
      providerName: null,
      providerContact: null,
      status,
      scheduledFor: null,
      nextAction: null,
      nextActionBy: null,
      updatedAt: new Date(Date.UTC(2026, 9, day)),
    });
    const { open, settled } = splitRequests([request("a", "requested", 1), request("b", "completed", 3), request("c", "scheduled", 5), request("d", "cancelled", 2)]);
    expect(open.map((item) => item.id)).toEqual(["c", "a"]);
    expect(settled.map((item) => item.id)).toEqual(["b", "d"]);
  });
});
