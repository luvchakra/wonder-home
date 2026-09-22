import { describe, expect, it } from "vitest";

import { canExecute, notYetDoable, resolveWhen, zonedTimeToUtcIso } from "./executor";
import type { HouseholdIntent } from "./intent";

const intent = (over: Partial<HouseholdIntent>): HouseholdIntent => ({
  action: "add_to_list",
  actorMemberId: "m-1",
  target: { kind: "list", reference: "groceries" },
  parameters: { item: "milk" },
  confidence: 0.9,
  channel: "text",
  utterance: "add milk",
  ...over,
});

describe("what can be carried out today", () => {
  it("adds to a list, records an absence, and remembers a preference", () => {
    expect(canExecute(intent({}))).toBe(true);
    expect(canExecute(intent({ action: "record_absence", target: { kind: "member", reference: "sunita" } }))).toBe(true);
    expect(canExecute(intent({ action: "set_preference", target: { kind: "outcome", reference: "meals.dinner" } }))).toBe(true);
  });

  it("does not claim to pay, order, reassign or reschedule", () => {
    for (const action of ["make_payment", "order_items", "assign_responsibility", "adjust_schedule", "plan_event"] as const) {
      expect(canExecute(intent({ action }))).toBe(false);
      expect(notYetDoable(action)).not.toMatch(/on its way/);
    }
  });

  it("needs an item to add and a person to mark away", () => {
    expect(canExecute(intent({ parameters: {} }))).toBe(false);
    expect(canExecute(intent({ action: "record_absence", target: { kind: "unspecified" } }))).toBe(false);
  });

  it("books an appointment, logs an issue, and resolves one — but never a vital or a fitness goal (21-006)", () => {
    expect(canExecute(intent({ action: "record_health_appointment", parameters: { appointmentType: "dentist" } }))).toBe(true);
    expect(canExecute(intent({ action: "record_health_appointment", parameters: {} }))).toBe(false);
    expect(canExecute(intent({ action: "log_health_issue", parameters: { label: "headache" } }))).toBe(true);
    expect(canExecute(intent({ action: "log_health_issue", parameters: { label: "" } }))).toBe(false);
    expect(canExecute(intent({ action: "resolve_health_issue", parameters: { label: "headache" } }))).toBe(true);
    expect(canExecute(intent({ action: "resolve_health_issue", parameters: {} }))).toBe(false);
    expect(canExecute(intent({ action: "log_vital", parameters: { vital: "bp", reading: "128/82" } }))).toBe(false);
    expect(canExecute(intent({ action: "set_fitness_goal", parameters: { activity: "walk" } }))).toBe(false);
  });

  it("is honest that vitals and fitness goals point back to the Health screen, not 'on its way'", () => {
    expect(notYetDoable("log_vital")).not.toMatch(/on its way/);
    expect(notYetDoable("log_vital")).toMatch(/Health & Fitness/);
    expect(notYetDoable("set_fitness_goal")).not.toMatch(/on its way/);
  });
});

describe("turning a household's own wall-clock time into a UTC instant", () => {
  it("corrects by the zone's own offset — 2pm in Kolkata (UTC+5:30) is 8:30am UTC", () => {
    expect(zonedTimeToUtcIso("2026-09-23", 14, 0, "Asia/Kolkata")).toBe("2026-09-23T08:30:00.000Z");
  });

  it("is a no-op in UTC itself", () => {
    expect(zonedTimeToUtcIso("2026-09-23", 14, 0, "UTC")).toBe("2026-09-23T14:00:00.000Z");
  });
});

describe("which day 'tomorrow' is, in the household's own timezone", () => {
  // 20:30 UTC on the 20th is already the 21st in Kolkata.
  const now = new Date("2026-09-20T20:30:00.000Z");

  it("reads today and tomorrow where the household lives", () => {
    expect(resolveWhen("today", now, "Asia/Kolkata")).toBe("2026-09-21");
    expect(resolveWhen("tomorrow", now, "Asia/Kolkata")).toBe("2026-09-22");
    expect(resolveWhen("today", now, "UTC")).toBe("2026-09-20");
  });

  it("reads a weekday as the next one, including today", () => {
    // 2026-09-21 is a Monday.
    expect(resolveWhen("monday", now, "Asia/Kolkata")).toBe("2026-09-21");
    expect(resolveWhen("on friday", now, "Asia/Kolkata")).toBe("2026-09-25");
    expect(resolveWhen("sun", now, "Asia/Kolkata")).toBe("2026-09-27");
  });

  it("gives up on a span rather than picking a day", () => {
    expect(resolveWhen("this week", now, "Asia/Kolkata")).toBeNull();
    expect(resolveWhen("next week", now, "Asia/Kolkata")).toBeNull();
  });
});
