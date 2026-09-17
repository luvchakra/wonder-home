import { describe, expect, it } from "vitest";

import type { HomeAsset } from "./assets";
import { handleHomeException, type HomeException } from "./exceptions";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const geyser: HomeAsset = {
  id: "geyser",
  name: "Geyser",
  category: "appliance",
  location: "Bathroom",
  serviceIntervalDays: 365,
  lastServicedOn: "2026-05-01",
  warrantyExpiresOn: null,
  amcExpiresOn: null,
  responsibleMemberId: null,
  status: "active",
};

const exception = (over: Partial<HomeException> = {}): HomeException => ({
  kind: "appliance_failed",
  asset: geyser,
  detail: "No hot water this morning",
  detectedAt: NOW,
  blocksDailyLife: true,
  ...over,
});

const context = (over: Partial<Parameters<typeof handleHomeException>[1]> = {}) => ({
  now: NOW,
  canReorder: false,
  requestOpen: false,
  ...over,
});

describe("handling what goes wrong in the house", () => {
  it("reorders a supply without telling anyone", () => {
    const handling = handleHomeException(
      exception({ kind: "supply_out", detail: "Water filter cartridge" }),
      context({ canReorder: true }),
    );

    expect(handling.kind).toBe("handle_silently");
  });

  it("asks for help when it cannot reorder", () => {
    const handling = handleHomeException(
      exception({ kind: "supply_out", detail: "Water filter cartridge" }),
      context(),
    );

    expect(handling.kind).toBe("tell_household");
  });

  it("stays quiet while somebody is already coming", () => {
    expect(handleHomeException(exception(), context({ requestOpen: true })).kind).toBe("handle_silently");
  });

  it("treats a short outage as weather rather than an incident", () => {
    const handling = handleHomeException(
      exception({ kind: "utility_outage", asset: null, blocksDailyLife: false, detail: "Power cut" }),
      context(),
    );

    expect(handling.kind).toBe("handle_silently");
  });

  it("escalates an outage that actually costs the household something", () => {
    const handling = handleHomeException(
      exception({ kind: "utility_outage", asset: null, blocksDailyLife: true, detail: "No water since morning" }),
      context(),
    );

    expect(handling.kind).toBe("tell_household");
    if (handling.kind !== "tell_household") return;
    expect(handling.assessment.riskLevel).toBe("high");
  });

  it("surfaces the cover at the moment it is worth money", () => {
    const handling = handleHomeException(
      exception({ asset: { ...geyser, warrantyExpiresOn: "2027-03-01" } }),
      context(),
    );

    expect(handling.kind).toBe("tell_household");
    if (handling.kind !== "tell_household") return;
    expect(handling.assessment.reason).toContain("under warranty until 2027-03-01");
    expect(handling.assessment.action).toEqual({ action: "claim_cover", target: "asset.geyser" });
  });

  it("books a service when there is no cover to claim", () => {
    const handling = handleHomeException(exception(), context());

    expect(handling.kind).toBe("tell_household");
    if (handling.kind !== "tell_household") return;
    expect(handling.assessment.action).toEqual({ action: "book_service", target: "asset.geyser" });
  });

  it("keeps a thread key even when nothing in the registry is involved", () => {
    const handling = handleHomeException(
      exception({ kind: "pest", asset: null, detail: "Ants in the kitchen", blocksDailyLife: false }),
      context(),
    );

    expect(handling.kind).toBe("tell_household");
    if (handling.kind !== "tell_household") return;
    expect(handling.assessment.subjectKey).toBe("home.pest");
  });
});
