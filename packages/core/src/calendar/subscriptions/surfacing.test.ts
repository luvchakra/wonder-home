import { describe, expect, it } from "vitest";

import { isFamilyMoment } from "../../family/schedule";
import { eventEntries, type CalendarEventRecord, type CalendarViewer } from "../projection";

const viewer: CalendarViewer = { memberId: "m-1", isAdmin: true, timeZone: "UTC" };
const range = { from: "2026-01-01", to: "2026-01-31" };

function record(overrides: Partial<CalendarEventRecord> = {}): CalendarEventRecord {
  return {
    id: "e-1", title: "Diwali", kind: "family_time", category: null, startsAt: new Date("2026-01-15T00:00:00Z"), endsAt: new Date("2026-01-16T00:00:00Z"),
    allDay: true, timeZone: "UTC", visibility: "household", recurrence: null, status: "confirmed", ownerMemberId: null, protected: false,
    location: null, participantMemberIds: [], exceptions: [], ...overrides,
  };
}

describe("imported events on the calendar (story 26-022)", () => {
  it("are read-only and carry their feed, even for an admin", () => {
    const [entry] = eventEntries([record({ fromSubscription: { id: "sub-1", name: "India Holidays", color: null } })], viewer, range);
    expect(entry!.can.edit).toBe(false);
    expect(entry!.fromSubscription).toEqual({ id: "sub-1", name: "India Holidays", color: null });
  });

  it("stay editable when not imported", () => {
    const [entry] = eventEntries([record()], viewer, range);
    expect(entry!.can.edit).toBe(true);
    expect(entry!.fromSubscription == null).toBe(true);
  });

  it("never lead as a family moment", () => {
    expect(isFamilyMoment({ kind: "family_time", participants: [], status: "confirmed", sourceSubscriptionId: null })).toBe(true);
    expect(isFamilyMoment({ kind: "family_time", participants: [], status: "confirmed", sourceSubscriptionId: "sub-1" })).toBe(false);
  });
});
