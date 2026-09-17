import { describe, expect, it } from "vitest";

import {
  checkWeatherAccess,
  createFixtureWeatherProvider,
  dryingConditions,
  FIXTURE_CLEAR_DAY,
  FIXTURE_WET_DAY,
  planOutdoorWork,
} from "./weather";

describe("drying conditions", () => {
  it("is ordinary on a clear day", () => {
    expect(dryingConditions(FIXTURE_CLEAR_DAY)).toMatchObject({ outdoorViable: true, hoursMultiplier: 1 });
  });

  it("rules out the line when rain is likely, and says why in words a family would use", () => {
    const conditions = dryingConditions(FIXTURE_WET_DAY);

    expect(conditions.outdoorViable).toBe(false);
    expect(conditions.reason).toContain("will not dry outside");
  });

  it("slows drying down when it is merely humid", () => {
    const humid = FIXTURE_CLEAR_DAY.map((window) => ({ ...window, humidity: 0.85 }));

    expect(dryingConditions(humid)).toMatchObject({ outdoorViable: true, hoursMultiplier: 1.4 });
  });

  it("treats no forecast as ordinary rather than inventing caution", () => {
    expect(dryingConditions([])).toMatchObject({ outdoorViable: true, hoursMultiplier: 1 });
  });
});

describe("outdoor work", () => {
  it("says nothing when the planned time is fine", () => {
    const plan = planOutdoorWork(new Date("2026-09-17T02:00:00.000Z"), 2, FIXTURE_CLEAR_DAY);

    expect(plan.kind).toBe("proceed");
  });

  it("offers the next dry window when rain is coming", () => {
    const mixed = [
      { ...FIXTURE_WET_DAY[0]! },
      { ...FIXTURE_CLEAR_DAY[1]!, start: FIXTURE_WET_DAY[1]!.start, end: FIXTURE_WET_DAY[1]!.end },
    ];

    const plan = planOutdoorWork(new Date("2026-09-17T02:00:00.000Z"), 2, mixed);

    expect(plan).toMatchObject({ kind: "move", toStart: mixed[1]!.start });
  });

  it("admits when there is no dry window rather than proposing a worse one", () => {
    const plan = planOutdoorWork(new Date("2026-09-17T02:00:00.000Z"), 2, FIXTURE_WET_DAY);

    expect(plan.kind).toBe("no_clear_window");
  });
});

describe("the fixture provider", () => {
  it("returns only windows overlapping the query, and needs no credentials to do it", async () => {
    const provider = createFixtureWeatherProvider(FIXTURE_CLEAR_DAY);

    const windows = await provider.forecast({
      locality: "Pune",
      from: new Date("2026-09-17T07:00:00.000Z"),
      hours: 6,
    });

    expect(windows).toHaveLength(2);
    expect(provider.name).toBe("fixture");
  });
});

describe("entitlement", () => {
  const allowed = { allowed: true, remaining: null, reason: "Included." } as const;
  const refused = {
    allowed: false,
    code: "not_in_plan",
    reason: "Weather-aware planning is not part of this household's plan.",
    remaining: 0,
  } as const;

  it("carries the entitlement service's refusal through rather than inventing its own", () => {
    const provider = createFixtureWeatherProvider(FIXTURE_CLEAR_DAY);

    expect(checkWeatherAccess({ entitlement: refused, provider })).toEqual({
      allowed: false,
      code: "not_in_plan",
      reason: "Weather-aware planning is not part of this household's plan.",
    });
  });

  it("distinguishes a household without the feature from one without a provider", () => {
    expect(checkWeatherAccess({ entitlement: allowed, provider: null })).toMatchObject({
      allowed: false,
      code: "not_configured",
    });
  });

  it("allows an entitled household with a provider", () => {
    const provider = createFixtureWeatherProvider([]);

    expect(checkWeatherAccess({ entitlement: allowed, provider })).toEqual({ allowed: true });
  });
});
