import { describe, expect, it } from "vitest";

import type { HomeAssessment } from "../home/assessment";
import { composeStatusAnswer } from "./status";

const need = (over: Partial<HomeAssessment>): HomeAssessment => ({
  subjectKey: "x",
  title: "Electricity bill",
  status: "at_risk",
  riskLevel: "medium",
  notable: true,
  reason: "Due on Friday and not yet paid.",
  action: { action: "pay" },
  dueOn: null,
  ...over,
});

describe("what's going on, answered from the household's own state", () => {
  it("says so when nothing has been set up yet", () => {
    expect(composeStatusAnswer({ needsYou: [], handled: [], checked: 0 })).toMatch(/not been told enough/);
  });

  it("says all quiet when everything checked was fine", () => {
    const text = composeStatusAnswer({ needsYou: [], handled: [{ title: "Groceries" }, { title: "Bills" }], checked: 9 });
    expect(text).toMatch(/All quiet/);
    expect(text).toMatch(/9 things/);
    expect(text).toMatch(/groceries, bills/);
  });

  it("lists what needs a person, with the domain's own reason, and counts the rest", () => {
    const text = composeStatusAnswer({
      needsYou: [need({ riskLevel: "high" }), need({ title: "Milk", reason: "Running low.", riskLevel: "low" })],
      handled: [{ title: "Meals" }],
      checked: 6,
    });
    expect(text).toMatch(/^\*\*2 things need you\*\* \(1 urgent\):\n- \*\*Electricity bill\*\* — Due on Friday and not yet paid\n- \*\*Milk\*\* — Running low/);
    expect(text).toMatch(/Everything else — 4 things — is handled across meals\./);
  });

  it("caps the list and says how many more", () => {
    const many = Array.from({ length: 7 }, (_, index) => need({ title: `Thing ${index}` }));
    expect(composeStatusAnswer({ needsYou: many, handled: [], checked: 7 })).toMatch(/and 3 more/);
  });

  it("puts the day's calendar first when a day was asked about", () => {
    const text = composeStatusAnswer({
      needsYou: [],
      handled: [],
      checked: 3,
      when: "tomorrow",
      timezone: "Asia/Kolkata",
      events: [{ title: "Karate", startsAt: new Date("2026-09-21T12:30:00.000Z") }],
    });
    expect(text).toMatch(/^Tomorrow: Karate at 6:00pm — see \[Family\]\(\/family\)\./);
    expect(text).toMatch(/All quiet/);
  });

  it("names the domains it could not read", () => {
    expect(composeStatusAnswer({ needsYou: [], handled: [], checked: 2, unavailable: ["Bills"] })).toMatch(/could not read Bills/);
  });
});
