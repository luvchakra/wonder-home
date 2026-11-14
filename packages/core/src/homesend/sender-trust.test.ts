import { describe, expect, it } from "vitest";

import { deadlineOf, senderTrustNeeds, senderVerdict, type SenderRow } from "./sender-trust";

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

  it("asks once per sender, with Trust first, a default of setting it aside and a 3-day deadline", () => {
    const [entry, ...rest] = senderTrustNeeds([row(), row({ id: "s-2", state: "trusted" })], now);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      id: "sender_trust:s-1",
      kind: "sender_trust",
      question: { key: "homesend.sender.question", params: { address: "accounts@greenvalley.school" } },
      answers: [{ key: "trust" }, { key: "not_ours" }],
      defaultAnswer: "set_aside",
      recipients: "admins",
      deadline: "2026-11-16T09:00:00.000Z",
    });
  });

  it("stops asking once the deadline has passed: the sweep sets it aside", () => {
    const old = row({ asked_at: "2026-11-10T09:00:00Z" });
    expect(deadlineOf(old).getTime()).toBeLessThan(now.getTime());
    expect(senderTrustNeeds([old], now)).toEqual([]);
  });
});
