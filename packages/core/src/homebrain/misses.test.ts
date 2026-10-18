import { describe, expect, it } from "vitest";

import { summarizeKeeping } from "./misses";

describe("summarizeKeeping (HomeBrain 4.0 §3.8)", () => {
  it("counts deeper looks, what they found by part of the home, and stores behind", () => {
    const now = new Date("2026-10-18T10:00:00Z");
    const result = summarizeKeeping(
      [
        { domains: ["bills"], trigger: "not_on_record", found: true },
        { domains: ["bills", "calendar"], trigger: "asked_to_look", found: true },
        { domains: ["school"], trigger: "unknown", found: false },
      ],
      [
        { built_at: "2026-10-18T09:55:00Z", stale_since: null },
        { built_at: "2026-10-18T09:40:00Z", stale_since: "2026-10-18T09:50:00Z" },
        { built_at: "2026-10-18T08:00:00Z", stale_since: null },
      ],
      now,
    );
    expect(result.deeperLooks).toEqual({ total: 3, found: 2 });
    expect(result.foundByDomain).toEqual({ bills: 2, calendar: 1 });
    expect(result.byTrigger).toEqual({ not_on_record: 1, asked_to_look: 1, unknown: 1 });
    expect(result.stores).toEqual({ total: 3, behind: 2, oldestLagMinutes: 120 });
  });
});
