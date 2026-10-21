import { describe, expect, it } from "vitest";

import { catFacts } from "./cat-facts";

const now = new Date("2026-10-21T10:00:00Z");

describe("catFacts", () => {
  it("names tonight's dinner, today's next event, tomorrow's first and the list, from the record only", () => {
    const facts = catFacts({
      meals: [
        { name: "Poha", slot: "breakfast", status: "eaten" },
        { name: "Dal tadka", slot: "dinner", status: "planned" },
      ],
      events: [
        { title: "Swimming", startsAt: new Date("2026-10-21T08:00:00Z"), status: "planned", time: "1:30 pm", today: true },
        { title: "Piano", startsAt: new Date("2026-10-21T12:00:00Z"), status: "planned", time: "5:30 pm", today: true },
        { title: "Dentist", startsAt: new Date("2026-10-22T05:00:00Z"), status: "confirmed", time: "10:30 am", today: false },
      ],
      toBuy: 3,
      now,
    });
    expect(facts).toEqual([
      { key: "today.cat.dinner", values: { meal: "Dal tadka" } },
      { key: "today.cat.eventToday", values: { title: "Piano", time: "5:30 pm" } },
      { key: "today.cat.eventTomorrow", values: { title: "Dentist" } },
      { key: "today.cat.toBuy", values: { count: 3 } },
    ]);
  });

  it("says nothing it has no record of, and skips what is cancelled or done", () => {
    expect(
      catFacts({
        meals: [{ name: "Khichdi", slot: "dinner", status: "eaten" }],
        events: [{ title: "Party", startsAt: new Date("2026-10-21T15:00:00Z"), status: "cancelled", time: "8:30 pm", today: true }],
        toBuy: 0,
        now,
      }),
    ).toEqual([]);
  });
});
