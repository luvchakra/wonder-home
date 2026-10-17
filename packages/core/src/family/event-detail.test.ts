import { describe, expect, it } from "vitest";

import { planningGaps } from "./event-detail";

const now = new Date("2026-10-17T10:00:00Z");
const base = {
  kind: "birthday" as const,
  status: "planned" as const,
  endsAt: new Date("2026-10-20T12:00:00Z"),
  location: null,
  notes: null,
  participants: [] as { memberId: string; response: "unknown" | "yes" | "no" | "maybe"; required: boolean }[],
  guests: [] as never[],
  inviteToken: null,
};

describe("planningGaps", () => {
  it("asks for a place, who is coming, what to know and a link for a bare birthday", () => {
    expect(planningGaps(base, now)).toEqual(["where", "who", "notes", "share"]);
  });

  it("waits on replies once people are asked and nobody has answered", () => {
    const asked = { ...base, location: "Home", notes: "Cake at 6", participants: [{ memberId: "m", response: "unknown" as const, required: false }], inviteToken: "t".repeat(43) };
    expect(planningGaps(asked, now)).toEqual(["replies"]);
  });

  it("needs nothing once it is planned and answered", () => {
    const ready = { ...base, location: "Home", notes: "Cake", participants: [{ memberId: "m", response: "yes" as const, required: false }], inviteToken: "t".repeat(43) };
    expect(planningGaps(ready, now)).toEqual([]);
  });

  it("never asks a school event for a place, and asks nothing of a cancelled or past event", () => {
    expect(planningGaps({ ...base, kind: "school_event" }, now)).not.toContain("where");
    expect(planningGaps({ ...base, status: "cancelled" }, now)).toEqual([]);
    expect(planningGaps({ ...base, endsAt: new Date("2026-10-01T00:00:00Z") }, now)).toEqual([]);
  });
});
