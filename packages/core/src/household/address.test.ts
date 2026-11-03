import { describe, expect, it } from "vitest";

import { cleanUnitLine, combineAddress, loadHouseholdAddress, saveHouseholdAddress, saveHouseholdUnitLine } from "./address";

const MAPS = "Lodha Splendora, Platino-F, Ghodbunder Rd, Thane West, Maharashtra 400615, India";

describe("combineAddress", () => {
  it("is the maps address alone when the unit line is empty", () => {
    expect(combineAddress(null, MAPS)).toBe(MAPS);
    expect(combineAddress("   ", MAPS)).toBe(MAPS);
  });
  it("puts the trimmed unit line first, with one comma", () => {
    expect(combineAddress("  Flat   1203,  Wing B ,", MAPS)).toBe(`Flat 1203, Wing B, ${MAPS}`);
  });
  it("bounds the line", () => {
    expect(cleanUnitLine("x".repeat(500))?.length).toBe(120);
  });
});

/** A one-row fake of the table, with or without the unit_line column. */
function fake(hasColumn: boolean) {
  let row: Record<string, unknown> | null = null;
  const missing = { code: "42703" };
  const table = {
    select: (cols: string) => ({ eq: () => ({ maybeSingle: async () => (cols.includes("unit_line") && !hasColumn ? { data: null, error: missing } : { data: row, error: null }) }) }),
    upsert: async (value: Record<string, unknown>) => {
      if (!hasColumn && "unit_line" in value) return { error: missing };
      row = { ...(row ?? {}), ...value };
      return { error: null };
    },
    update: (value: Record<string, unknown>) => ({ eq: async () => ((row = { ...row, ...value }), { error: null }) }),
  };
  return { from: () => table } as never;
}

describe("unit line storage", () => {
  const ids = { householdId: "h", memberId: "m" };
  it("round-trips beside the picked address and can change alone", async () => {
    const db = fake(true);
    await saveHouseholdAddress(db, { ...ids, address: { typed: MAPS }, unitLine: " Flat 1203, Wing B " });
    expect((await loadHouseholdAddress(db, "h"))?.unitLine).toBe("Flat 1203, Wing B");
    await saveHouseholdUnitLine(db, { ...ids, unitLine: "" });
    const after = await loadHouseholdAddress(db, "h");
    expect(after?.unitLine).toBeNull();
    expect(after?.formattedAddress).toBe(MAPS);
  });
  it("leaves the stored line alone when the save does not mention it", async () => {
    const db = fake(true);
    await saveHouseholdAddress(db, { ...ids, address: { typed: MAPS }, unitLine: "Flat 1" });
    await saveHouseholdAddress(db, { ...ids, address: { typed: "Other road" } });
    expect((await loadHouseholdAddress(db, "h"))?.unitLine).toBe("Flat 1");
  });
  it("works before the migration lands", async () => {
    const db = fake(false);
    await saveHouseholdAddress(db, { ...ids, address: { typed: MAPS }, unitLine: "Flat 1" });
    const loaded = await loadHouseholdAddress(db, "h");
    expect(loaded?.formattedAddress).toBe(MAPS);
    expect(loaded?.unitLine).toBeNull();
  });
});
