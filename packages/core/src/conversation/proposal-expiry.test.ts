import { describe, expect, it } from "vitest";

import { deciderOf, planProposalSweep, type StaleProposalRow } from "./proposal-expiry";

const now = new Date("2026-11-14T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const row = (over: Partial<StaleProposalRow>): StaleProposalRow => ({
  id: "a-1",
  household_id: "h-1",
  action_type: "make_payment",
  created_at: hoursAgo(30),
  payload: { preview: { summary: "Pay the electricity bill" } },
  session_member_id: "kunal",
  ...over,
});

describe("proposals expire as not done after 48 hours (the owner, 2026-11-14)", () => {
  it("reminds once after a day, to the person who asked", () => {
    const plan = planProposalSweep([row({})], now);
    expect(plan.remind).toEqual([expect.objectContaining({ recipientMemberId: "kunal", summary: "Pay the electricity bill" })]);
    expect(plan.expire).toEqual([]);
    // Never twice.
    expect(planProposalSweep([row({ payload: { remindedAt: hoursAgo(5) } })], now).remind).toEqual([]);
    // Not before a day has passed.
    expect(planProposalSweep([row({ created_at: hoursAgo(3) })], now).remind).toEqual([]);
  });

  it("a child's request reminds the grown-up it went to", () => {
    const referred = row({ payload: { referral: { approvalId: "ap-1", approverMemberId: "neha" } } });
    expect(deciderOf(referred)).toBe("neha");
  });

  it("after 48 hours it closes as not done, and is never approved", () => {
    const plan = planProposalSweep([row({ created_at: hoursAgo(49) })], now);
    expect(plan.expire.map((entry) => entry.id)).toEqual(["a-1"]);
    expect(plan.remind).toEqual([]);
  });
});
