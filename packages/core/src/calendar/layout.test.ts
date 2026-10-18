import { describe, expect, it } from "vitest";

import { atLocal } from "./dates";
import { gridHoursFor, layoutDay } from "./layout";
import type { CalendarEntry } from "./projection";

const TZ = "Asia/Kolkata";
const DAY = "2026-10-20";

function block(id: string, fromMinute: number, toMinute: number, day = DAY): CalendarEntry {
  return {
    id,
    source: "event",
    sourceId: id,
    title: id,
    detail: null,
    start: atLocal(day, fromMinute, TZ),
    end: atLocal(day, toMinute, TZ),
    allDay: false,
    timeZone: TZ,
    kind: "block",
    category: "family",
    memberIds: [],
    ownerMemberId: null,
    status: "confirmed",
    visibility: "household",
    occurrenceDate: null,
    repeats: false,
    protected: false,
    href: null,
    can: { edit: false },
  };
}

describe("layoutDay", () => {
  it("places a lone entry by its minutes from 6 am", () => {
    const [placed] = layoutDay([block("a", 9 * 60, 10 * 60 + 30)], DAY, TZ);
    expect(placed).toMatchObject({ top: 180, height: 90, column: 0, columns: 1, clippedStart: false });
  });

  it("puts overlapping entries side by side and reuses a column once it is free", () => {
    const placed = layoutDay([block("a", 9 * 60, 11 * 60), block("b", 10 * 60, 12 * 60), block("c", 11 * 60, 12 * 60)], DAY, TZ);
    const byId = Object.fromEntries(placed.map((item) => [item.entry.id, item]));
    expect(byId.a).toMatchObject({ column: 0, columns: 2 });
    expect(byId.b).toMatchObject({ column: 1, columns: 2 });
    expect(byId.c).toMatchObject({ column: 0, columns: 2 });
  });

  it("gives a short entry room for its title and clamps one that started yesterday", () => {
    const placed = layoutDay([block("short", 9 * 60, 9 * 60 + 5), { ...block("overnight", 22 * 60, 24 * 60, "2026-10-19"), end: atLocal(DAY, 8 * 60, TZ) }], DAY, TZ);
    const byId = Object.fromEntries(placed.map((item) => [item.entry.id, item]));
    expect(byId.short!.height).toBe(30);
    expect(byId.overnight).toMatchObject({ top: 0, clippedStart: true });
  });

  it("widens the hours for an early start or a late finish on that day", () => {
    expect(gridHoursFor([block("early", 5 * 60, 6 * 60), block("late", 22 * 60, 23 * 60 + 30)], DAY, TZ)).toMatchObject({ startHour: 5, endHour: 24 });
    expect(gridHoursFor([block("noon", 12 * 60, 13 * 60)], DAY, TZ)).toMatchObject({ startHour: 6, endHour: 23 });
  });
});
