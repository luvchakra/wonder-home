import { describe, expect, it } from "vitest";

import { NO_DIRECT_ADD } from "./auto-add";
import { addAnywayCounts, addAnywayVerdict, failedTitleKey, groupIdentical, sameKey, sentenceCase } from "./inbox-view";

const item = (id: string, title: string | null, kind: string | null = "unknown") => ({
  id,
  classifiedKind: kind as never,
  extracted: title ? ({ title } as never) : null,
  understanding: null,
  subject: null,
  sourceUrl: null,
  rawText: null,
});

describe("groupIdentical", () => {
  it("folds identical waiting items into one row, keeping arrival order", () => {
    const rows = groupIdentical([
      item("a", "Swag Labs product listing"),
      item("b", "School trip form", "school_item"),
      item("c", "Swag Labs  product listing"),
      item("d", "swag labs product listing"),
      item("e", "Swag Labs product listing"),
      item("f", "Swag Labs product listing"),
    ]);
    expect(rows.map((row) => [row.first.id, row.items.length])).toEqual([
      ["a", 5],
      ["b", 1],
    ]);
  });

  it("never folds two of a different kind, or two with no name", () => {
    const rows = groupIdentical([item("a", "Milk", "grocery_item"), item("b", "Milk", "bill"), item("c", null), item("d", null)]);
    expect(rows).toHaveLength(4);
    expect(sameKey(item("c", null))).toBeNull();
  });
});

describe("failedTitleKey", () => {
  const scraped = "Open Menu Date: 2026-11-03 Open Menu Swag Labs Products Name (A to Z) Sauce Labs Backpack carry.allTheThings() with the sleek, streamlined Sly Pack that melds uncompromising style with unequaled laptop and tablet protection. $29.99 Add to cart";
  it("names a pasted web page without printing its text", () => {
    const key = failedTitleKey({ source: "pasted_text", contentType: "text/plain", rawText: scraped, sourceUrl: null });
    expect(key).toBe("webPage");
  });
  it("a short pasted message stays a message", () => {
    expect(failedTitleKey({ source: "pasted_text", contentType: null, rawText: "PTM on Friday at 10", sourceUrl: null })).toBe("message");
  });
  it("names files by what they are", () => {
    expect(failedTitleKey({ source: "manual_upload", contentType: "image/jpeg", rawText: null, sourceUrl: null })).toBe("photo");
    expect(failedTitleKey({ source: "manual_upload", contentType: "application/pdf", rawText: null, sourceUrl: null })).toBe("pdf");
    expect(failedTitleKey({ source: "audio_note", contentType: "audio/webm", rawText: null, sourceUrl: null })).toBe("voiceNote");
    expect(failedTitleKey({ source: "link", contentType: null, rawText: null, sourceUrl: "https://example.org" })).toBe("link");
    expect(failedTitleKey({ source: "email", contentType: null, rawText: "hi", sourceUrl: null })).toBe("email");
    expect(failedTitleKey({ source: "whatsapp_media", contentType: "video/mp4", rawText: null, sourceUrl: null })).toBe("whatsapp");
    expect(failedTitleKey({ source: "manual_upload", contentType: "text/csv", rawText: null, sourceUrl: null })).toBe("file");
  });
});

describe("Add all anyway", () => {
  it("keeps money and health waiting while their switch is off, and outside emails always", () => {
    expect(addAnywayVerdict({ source: "pasted_text", classifiedKind: "bill" }, NO_DIRECT_ADD)).toEqual({ add: false, because: "money_switch_off" });
    expect(addAnywayVerdict({ source: "pasted_text", classifiedKind: "receipt" }, NO_DIRECT_ADD)).toEqual({ add: false, because: "money_switch_off" });
    expect(addAnywayVerdict({ source: "manual_upload", classifiedKind: "health_document" }, NO_DIRECT_ADD)).toEqual({ add: false, because: "health_switch_off" });
    expect(addAnywayVerdict({ source: "email", classifiedKind: "school_item" }, { money: true, health: true })).toEqual({ add: false, because: "outside_sender" });
    expect(addAnywayVerdict({ source: "pasted_text", classifiedKind: "bill" }, { money: true, health: false })).toEqual({ add: true });
    expect(addAnywayVerdict({ source: "whatsapp", classifiedKind: "grocery_item" }, NO_DIRECT_ADD)).toEqual({ add: true });
    expect(addAnywayVerdict({ source: "whatsapp", classifiedKind: "unknown" }, NO_DIRECT_ADD)).toEqual({ add: false, because: "unclear" });
    expect(addAnywayVerdict({ source: "pasted_text", classifiedKind: null }, NO_DIRECT_ADD)).toEqual({ add: false, because: "unclear" });
  });

  it("counts what the confirm says", () => {
    const counts = addAnywayCounts(
      [
        { source: "pasted_text", classifiedKind: "bill" },
        { source: "pasted_text", classifiedKind: "bill" },
        { source: "manual_upload", classifiedKind: "receipt" },
        { source: "manual_upload", classifiedKind: "health_document" },
        { source: "email", classifiedKind: "school_item" },
        { source: "pasted_text", classifiedKind: "grocery_item" },
        { source: "pasted_text", classifiedKind: "unknown" },
      ],
      NO_DIRECT_ADD,
    );
    expect(counts).toEqual({ add: 1, bills: 3, health: 1, outside: 1, unclear: 1 });
  });
});

describe("sentenceCase", () => {
  it("capitalises the first letter only", () => {
    expect(sentenceCase("not sure what it is")).toBe("Not sure what it is");
    expect(sentenceCase("")).toBe("");
  });
});
