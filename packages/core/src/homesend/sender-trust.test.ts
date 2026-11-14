import { describe, expect, it } from "vitest";

import { applySenderTrustAnswer, deadlineOf, senderQuestion, senderVerdict, SENDER_TRUST_SOURCE, type SenderRow } from "./sender-trust";

const now = new Date("2026-11-14T12:00:00Z");
const row = (over: Partial<SenderRow> = {}): SenderRow => ({
  id: "s-1",
  household_id: "h-1",
  address: "accounts@greenvalley.school",
  state: "pending",
  first_item_id: "i-1",
  held_count: 1,
  asked_at: "2026-11-13T09:00:00Z",
  ...over,
});

describe("outside senders are trusted once (decision 5, the owner 2026-11-14)", () => {
  it("reads an approved sender, holds a new one on Ask once, and drops a blocked one", () => {
    expect(senderVerdict({ allowlisted: true, mode: "review", state: null })).toBe("read");
    expect(senderVerdict({ allowlisted: false, mode: "ask_once", state: null })).toBe("hold");
    expect(senderVerdict({ allowlisted: false, mode: "ask_once", state: "pending" })).toBe("hold");
    // Not answered last time: asked again about the new mail.
    expect(senderVerdict({ allowlisted: false, mode: "ask_once", state: "not_answered" })).toBe("hold");
    expect(senderVerdict({ allowlisted: false, mode: "ask_once", state: "blocked" })).toBe("drop");
    // Switched back to "Read only senders an Admin added": dropped before it is stored, as on 3 Nov.
    expect(senderVerdict({ allowlisted: false, mode: "review", state: null })).toBe("drop");
  });

  it("asks the Admins once on the Needs-you list, Trust first, set aside by default", () => {
    expect(senderQuestion({ householdId: "h-1", senderId: "s-1", address: "accounts@greenvalley.school", askedAt: now })).toMatchObject({
      source: SENDER_TRUST_SOURCE,
      subjectTable: "homesend_email_senders",
      subjectId: "s-1",
      recipientMemberId: null,
      prompt: { code: "homesend.sender", title: "accounts@greenvalley.school" },
      answers: [{ value: "trust" }, { value: "not_ours" }],
      defaultAnswer: "set_aside",
    });
  });

  it("the backstop sets a still-pending sender aside after 48 hours, never sooner", () => {
    expect(deadlineOf(row({ asked_at: "2026-11-13T09:00:00Z" })).toISOString()).toBe("2026-11-15T09:00:00.000Z");
  });

  it("a default never trusts a sender, and nobody but a person's tap does", async () => {
    const untouchable = new Proxy({}, { get: () => { throw new Error("no write expected"); } }) as never;
    expect(await applySenderTrustAnswer(untouchable, "h-1", "s-1", "trust", { byDefault: true, memberId: null, now })).toBe(false);
    expect(await applySenderTrustAnswer(untouchable, "h-1", "s-1", "not_ours", { byDefault: false, memberId: null, now })).toBe(false);
  });
});
