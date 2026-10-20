import { describe, expect, it } from "vitest";

import { amountIn, matchBill, nextOnDay, readBillUtterance } from "./bill-talk";
import { resolveRuleIntent } from "./rules";

const read = (text: string) => resolveRuleIntent(text, { actorMemberId: "m-1", channel: "text" });

describe("reading a sentence about a bill (11-010)", () => {
  it("adds a bill with its amount, due day and how often it comes", () => {
    expect(read("Add the electricity bill, 2,400 due on the 5th every month")).toMatchObject({
      action: "add_bill",
      parameters: { what: "electricity", amount: 2400, dueDay: 5, recurrence: "monthly" },
    });
    expect(read("track the home loan EMI of ₹32,000 due on the 10th")).toMatchObject({ action: "add_bill", parameters: { what: "home loan emi", amount: 32000, dueDay: 10 } });
    expect(read("add rent")).toMatchObject({ action: "add_bill", parameters: { what: "rent" } });
  });

  it("notes a bill as paid, with what it came to and when, never as a payment to make", () => {
    expect(read("I paid the electricity bill, 2340 yesterday")).toMatchObject({
      action: "record_bill_payment",
      target: { kind: "bill", reference: "electricity" },
      parameters: { amount: 2340, when: "yesterday" },
    });
    expect(read("mark the rent paid")).toMatchObject({ action: "record_bill_payment", target: { reference: "rent" } });
    expect(read("the water bill is paid")).toMatchObject({ action: "record_bill_payment", target: { reference: "water" } });
    expect(read("pay the water bill").action).toBe("make_payment");
  });

  it("notes what this month's or next month's bill comes to", () => {
    expect(read("The electricity bill is 2,340")).toMatchObject({ action: "set_bill_amount", parameters: { amount: 2340, period: "current" } });
    expect(read("next month's rent is 26,000")).toMatchObject({ action: "set_bill_amount", target: { reference: "rent" }, parameters: { amount: 26000, period: "next" } });
  });

  it("leaves what is not about a bill to its own rules", () => {
    expect(readBillUtterance("add milk")).toBeNull();
    expect(readBillUtterance("I paid the plumber")).toBeNull();
    expect(read("add milk to the list").action).toBe("add_to_list");
    expect(readBillUtterance("how much is the electricity bill")).toBeNull();
  });
});

describe("helpers", () => {
  it("reads amounts the way people say them", () => {
    expect(amountIn("₹2,400")).toBe(2400);
    expect(amountIn("rs 2400.50")).toBe(2400.5);
    expect(amountIn("2.5k")).toBe(2500);
    expect(amountIn("1 lakh")).toBe(100000);
    expect(amountIn("no number")).toBeNull();
  });

  it("finds the household's bill by name or by kind, and offers both when two fit", () => {
    const bills = [
      { id: "b1", name: "Electricity", billType: "electricity" },
      { id: "b2", name: "BESCOM flat 402", billType: "electricity" },
      { id: "b3", name: "Rent", billType: "rent" },
    ];
    expect(matchBill("rent", bills).map((bill) => bill.id)).toEqual(["b3"]);
    expect(matchBill("electricity", bills).map((bill) => bill.id)).toEqual(["b1"]);
    expect(matchBill("light", bills).map((bill) => bill.id)).toEqual(["b1", "b2"]);
    expect(matchBill("gym", bills)).toEqual([]);
  });

  it("puts a due day on the next date it falls on", () => {
    expect(nextOnDay("2026-10-20", 5)).toBe("2026-11-05");
    expect(nextOnDay("2026-10-20", 25)).toBe("2026-10-25");
    expect(nextOnDay("2026-10-20", 20)).toBe("2026-10-20");
    expect(nextOnDay("2027-01-31", 31)).toBe("2027-01-31");
    expect(nextOnDay("2027-02-01", 31)).toBe("2027-02-28");
  });
});
