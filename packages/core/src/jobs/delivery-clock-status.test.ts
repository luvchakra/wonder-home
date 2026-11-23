import { describe, expect, it } from "vitest";

import { deliveryClockStatus } from "./delivery-clock-status";

describe("the delivery clock's line on Platform admin", () => {
  const now = new Date("2026-11-23T14:30:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  it("is 'not set' until the token is saved, whatever the heartbeats say", () => {
    expect(deliveryClockStatus(false, minutesAgo(1), now)).toMatchObject({ state: "not-set" });
  });

  it("is 'running' while GitHub delivered in the last 15 minutes, with how long ago", () => {
    expect(deliveryClockStatus(true, minutesAgo(4), now)).toEqual({ state: "running", words: "Delivery clock on GitHub: running (last run 4 min ago)." });
  });

  it("is 'failing' once GitHub's last delivery is stale, or never came", () => {
    expect(deliveryClockStatus(true, minutesAgo(16), now)).toMatchObject({ state: "failing" });
    expect(deliveryClockStatus(true, minutesAgo(16), now).words).toContain("last run 16 min ago");
    expect(deliveryClockStatus(true, null, now).words).toContain("no run yet");
  });
});
