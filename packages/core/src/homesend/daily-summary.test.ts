import { describe, expect, it } from "vitest";

import { todayCounts } from "./daily-summary";

describe("today's HomeSend report (2026-11-20)", () => {
  const now = new Date("2026-11-20T14:00:00Z"); // 19:30 in Kolkata
  it("counts what was added today on the household's clock, how many are Checking, and what it set aside on its own", () => {
    const counts = todayCounts({
      timeZone: "Asia/Kolkata",
      now,
      changes: [
        { entityId: "b1", changeType: "created", createdAt: "2026-11-20T04:00:00Z", confirmationState: "unconfirmed" },
        { entityId: "s1", changeType: "created", createdAt: "2026-11-20T05:00:00Z", confirmationState: "confirmed" },
        { entityId: "u1", changeType: "created", createdAt: "2026-11-20T05:00:00Z", undoneAt: "2026-11-20T06:00:00Z" },
        // Yesterday in Kolkata (23:00 on the 19th).
        { entityId: "y1", changeType: "created", createdAt: "2026-11-19T17:30:00Z" },
        { entityId: "b0", changeType: "updated", createdAt: "2026-11-20T05:00:00Z" },
      ],
      setAside: [
        { archivedAt: "2026-11-20T06:00:00Z", archiveReason: "not_household" },
        { archivedAt: "2026-11-20T06:00:00Z", archiveReason: "removed_by_person" },
        { archivedAt: "2026-11-18T06:00:00Z", archiveReason: "unreadable" },
      ],
    });
    expect(counts).toEqual({ added: 2, checking: 1, setAside: 1 });
  });
});
