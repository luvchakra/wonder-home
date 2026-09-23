import { describe, expect, it } from "vitest";

import type { Consumable } from "../commerce/consumables";
import type { Obligation } from "../finance/payments";
import type { SchoolItem } from "../school/items";
import { predictBillBunching, predictHeavySchoolWeeks, predictHousehold, predictStockOuts } from "./predictions";

const NOW = new Date("2026-09-24T09:00:00Z");

const consumable = (name: string, lastPurchasedOn: string, daysPerUnit: number, basis: Consumable["evidenceBasis"] = "purchase_history"): Consumable => ({
  id: name,
  name,
  category: "grocery",
  petId: null,
  unit: "pack",
  typicalQuantity: 1,
  daysPerUnit,
  evidenceBasis: basis,
  lastPurchasedOn,
  lastPurchasedQuantity: 1,
});

const bill = (name: string, dueOn: string, amountMinor: number | null, status: Obligation["status"] = "expected"): Obligation => ({
  id: name,
  name,
  kind: "utility",
  payee: null,
  amountMinor,
  currency: amountMinor === null ? null : "INR",
  dueOn,
  responsibleMemberId: null,
  status,
  requiresReview: false,
});

const school = (title: string, kind: SchoolItem["kind"], dueAt: string, status: SchoolItem["status"] = "pending"): SchoolItem =>
  ({
    id: title,
    childMemberId: "anya",
    kind,
    title,
    subject: null,
    detail: null,
    dueAt: new Date(dueAt),
    dueTimeKnown: false,
    endsAt: null,
    estimatedMinutes: null,
    estimateSource: null,
    status,
    completedAt: null,
    provider: null,
    externalId: null,
  }) as SchoolItem;

describe("looking ahead (story 14-008)", () => {
  it("offers one shop when three things run out within a week of each other", () => {
    const predictions = predictStockOuts(
      [
        consumable("Milk", "2026-09-20", 7), // runs out 27 Sep
        consumable("Rice", "2026-09-01", 30), // 1 Oct
        consumable("Soap", "2026-09-10", 21), // 1 Oct
        consumable("Salt", "2026-09-01", 90), // far off
      ],
      NOW,
    );
    expect(predictions).toHaveLength(1);
    expect(predictions[0]).toMatchObject({ kind: "opportunity", domain: "groceries", on: "2026-09-27", basis: "purchase_history", title: "One shop covers 3 things" });
    expect(predictions[0]?.reason).toContain("Milk, Rice and Soap");
    expect(predictions[0]?.reason).toContain("saves 2 extra trips");
  });

  it("stays quiet about one or two things running out — that is an ordinary week", () => {
    expect(predictStockOuts([consumable("Milk", "2026-09-20", 7), consumable("Rice", "2026-09-01", 30)], NOW)).toEqual([]);
  });

  it("says when a stock-out rests on what the household told it rather than its buying", () => {
    const [prediction] = predictStockOuts(
      [consumable("Milk", "2026-09-20", 7), consumable("Rice", "2026-09-01", 30, "member_stated"), consumable("Soap", "2026-09-10", 21)],
      NOW,
    );
    expect(prediction?.basis).toBe("stated");
  });

  it("names bills bunching into a few days, adding only amounts it actually has", () => {
    const [prediction] = predictBillBunching(
      [bill("Electricity", "2026-09-28", 245050), bill("Internet", "2026-09-30", 99900), bill("Water", "2026-10-01", null), bill("Rent", "2026-09-29", 3000000, "paid")],
      NOW,
    );
    expect(prediction).toMatchObject({ kind: "risk", domain: "bills", title: "3 bills fall due within 5 days", on: "2026-09-28" });
    expect(prediction?.reason).toContain("₹3,449.50");
    expect(prediction?.reason).toContain("plus 1 whose amount isn't in yet");
    expect(prediction?.reason).not.toContain("Rent");
  });

  it("does not call two bills a week apart a bunch", () => {
    expect(predictBillBunching([bill("Electricity", "2026-09-26", 100), bill("Internet", "2026-10-03", 100)], NOW)).toEqual([]);
  });

  it("names a child's exam in a week already full, and not an exam in a quiet week", () => {
    const busy = [
      school("Maths", "exam", "2026-10-01T00:00:00Z"),
      school("Essay", "homework", "2026-09-29T00:00:00Z"),
      school("Model", "project", "2026-09-30T00:00:00Z"),
      school("Sheet", "worksheet", "2026-10-02T00:00:00Z"),
      school("Old sheet", "worksheet", "2026-10-02T00:00:00Z", "done"),
    ];
    const [prediction] = predictHeavySchoolWeeks(busy, () => "Anya", NOW);
    expect(prediction).toMatchObject({ kind: "risk", domain: "school", title: "A full week for Anya", on: "2026-10-01" });
    expect(prediction?.reason).toContain("The Maths exam and 3 other things are due the week of Mon 28 Sept");
    expect(predictHeavySchoolWeeks(busy.slice(0, 3), () => "Anya", NOW)).toEqual([]);
  });

  it("puts everything soonest first, and says nothing past two weeks", () => {
    const all = predictHousehold({
      consumables: [consumable("Milk", "2026-09-20", 7), consumable("Rice", "2026-09-01", 30), consumable("Soap", "2026-09-10", 21)],
      obligations: [bill("Electricity", "2026-09-25", 100), bill("Internet", "2026-09-26", 100), bill("Far", "2026-11-01", 100), bill("Farther", "2026-11-02", 100)],
      schoolItems: [],
      childName: () => "Anya",
      now: NOW,
    });
    expect(all.map((prediction) => prediction.domain)).toEqual(["bills", "groceries"]);
  });
});
