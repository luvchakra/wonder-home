import { describe, expect, it } from "vitest";

import type { GroceryItem } from "./inventory";
import { daysBetween, useSoon } from "./use-soon";

const TODAY = "2026-10-20";
const TZ = "Asia/Kolkata";

function item(name: string, over: { quantity?: number | null; useBy?: string | null; basis?: "printed" | "entered" | "estimated" | null; source?: string; confirmedAt?: string; lowLevel?: number | null } = {}): GroceryItem {
  const quantity = over.quantity === undefined ? 500 : over.quantity;
  return {
    id: name,
    name,
    unit: "g",
    lowLevel: over.lowLevel === undefined ? null : over.lowLevel,
    stock:
      quantity === null
        ? null
        : { quantity, unit: "g", confirmedAt: over.confirmedAt ?? "2026-10-19T06:00:00Z", confirmedBy: null, source: over.source ?? "stated", version: 1, useBy: over.useBy ?? null, useByBasis: over.basis ?? (over.useBy ? "entered" : null) },
  } as unknown as GroceryItem;
}

describe("Use first (story 25-003c)", () => {
  it("lists a date someone knows, soonest first, with its basis", () => {
    const { useFirst } = useSoon([item("Paneer", { useBy: "2026-10-25", basis: "printed" }), item("Curd", { useBy: "2026-10-22", basis: "entered" })], TODAY, TZ);
    expect(useFirst.map((entry) => [entry.item.name, entry.basis, entry.days, entry.state])).toEqual([
      ["Curd", "entered", 2, "soon"],
      ["Paneer", "printed", 5, "later"],
    ]);
  });

  it("never lists an estimated date, and counts how many it left out", () => {
    const result = useSoon([item("Bread", { useBy: "2026-10-21", basis: "estimated" })], TODAY, TZ);
    expect(result.useFirst).toEqual([]);
    expect(result.estimatedHidden).toBe(1);
  });

  it("says a date has passed or is today, never that it is fine", () => {
    const { useFirst } = useSoon([item("Milk", { useBy: "2026-10-18" }), item("Eggs", { useBy: "2026-10-20" })], TODAY, TZ);
    expect(useFirst.map((entry) => [entry.item.name, entry.state, entry.days])).toEqual([
      ["Milk", "passed", -2],
      ["Eggs", "today", 0],
    ]);
  });

  it("leaves out an item with none left, or no date", () => {
    expect(useSoon([item("Gone", { quantity: 0, useBy: "2026-10-21" }), item("Plain"), item("Uncounted", { quantity: null })], TODAY, TZ).useFirst).toEqual([]);
  });
});

describe("Running low (story 25-003c)", () => {
  it("lists what is at or below its level, and says how the amount is known", () => {
    const { running } = useSoon(
      [item("Rice", { quantity: 300, lowLevel: 500, source: "stated" }), item("Atta", { quantity: 200, lowLevel: 500, source: "purchase" }), item("Salt", { quantity: 900, lowLevel: 500 })],
      TODAY,
      TZ,
    );
    expect(running.map((entry) => [entry.item.name, entry.knowledge])).toEqual([
      ["Atta", "worked_out"],
      ["Rice", "counted"],
    ].sort((a, b) => 0) as never);
    expect(running.find((entry) => entry.item.name === "Salt")).toBeUndefined();
  });

  it("calls a count a month old or more old, and puts the least known first", () => {
    const { running } = useSoon(
      [item("Sugar", { quantity: 100, lowLevel: 500, confirmedAt: "2026-10-18T06:00:00Z" }), item("Oil", { quantity: 100, lowLevel: 500, confirmedAt: "2026-08-01T06:00:00Z" })],
      TODAY,
      TZ,
    );
    expect(running.map((entry) => [entry.item.name, entry.old])).toEqual([
      ["Oil", true],
      ["Sugar", false],
    ]);
  });

  it("puts what is all gone before what is low, and never lists what nobody has counted", () => {
    const { running } = useSoon([item("Tea", { quantity: 50, lowLevel: 100 }), item("Coffee", { quantity: 0, lowLevel: 100 }), item("Uncounted", { quantity: null, lowLevel: 100 })], TODAY, TZ);
    expect(running.map((entry) => [entry.item.name, entry.status])).toEqual([
      ["Coffee", "none"],
      ["Tea", "low"],
    ]);
  });

  it("reads the day it was confirmed on the household's clock, not the server's", () => {
    // 20:00 UTC on the 19th is 01:30 on the 20th in Kolkata.
    const { running } = useSoon([item("Ghee", { quantity: 10, lowLevel: 100, confirmedAt: "2026-10-19T20:00:00Z" })], TODAY, TZ);
    expect(running[0]!.asOf).toBe("2026-10-20");
  });
});

describe("daysBetween", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-10-20", "2026-10-23")).toBe(3);
    expect(daysBetween("2026-10-20", "2026-10-18")).toBe(-2);
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
  });
});
