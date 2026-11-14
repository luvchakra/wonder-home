import { describe, expect, it } from "vitest";

import { checkQuestion, effectOf, endingFor, notHouseholdInformation, resendQuestion, waitingQuestion, type EndingInput } from "./deadlines";

const PAGE = `Home | About us | Contact us | Blog
Accept all cookies to continue. Read our Privacy Policy and Terms of Service.
Subscribe to our newsletter! © 2026 Example Media. All rights reserved.`;

const base: EndingInput = {
  status: "classified",
  kind: "school_item",
  readable: true,
  failureReason: null,
  rawText: "Science exhibition on Friday",
  retryCount: 0,
  retryRequestedAt: null,
  canReadAgain: true,
  senderMemberId: "m-1",
  asked: new Set(),
  minutesSinceTouched: 600,
};

describe("not household information", () => {
  it("knows a pasted web page, an ad or a newsletter by two signs together", () => {
    expect(notHouseholdInformation(PAGE)).toBe(true);
    expect(notHouseholdInformation("Shop now! 40% off everything. Sponsored. Unsubscribe here.")).toBe(true);
  });

  it("keeps a household message, even one with a footer", () => {
    expect(notHouseholdInformation("Annual Day on 6 Dec for class 3. Please send costumes by Monday.")).toBe(false);
    expect(notHouseholdInformation("Electricity bill ₹2,140 due 12 Nov. Unsubscribe from paper bills at our site.")).toBe(false);
    expect(notHouseholdInformation(null)).toBe(false);
  });
});

describe("every item ends as something", () => {
  it("sets a page HomeSend couldn't place aside at once, with its reason", () => {
    expect(endingFor({ ...base, kind: "unknown", rawText: PAGE })).toEqual({ action: "set_aside", reason: "not_household" });
    expect(endingFor({ ...base, status: "failed", failureReason: "unreadable", kind: null, rawText: PAGE })).toEqual({ action: "set_aside", reason: "not_household" });
  });

  it("never sets aside a reading that found something, whatever its footer", () => {
    expect(endingFor({ ...base, rawText: PAGE })).toEqual({ action: "ask" });
  });

  it("keeps something it couldn't tell the kind of as a household note", () => {
    expect(endingFor({ ...base, kind: "unknown" })).toEqual({ action: "note" });
  });

  it("reads an unreadable item once more, then asks its sender once, then waits for that answer", () => {
    const unreadable: EndingInput = { ...base, status: "failed", failureReason: "unreadable", kind: null };
    expect(endingFor(unreadable)).toEqual({ action: "read_again" });
    expect(endingFor({ ...unreadable, retryRequestedAt: "2026-11-14T10:00:00Z", retryCount: 1 })).toEqual({ action: "wait" });
    expect(endingFor({ ...unreadable, retryCount: 1, minutesSinceTouched: 10 })).toEqual({ action: "wait" });
    expect(endingFor({ ...unreadable, retryCount: 1 })).toEqual({ action: "ask_resend" });
    expect(endingFor({ ...unreadable, retryCount: 1, asked: new Set(["homesend_resend"]) })).toEqual({ action: "wait" });
  });

  it("sets aside an unreadable email with nobody to ask, and a failure a second read can't help", () => {
    expect(endingFor({ ...base, status: "failed", failureReason: "unreadable", kind: null, retryCount: 1, senderMemberId: null })).toEqual({ action: "set_aside", reason: "unreadable" });
    expect(endingFor({ ...base, status: "failed", failureReason: "security_rejected", kind: null })).toEqual({ action: "set_aside", reason: "unreadable" });
  });

  it("does the same for a paste whose reading failed", () => {
    expect(endingFor({ ...base, kind: "unknown", readable: false })).toEqual({ action: "read_again" });
    expect(endingFor({ ...base, kind: "unknown", readable: false, retryCount: 1 })).toEqual({ action: "ask_resend" });
  });

  it("never makes a waiting bill, receipt or health document a note: part B records it as Checking", () => {
    for (const kind of ["bill", "receipt", "health_document"] as const) expect(endingFor({ ...base, kind })).toEqual({ action: "wait" });
  });

  it("asks a waiting item's one question once", () => {
    expect(endingFor(base)).toEqual({ action: "ask" });
    expect(endingFor({ ...base, asked: new Set(["homesend_waiting"]) })).toEqual({ action: "wait" });
    expect(endingFor({ ...base, status: "routed" })).toEqual({ action: "wait" });
  });
});

describe("questions and their defaults", () => {
  const today = "2026-11-14";

  it("keeps a Checking entry as read by default, but never confirms money or health by default", () => {
    expect(checkQuestion({ kind: "grocery_item", title: "Milk", dueOn: null, today }).defaultAnswer).toBe("looks_right");
    for (const kind of ["bill", "purchase", "receipt", "health_document"]) {
      const question = checkQuestion({ kind, title: "x", dueOn: "2026-11-15", today });
      expect(question.defaultAnswer).toBe("keep_checking");
      expect(question.prompt.code).toBe("homesend.check.careful");
    }
    expect(checkQuestion({ kind: "bill", title: "Electricity", dueOn: "2026-11-15", today }).consequence).toBe(3);
  });

  it("keeps a waiting item as a note by default, and what's on record for a duplicate", () => {
    expect(waitingQuestion({ kind: "event", title: "Annual Day", dueOn: null, today, duplicate: false }).defaultAnswer).toBe("note");
    expect(waitingQuestion({ kind: "event", title: "Annual Day", dueOn: null, today, duplicate: true }).defaultAnswer).toBe("keep_existing");
    expect(resendQuestion({ title: null }).defaultAnswer).toBe("set_aside");
  });

  it("maps every answer to what it does, the default never undoing anything", () => {
    expect(effectOf("homesend_check", "looks_right", true)).toEqual({ effect: "confirm" });
    expect(effectOf("homesend_check", "keep_checking", true)).toEqual({ effect: "keep_checking" });
    expect(effectOf("homesend_check", "not_right", false)).toEqual({ effect: "undo" });
    expect(effectOf("homesend_waiting", "note", true)).toEqual({ effect: "archive", reason: "kept_as_note" });
    expect(effectOf("homesend_waiting", "keep_existing", true)).toEqual({ effect: "archive", reason: "already_recorded" });
    expect(effectOf("homesend_resend", "set_aside", true)).toEqual({ effect: "archive", reason: "not_resent" });
    expect(effectOf("homesend_resend", "set_aside", false)).toEqual({ effect: "archive", reason: "removed_by_person" });
    expect(effectOf("homesend_waiting", "pay", false)).toEqual({ effect: "none" });
  });
});
