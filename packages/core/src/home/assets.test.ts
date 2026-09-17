import { describe, expect, it } from "vitest";

import { assessAsset, coverageOn, maintenanceAgenda, nextServiceDue, type HomeAsset } from "./assets";
import type { DeviceSignal } from "./signals";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const asset = (over: Partial<HomeAsset> = {}): HomeAsset => ({
  id: "ac-bedroom",
  name: "Bedroom air conditioner",
  category: "appliance",
  location: "Bedroom",
  serviceIntervalDays: 180,
  lastServicedOn: "2026-06-01",
  warrantyExpiresOn: null,
  amcExpiresOn: null,
  responsibleMemberId: null,
  status: "active",
  ...over,
});

describe("coverage", () => {
  it("reports a live warranty ahead of an AMC, because one of them is free", () => {
    const covered = asset({ warrantyExpiresOn: "2027-01-01", amcExpiresOn: "2026-12-01" });

    expect(coverageOn(covered, NOW)).toEqual({
      kind: "warranty",
      expiresOn: "2027-01-01",
      daysRemaining: 105,
    });
  });

  it("falls through to the AMC once the warranty has lapsed", () => {
    const covered = asset({ warrantyExpiresOn: "2026-01-01", amcExpiresOn: "2026-12-01" });

    expect(coverageOn(covered, NOW).kind).toBe("amc");
  });

  it("says plainly when there is no cover at all", () => {
    expect(coverageOn(asset(), NOW)).toEqual({ kind: "none", expiresOn: null, daysRemaining: null });
  });
});

describe("when service falls due", () => {
  it("counts from the last service", () => {
    expect(nextServiceDue(asset(), [], NOW)?.toISOString().slice(0, 10)).toBe("2026-11-28");
  });

  it("treats a never-serviced asset as due from now rather than quietly resetting the clock", () => {
    const due = nextServiceDue(asset({ lastServicedOn: null }), [], NOW);

    expect(due?.toISOString().slice(0, 10)).toBe("2027-03-16");
  });

  it("has no answer for something that needs no servicing", () => {
    expect(nextServiceDue(asset({ serviceIntervalDays: null }), [], NOW)).toBeNull();
    expect(nextServiceDue(asset({ status: "retired" }), [], NOW)).toBeNull();
  });
});

describe("what an asset needs today", () => {
  it("says nothing about an asset that is fine", () => {
    const assessment = assessAsset(asset(), { now: NOW });

    expect(assessment.notable).toBe(false);
    expect(assessment.action).toBeNull();
  });

  it("speaks up when service is close enough to book", () => {
    const assessment = assessAsset(asset({ lastServicedOn: "2026-03-25" }), { now: NOW });

    expect(assessment.notable).toBe(true);
    expect(assessment.status).toBe("at_risk");
    expect(assessment.action).toEqual({ action: "book_service", target: "ac-bedroom" });
  });

  it("mentions the cover, because nobody goes looking for the paperwork at that moment", () => {
    const assessment = assessAsset(
      asset({ lastServicedOn: "2026-03-25", warrantyExpiresOn: "2027-01-01" }),
      { now: NOW },
    );

    expect(assessment.reason).toContain("covered by warranty");
  });

  it("stays quiet while a service request is already open", () => {
    const assessment = assessAsset(asset({ lastServicedOn: "2026-03-25" }), {
      now: NOW,
      openServiceRequest: true,
    });

    expect(assessment.notable).toBe(false);
  });

  it("treats an overdue service as missed rather than merely at risk", () => {
    const assessment = assessAsset(asset({ lastServicedOn: "2025-01-01" }), { now: NOW });

    expect(assessment.status).toBe("missed");
    expect(assessment.riskLevel).toBe("high");
  });

  it("warns before cover lapses, while it can still be used", () => {
    const assessment = assessAsset(asset({ warrantyExpiresOn: "2026-10-01" }), { now: NOW });

    expect(assessment.notable).toBe(true);
    expect(assessment.action).toEqual({ action: "review_coverage", target: "ac-bedroom" });
  });

  it("says nothing about a retired asset", () => {
    expect(assessAsset(asset({ status: "retired", lastServicedOn: "2020-01-01" }), { now: NOW }).notable).toBe(
      false,
    );
  });
});

describe("signals bringing a service forward", () => {
  const damp: DeviceSignal[] = [
    { deviceKey: "leak-1", kind: "moisture", observedAt: new Date("2026-09-17T06:00:00.000Z"), value: 1, confidence: 0.9 },
  ];

  it("pulls the date in and says why", () => {
    const scheduled = nextServiceDue(asset(), [], NOW);
    const withSignal = nextServiceDue(asset(), damp, NOW);

    expect(withSignal!.getTime()).toBeLessThan(scheduled!.getTime());

    const assessment = assessAsset(asset(), { now: NOW, signals: damp });
    expect(assessment.riskLevel).toBe("high");
    expect(assessment.reason).toContain("moisture");
  });

  it("ignores a reading too old to mean anything now", () => {
    const stale: DeviceSignal[] = [{ ...damp[0]!, observedAt: new Date("2026-09-01T06:00:00.000Z") }];

    expect(nextServiceDue(asset(), stale, NOW)).toEqual(nextServiceDue(asset(), [], NOW));
  });
});

describe("the maintenance agenda", () => {
  it("shows only what needs attention, most urgent first", () => {
    const agenda = maintenanceAgenda(
      [
        asset(),
        asset({ id: "geyser", name: "Geyser", lastServicedOn: "2025-01-01" }),
        asset({ id: "filter", name: "Water filter", warrantyExpiresOn: "2026-10-01", serviceIntervalDays: null }),
      ],
      { now: NOW },
    );

    expect(agenda.map((entry) => entry.subjectKey)).toEqual(["asset.geyser", "asset.filter"]);
  });

  it("is empty for a household where nothing is due, which is the normal case", () => {
    expect(maintenanceAgenda([asset(), asset({ id: "tv", name: "Television", serviceIntervalDays: null })], { now: NOW })).toEqual(
      [],
    );
  });
});
