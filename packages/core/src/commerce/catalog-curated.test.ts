import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CURATED_HEADER, CURATED_UNITS, curatedRows, parseCsv, searchWords } from "./catalog-curated";
import { UNIT_CHOICES } from "./units";

const HEADER = CURATED_HEADER.join(",");

describe("curated catalog items", () => {
  it("keeps the units the units module offers", () => {
    expect([...CURATED_UNITS].sort()).toEqual([...UNIT_CHOICES].sort());
  });

  it("parses quoted fields, doubled quotes and commas inside quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\nd,e,f\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["d", "e", "f"],
    ]);
  });

  it("turns a row into a catalog item searchable by every name", () => {
    const { rows, problems } = curatedRows(`${HEADER}\ntoor-dal,Toor dal,Dals & pulses,Split dals,true,kg,1,kg,arhar dal|tuvar dal|अरहर दाल|Toor dal\n`);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({ source: "wonderhome", source_id: "toor-dal", kind: "item", name: "Toor dal", unit: "kg", pack_quantity: 1, pack_unit: "kg", is_food: true });
    // The name itself is not repeated as another name.
    expect(row!.aliases).toEqual(["arhar dal", "tuvar dal", "अरहर दाल"]);
    expect(row!.search_text.startsWith("toor dal")).toBe(true);
    expect(row!.search_text).toContain("अरहर दाल");
  });

  it("refuses duplicates, unknown units and half a pack", () => {
    const { rows, problems } = curatedRows(
      [
        HEADER,
        "onion,Onion,Vegetables,,true,kg,1,kg,pyaz",
        "onion,Onion red,Vegetables,,true,kg,1,kg,",
        "onion-2,ONION,Vegetables,,true,kg,1,kg,",
        "salt,Salt,Spices & masalas,,true,sack,1,kg,",
        "sugar,Sugar,Sugar & sweeteners,,true,kg,1,,",
        "Bad Slug,Thing,Other,,true,kg,,,",
      ].join("\n"),
    );
    expect(rows.map((row) => row.source_id)).toEqual(["onion"]);
    expect(problems.map((problem) => problem.problem)).toEqual([
      "onion: duplicate slug",
      'onion-2: duplicate name "ONION"',
      'salt: unknown unit "sack"',
      "sugar: pack_quantity and pack_unit go together",
      "Bad Slug: slug must be lowercase words joined by hyphens",
    ]);
  });

  it("refuses a file with the wrong header", () => {
    expect(curatedRows("slug,name\nonion,Onion\n").problems).toHaveLength(1);
  });

  it("keeps Devanagari vowel signs in search words", () => {
    expect(searchWords("अरहर दाल")).toBe("अरहर दाल");
    expect(searchWords("Bhindi (Lady-finger)")).toBe("bhindi lady finger");
  });

  it("the shipped file loads with no problems", () => {
    const csv = readFileSync(join(__dirname, "../../../../supabase/seed/grocery-catalog/items.csv"), "utf8");
    const { rows, problems } = curatedRows(csv);
    expect(problems).toEqual([]);
    expect(rows.length).toBeGreaterThan(1000);
    // Cleaning and personal care never carry food nutrition.
    expect(rows.filter((row) => row.category === "Cleaning").every((row) => !row.is_food)).toBe(true);
  });
});
