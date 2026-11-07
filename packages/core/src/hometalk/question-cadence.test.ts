import { describe, expect, it } from "vitest";

import { mayStartQuestion, WHATSAPP_QUESTION_GAP_MS } from "./question-cadence";

describe("at most one WhatsApp question started an hour per person (14-066, part 3)", () => {
  const now = new Date("2026-11-07T10:00:00Z");

  it("asks when none was started, or the last was an hour or more ago", () => {
    expect(mayStartQuestion(null, now)).toBe(true);
    expect(mayStartQuestion(new Date(now.getTime() - WHATSAPP_QUESTION_GAP_MS), now)).toBe(true);
    expect(mayStartQuestion("2026-11-07T08:30:00Z", now)).toBe(true);
  });

  it("holds a new one within the hour", () => {
    expect(mayStartQuestion("2026-11-07T09:30:00Z", now)).toBe(false);
    expect(mayStartQuestion(new Date(now.getTime() - 1000), now)).toBe(false);
  });

  it("an unreadable time never blocks a question", () => {
    expect(mayStartQuestion("not a time", now)).toBe(true);
  });
});
