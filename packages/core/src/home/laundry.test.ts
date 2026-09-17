import { describe, expect, it } from "vitest";

import { applySignal, assessLaundry, hoursRemaining, type LaundryNeed } from "./laundry";
import type { DeviceSignal } from "./signals";
import { dryingConditions, FIXTURE_CLEAR_DAY, FIXTURE_WET_DAY } from "./weather";

const NOW = new Date("2026-09-17T09:00:00.000Z");
const CLEAR = dryingConditions(FIXTURE_CLEAR_DAY);
const WET = dryingConditions(FIXTURE_WET_DAY);

const need = (over: Partial<LaundryNeed> = {}): LaundryNeed => ({
  id: "uniform-aarav",
  label: "Aarav's school uniform",
  forMemberId: "aarav",
  neededBy: new Date("2026-09-18T07:00:00.000Z"),
  state: "soiled",
  stateAsOf: null,
  dryingHours: 5,
  requiresOutdoorDrying: false,
  ...over,
});

const context = (over: Partial<Parameters<typeof assessLaundry>[1]> = {}) => ({
  now: NOW,
  conditions: CLEAR,
  someoneAvailable: true,
  ...over,
});

describe("how long is still needed", () => {
  it("assumes the full cycle when nobody has told us anything", () => {
    // The whole point of the story: no check-ins, so 'unknown' is the common case
    // and has to be handled as the worst case rather than an average.
    expect(hoursRemaining(need({ state: "unknown" }), CLEAR)).toBe(
      hoursRemaining(need({ state: "soiled" }), CLEAR),
    );
  });

  it("is nothing at all once something is ready", () => {
    expect(hoursRemaining(need({ state: "ready" }), CLEAR)).toBe(0);
  });

  it("stretches when the weather is against it", () => {
    expect(hoursRemaining(need(), WET)).toBeGreaterThan(hoursRemaining(need(), CLEAR));
  });
});

describe("whether it will be ready", () => {
  it("says nothing when there is plenty of time", () => {
    expect(assessLaundry(need(), context()).notable).toBe(false);
  });

  it("says nothing at all about something already ready", () => {
    const assessment = assessLaundry(need({ state: "ready", neededBy: new Date("2026-09-17T10:00:00.000Z") }), context());

    expect(assessment.notable).toBe(false);
  });

  it("speaks up when the time left is less than the work left", () => {
    const assessment = assessLaundry(
      need({ neededBy: new Date("2026-09-17T13:00:00.000Z") }),
      context(),
    );

    expect(assessment.status).toBe("at_risk");
    expect(assessment.action).toEqual({ action: "start_now", target: "uniform-aarav" });
  });

  it("blames the weather when the weather is the problem, and suggests indoors", () => {
    const assessment = assessLaundry(
      need({ requiresOutdoorDrying: true, neededBy: new Date("2026-09-17T15:00:00.000Z") }),
      context({ conditions: WET }),
    );

    expect(assessment.action).toEqual({ action: "dry_indoors", target: "uniform-aarav" });
    expect(assessment.reason).toContain("Rain is likely");
  });

  it("treats a passed deadline as missed, and offers the only thing left", () => {
    const assessment = assessLaundry(
      need({ neededBy: new Date("2026-09-17T07:00:00.000Z") }),
      context(),
    );

    expect(assessment.status).toBe("missed");
    expect(assessment.action).toEqual({ action: "find_alternative", target: "uniform-aarav" });
  });

  it("raises an empty house only when it actually threatens the deadline", () => {
    const tight = need({ neededBy: new Date("2026-09-17T18:00:00.000Z") });

    expect(assessLaundry(tight, context({ someoneAvailable: false })).action).toEqual({
      action: "find_cover",
      target: "uniform-aarav",
    });
    // The same empty house, with two days to go, is not news.
    expect(
      assessLaundry(need({ neededBy: new Date("2026-09-19T07:00:00.000Z") }), context({ someoneAvailable: false }))
        .notable,
    ).toBe(false);
  });
});

describe("state moving without anyone telling us", () => {
  const cycleDone: DeviceSignal = {
    deviceKey: "washer",
    kind: "cycle_complete",
    observedAt: new Date("2026-09-17T08:00:00.000Z"),
    value: 1,
    confidence: 0.95,
  };

  it("advances a wash to drying on a finished cycle", () => {
    expect(applySignal(need({ state: "in_wash" }), cycleDone, NOW).state).toBe("drying");
  });

  it("resolves an unknown state, which is the case that makes check-ins unnecessary", () => {
    expect(applySignal(need({ state: "unknown" }), cycleDone, NOW).state).toBe("drying");
  });

  it("does not walk a ready item backwards", () => {
    expect(applySignal(need({ state: "ready" }), cycleDone, NOW).state).toBe("ready");
  });

  it("ignores a signal too old to say anything about now", () => {
    const stale = { ...cycleDone, observedAt: new Date("2026-09-15T08:00:00.000Z") };

    expect(applySignal(need({ state: "in_wash" }), stale, NOW).state).toBe("in_wash");
  });
});
