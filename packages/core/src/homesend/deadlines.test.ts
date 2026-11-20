import { describe, expect, it } from "vitest";

import { addQuestion, amountQuestion, HEALTH_FOR_SOURCE, healthForQuestion, checkQuestion, effectOf, endingFor, notHouseholdInformation, resendQuestion, updateQuestion, waitingQuestion, type EndingInput } from "./deadlines";

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
    expect(endingFor({ ...base, rawText: PAGE })).toEqual({ action: "note" });
  });

  it("keeps something it couldn't tell the kind of as a household note", () => {
    expect(endingFor({ ...base, kind: "unknown" })).toEqual({ action: "note" });
  });

  it("reads an unreadable item once more, then asks its sender once (only while they're in HomeTalk), then waits for that answer", () => {
    const unreadable: EndingInput = { ...base, status: "failed", failureReason: "unreadable", kind: null, senderActive: true };
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
    expect(endingFor({ ...base, kind: "unknown", readable: false, retryCount: 1, senderActive: true })).toEqual({ action: "ask_resend" });
  });

  it("sets an unreadable item aside with its reason when its sender isn't in HomeTalk right now (2026-11-20 review)", () => {
    const unreadable: EndingInput = { ...base, status: "failed", failureReason: "unreadable", kind: null, retryCount: 1 };
    expect(endingFor(unreadable)).toEqual({ action: "set_aside", reason: "unreadable" });
    expect(endingFor({ ...unreadable, senderActive: false })).toEqual({ action: "set_aside", reason: "unreadable" });
    // Still read again first, whoever is around.
    expect(endingFor({ ...unreadable, retryCount: 0 })).toEqual({ action: "read_again" });
  });

  it("never makes a waiting bill, receipt or health document a note: part B records it as Checking", () => {
    for (const kind of ["bill", "receipt", "health_document"] as const) expect(endingFor({ ...base, kind })).toEqual({ action: "wait" });
  });

  it("asks about a waiting bill or health document that matches one on record, once (owner, 2026-11-20)", () => {
    const bill = { ...base, kind: "bill" as const };
    // One clear bill with a newer amount or date is updated at once (2026-11-20 review); two candidates are still asked.
    expect(endingFor({ ...bill, match: "update" })).toEqual({ action: "update_now" });
    expect(endingFor({ ...bill, match: "update", ambiguous: true })).toEqual({ action: "ask_update", cancel: false });
    // A cancellation never cancels on its own: still asked.
    expect(endingFor({ ...bill, match: "cancellation" })).toEqual({ action: "ask_update", cancel: true });
    expect(endingFor({ ...bill, match: "update", asked: new Set(["homesend_update"]) })).toEqual({ action: "wait" });
    // The same one again: set aside as already on record, no question (2026-11-20).
    expect(endingFor({ ...base, kind: "health_document", match: "duplicate" })).toEqual({ action: "already_recorded" });
    expect(endingFor({ ...bill, match: "duplicate" })).toEqual({ action: "already_recorded" });
    // Nothing on record: recorded as Checking where the household records bills directly; else it waits, never a note.
    expect(endingFor({ ...bill, match: null, recordable: true })).toEqual({ action: "record" });
    expect(endingFor({ ...bill, match: null, recordable: false })).toEqual({ action: "wait" });
    // Not looked (or a conflict): never recorded on a guess.
    expect(endingFor({ ...bill, recordable: true })).toEqual({ action: "wait" });
    expect(endingFor({ ...base, kind: "health_document", match: null, recordable: true })).toEqual({ action: "wait" });
  });

  it("asks \"Add this bill?\" about what record first couldn't add, once (owner, 2026-11-20: \"record\")", () => {
    const bill = { ...base, kind: "bill" as const, match: null };
    expect(endingFor({ ...bill, recordable: false, addable: true })).toEqual({ action: "ask_add" });
    expect(endingFor({ ...bill, recordable: true, addable: true })).toEqual({ action: "record" });
    expect(endingFor({ ...bill, addable: true, asked: new Set(["homesend_add"]) })).toEqual({ action: "wait" });
    expect(endingFor({ ...base, kind: "receipt", match: null, addable: true })).toEqual({ action: "ask_add" });
    expect(endingFor({ ...base, kind: "health_document", match: null, addable: true, healthSubject: "sender" })).toEqual({ action: "ask_add" });
    // Nothing it could be added with (a receipt with no lines, a health document nobody sent): it waits, never a note.
    expect(endingFor({ ...base, kind: "receipt", match: null, addable: false })).toEqual({ action: "wait" });
    // A match on record is asked about as a match, never added twice.
    expect(endingFor({ ...bill, match: "update", addable: true })).toEqual({ action: "update_now" });
  });

  it("adds a document's several bills at once where money is recorded directly (2026-11-20 review)", () => {
    const bill = { ...base, kind: "bill" as const, match: null, addable: true };
    expect(endingFor({ ...bill, severalNow: true })).toEqual({ action: "add_now" });
    // "Wait for review" chosen by an Admin: still asked.
    expect(endingFor({ ...bill, severalNow: false })).toEqual({ action: "ask_add" });
    expect(endingFor({ ...bill, severalNow: true, asked: new Set(["homesend_add"]) })).toEqual({ action: "wait" });
  });

  it("asks only under the Admin's \"Wait for review\"; otherwise adds at once as Checking (2026-11-20)", () => {
    const bill = { ...base, kind: "bill" as const, match: null, recordable: false, addable: true };
    expect(endingFor({ ...bill, waitForReview: false })).toEqual({ action: "add" });
    expect(endingFor({ ...bill, waitForReview: true })).toEqual({ action: "ask_add" });
    expect(endingFor({ ...base, kind: "health_document", match: null, addable: true, waitForReview: false, healthSubject: "sender" })).toEqual({ action: "add" });
  });

  it("never files a health document under its sender unless its own words say it is theirs (2026-11-20)", () => {
    const health = { ...base, kind: "health_document" as const, match: null, addable: true };
    for (const healthSubject of ["other", "unclear", undefined] as const) {
      for (const waitForReview of [false, true]) {
        // Was "add" / "ask_add" (whose default adds it), filing it under the sender: now "Who is this for?" to the sender.
        expect(endingFor({ ...health, healthSubject, waitForReview })).toEqual({ action: "ask_health_for" });
      }
      // Asked once; nobody to ask (no sender who can answer): set aside, never filed.
      expect(endingFor({ ...health, healthSubject, asked: new Set([HEALTH_FOR_SOURCE]) })).toEqual({ action: "wait" });
      expect(endingFor({ ...health, healthSubject, senderMemberId: null })).toEqual({ action: "set_aside", reason: "health_not_claimed" });
    }
    // An allowed filer's document naming another member keeps #561's behaviour.
    expect(endingFor({ ...health, healthSubject: "other", filedFor: "m-2" })).toEqual({ action: "file_for", memberId: "m-2" });
  });

  it("keeps a waiting item as a note at once, with no question (2026-11-20)", () => {
    expect(endingFor(base)).toEqual({ action: "note" });
    expect(endingFor({ ...base, status: "routed" })).toEqual({ action: "wait" });
  });
});

describe("questions and their defaults", () => {
  it("\"Who is this for?\" defaults to set aside; only the sender's own tap files it, for them (2026-11-20)", () => {
    const question = healthForQuestion({ title: "Blood test", dueOn: null, today });
    expect(question.source).toBe(HEALTH_FOR_SOURCE);
    expect(question.prompt.code).toBe("homesend.health_for");
    expect(question.answers.map((a) => a.value)).toEqual(["for_me", "set_aside"]);
    expect(question.defaultAnswer).toBe("set_aside");
    expect(effectOf(HEALTH_FOR_SOURCE, "set_aside", true)).toEqual({ effect: "archive", reason: "health_not_claimed" });
    expect(effectOf(HEALTH_FOR_SOURCE, "set_aside", false)).toEqual({ effect: "archive", reason: "removed_by_person" });
    expect(effectOf(HEALTH_FOR_SOURCE, "for_me", false)).toEqual({ effect: "add", forSender: true });
    // A default never files it, even if "for_me" were somehow the default.
    expect(effectOf(HEALTH_FOR_SOURCE, "for_me", true)).toEqual({ effect: "none" });
  });

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

  it("asks the doubtful amount with the default of keeping it Checking, never confirming money", () => {
    const question = amountQuestion({ kind: "bill", title: "Electricity", amount: "₹2,140", dueOn: "2026-11-15", today });
    expect(question.source).toBe("homesend_amount");
    expect(question.prompt.title).toBe("Electricity · ₹2,140");
    expect(question.defaultAnswer).toBe("keep_checking");
    expect(effectOf("homesend_amount", "keep_checking", true)).toEqual({ effect: "keep_checking" });
    expect(effectOf("homesend_amount", "looks_right", false)).toEqual({ effect: "confirm" });
  });

  it("updates a matched bill by default, marked Checking, and never cancels by default", () => {
    const update = updateQuestion({ kind: "bill", title: "Electricity", dueOn: "2026-11-21", today, cancel: false });
    expect(update.source).toBe("homesend_update");
    expect(update.prompt.code).toBe("homesend.update");
    expect(update.answers.map((answer) => answer.value)).toEqual(["update", "keep_as_is"]);
    expect(update.defaultAnswer).toBe("update");
    expect(update.consequence).toBe(3);
    const cancel = updateQuestion({ kind: "bill", title: "Gym", dueOn: null, today, cancel: true });
    expect(cancel.answers.map((answer) => answer.value)).toEqual(["cancel_it", "keep_as_is"]);
    expect(cancel.defaultAnswer).toBe("keep_checking");

    expect(effectOf("homesend_update", "update", true)).toEqual({ effect: "revise", mode: "update", checking: true });
    expect(effectOf("homesend_update", "update", false)).toEqual({ effect: "revise", mode: "update", checking: false });
    expect(effectOf("homesend_update", "keep_as_is", true)).toEqual({ effect: "archive", reason: "already_recorded" });
    expect(effectOf("homesend_update", "keep_checking", true)).toEqual({ effect: "revise", mode: "flag", checking: true });
    expect(effectOf("homesend_update", "cancel_it", false)).toEqual({ effect: "revise", mode: "cancel", checking: false });
    // Even handed "cancel" as a default, it only keeps the record Checking.
    expect(effectOf("homesend_update", "cancel_it", true)).toEqual({ effect: "revise", mode: "flag", checking: true });
    expect(effectOf("homesend_update", "pay", true)).toEqual({ effect: "none" });
  });

  it("adds by default, as Checking", () => {
    const bill = addQuestion({ kind: "bill", title: "Water bill", dueOn: null, today });
    expect(bill).toMatchObject({ source: "homesend_add", defaultAnswer: "add", prompt: { code: "homesend.add" } });
    expect(bill.answers.map((answer) => answer.value)).toEqual(["add", "set_aside"]);
    expect(addQuestion({ kind: "receipt", title: "FreshMart", dueOn: null, today }).prompt.code).toBe("homesend.add.receipt");
    expect(addQuestion({ kind: "health_document", title: "Blood test", dueOn: null, today }).prompt.code).toBe("homesend.add.health");
    expect(effectOf("homesend_add", "add", true)).toEqual({ effect: "add" });
    expect(effectOf("homesend_add", "set_aside", false)).toEqual({ effect: "archive", reason: "removed_by_person" });
    expect(effectOf("homesend_add", "pay", true)).toEqual({ effect: "none" });
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
