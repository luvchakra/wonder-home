import { describe, expect, it } from "vitest";

import { extractGenericItems } from "./page-extract";
import type { ScrapeTarget } from "./fetch-connection";

const target: ScrapeTarget = { url: "https://app.looplearning.com/task/list", kind: "homework", childMemberId: "child-1" };
const NOW = new Date("2026-10-27T18:00:00Z");

describe("extractGenericItems", () => {
  it("files a readable page as one item, dated to the fetch day", () => {
    const text = "This week's homework\n\nMaths: worksheet 3, due Friday.\nScience: read chapter 4.";
    const items = extractGenericItems(text, target, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "This week's homework",
      kind: "homework",
      childMemberId: "child-1",
      dueOn: "2026-10-27",
      sourceUrl: target.url,
    });
    expect(items[0]!.detail).toContain("Maths: worksheet 3");
  });

  it("files nothing for a blank or too-short page", () => {
    expect(extractGenericItems("", target, NOW)).toEqual([]);
    expect(extractGenericItems("   \n  \n ", target, NOW)).toEqual([]);
    expect(extractGenericItems("Loading…", target, NOW)).toEqual([]);
  });

  it("falls back to a kind label when there is no usable first line", () => {
    // Only 2-char lines, but enough total content to be worth filing.
    const items = extractGenericItems(Array(30).fill("ok").join("\n"), target, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("homework update");
  });
});
