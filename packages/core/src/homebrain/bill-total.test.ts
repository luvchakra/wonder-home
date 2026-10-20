import { describe, expect, it } from "vitest";

import { money } from "../context/format";
import type { HouseholdContextItem } from "../context/types";
import { householdInsights } from "./insights";

/** "How much do I owe this month?" (priority H-1): a sum of the open bills in the window, every bill listed, as arithmetic. */

const TZ = "Asia/Kolkata";
const TODAY = "2026-09-23";

function bill(id: string, title: string, dueOn: string, amountMinor: number | null, extra: Record<string, unknown> = {}): HouseholdContextItem {
  return {
    id: `bill:${id}`, householdId: "h", domain: "bills", entityType: "bill", entityId: id, subjectMemberIds: [], summary: "", need: "", attributes: { title, dueOn, date: dueOn, amountMinor, currency: amountMinor === null ? null : "INR", status: "received", ...extra },
    source: { type: "obligations", sourceId: id, capturedAt: null }, evidence: [], confidence: 1, confirmed: true, privacyClass: "financial",
    validFrom: null, validUntil: null, freshnessAt: "2026-09-20T00:00:00Z", freshness: "current", tier: 2, aliases: [], relatedEntityIds: [],
  } as unknown as HouseholdContextItem;
}

const flat = bill("flat", "Electricity — flat", "2026-09-26", 184000);
const studio = bill("studio", "Electricity — studio", "2026-09-28", 312000);
const card = bill("card", "Credit card", "2026-09-30", 1845050);
const rent = bill("rent", "Rent", "2026-10-01", 3200000);
const paid = bill("paid", "Water", "2026-09-10", 50000, { status: "paid" });
const noAmount = bill("noamt", "School fees", "2026-09-29", null);

const total = (items: HouseholdContextItem[], question: string) => householdInsights(items, { timezone: TZ, today: TODAY, question }).filter((entry) => entry.rule === "total");

describe("what is owed (priority H-1)", () => {
  it("adds up the open bills due this month and lists each one", () => {
    const [entry] = total([flat, studio, rent, paid], "How much do I owe this month?");
    expect(entry!.statement).toBe("₹4,960 is due this month, across 2 bills: Electricity — flat ₹1,840 (due Saturday 26 Sep); Electricity — studio ₹3,120 (due Monday 28 Sep).");
    expect(entry!.evidence).toEqual(["bill:flat", "bill:studio"]);
    expect(entry!.privacyClass).toBe("financial");
  });

  it("never rounds a decimal amount", () => {
    const [entry] = total([flat, card], "how much do we owe in bills this month");
    expect(entry!.statement).toContain("₹20,290.50 is due this month");
    expect(entry!.statement).toContain("Credit card ₹18,450.50");
    expect(money(4250, "INR")).toBe("₹42.50");
    expect(money(4200, "INR")).toBe("₹42");
  });

  it("says a bill with no amount is not in the sum, and never counts it as nothing", () => {
    const [entry] = total([flat, noAmount], "How much do I owe this month?");
    expect(entry!.statement).toContain("₹1,840 is due this month, across 1 bill");
    expect(entry!.statement).toContain("1 more bill has no amount on record, so it is not in that sum.");
    expect(total([noAmount], "How much do I owe this month?")[0]!.statement).toBe("1 bill is due this month, with no amount on record.");
  });

  it("reads next month and this week, and leaves paid and out-of-window bills out", () => {
    expect(total([flat, rent], "how much do I owe next month")[0]!.statement).toContain("₹32,000 is due next month, across 1 bill: Rent");
    expect(total([flat, studio, rent], "how much is due this week")[0]!.statement).toContain("₹4,960 is due in the next 7 days");
    expect(total([paid], "How much do I owe this month?")).toEqual([]);
  });

  it("is not drawn for a question that is not asking for a total", () => {
    expect(total([flat, studio], "What bills are due?")).toEqual([]);
    expect(total([flat, studio], "When is the electricity bill due?")).toEqual([]);
  });
});
