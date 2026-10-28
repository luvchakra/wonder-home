import { describe, expect, it } from "vitest";

import { cleanBody, linkForPage, linkForRecord, pageKeyFor } from "./links";

const ID = "8f14e45f-ceea-4e67-a5f4-37a7e4b2a2d1";

describe("chat links", () => {
  it("opens each kind of record where it lives", () => {
    expect(linkForRecord({ kind: "event", id: ID, label: "Anya's recital" })).toEqual({ kind: "event", path: `/calendar/events/${ID}`, label: "Anya's recital" });
    expect(linkForRecord({ kind: "grocery", id: ID, label: "Milk" })?.path).toBe(`/groceries/${ID}`);
    expect(linkForRecord({ kind: "bill", id: ID, label: "Electricity" })?.path).toBe("/bills");
    expect(linkForRecord({ kind: "meal", id: ID, label: "Kanda poha", onDate: "2026-10-22" })?.path).toBe("/meals?week=2026-10-22");
  });

  it("refuses a record id that is not an id, and an empty name", () => {
    expect(linkForRecord({ kind: "event", id: "../../evil", label: "x" })).toBeNull();
    expect(linkForRecord({ kind: "event", id: ID, label: "   " })).toBeNull();
  });

  it("names a screen by its key, and only the screens a message may point at", () => {
    expect(linkForPage("groceries")).toEqual({ kind: "page", path: "/groceries", label: "Groceries" });
    expect(linkForPage("settings")).toBeNull();
    expect(linkForPage("https://evil.example")).toBeNull();
    expect(pageKeyFor("/household/home")).toBe("upkeep");
    expect(pageKeyFor("/settings")).toBeNull();
  });

  it("keeps a message's words, trimmed, never empty and never too long", () => {
    expect(cleanBody("  Milk?\r\n\r\n\r\n\r\nYes  ")).toBe("Milk?\n\nYes");
    expect(cleanBody("   ")).toBeNull();
    expect(cleanBody("a".repeat(4001))).toBeNull();
    expect(cleanBody(42)).toBeNull();
  });
});
