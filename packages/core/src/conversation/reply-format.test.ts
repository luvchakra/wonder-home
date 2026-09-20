import { describe, expect, it } from "vitest";

import { APP_PLACES, isAllowedHref, linkTo, parseReply, plainText } from "./reply-format";

describe("the reply format", () => {
  it("reads paragraphs, a bullet list, bold and in-app links", () => {
    const blocks = parseReply("**2 things** need you:\n- Electricity bill — due Friday → [Bills](/bills)\n- Milk — running low → [Groceries](/groceries?tab=list)\n\nEverything else is handled.");
    expect(blocks).toEqual([
      { kind: "paragraph", inlines: [{ kind: "bold", text: "2 things" }, { kind: "text", text: " need you:" }] },
      {
        kind: "list",
        items: [
          [{ kind: "text", text: "Electricity bill — due Friday → " }, { kind: "link", label: "Bills", href: "/bills" }],
          [{ kind: "text", text: "Milk — running low → " }, { kind: "link", label: "Groceries", href: "/groceries?tab=list" }],
        ],
      },
      { kind: "paragraph", inlines: [{ kind: "text", text: "Everything else is handled." }] },
    ]);
  });

  it("turns a link to anywhere but a known screen into its label", () => {
    expect(parseReply("See [your bank](https://evil.example) or [this](/api/v1/households) now.")).toEqual([
      { kind: "paragraph", inlines: [{ kind: "text", text: "See " }, { kind: "text", text: "your bank" }, { kind: "text", text: " or " }, { kind: "text", text: "this" }, { kind: "text", text: " now." }] },
    ]);
    expect(isAllowedHref("/bills")).toBe(true);
    expect(isAllowedHref("/bills?tab=transactions")).toBe(true);
    expect(isAllowedHref("/billsx")).toBe(false);
    expect(isAllowedHref("//evil.example/bills")).toBe(false);
  });

  it("never renders markup as markup", () => {
    const blocks = parseReply("<b>hi</b> & <script>alert(1)</script>");
    expect(blocks).toEqual([{ kind: "paragraph", inlines: [{ kind: "text", text: "<b>hi</b> & <script>alert(1)</script>" }] }]);
  });

  it("joins wrapped lines of one paragraph and keeps numbered items as a list", () => {
    expect(parseReply("one\ntwo\n\n1. a\n2) b")).toEqual([
      { kind: "paragraph", inlines: [{ kind: "text", text: "one two" }] },
      { kind: "list", items: [[{ kind: "text", text: "a" }], [{ kind: "text", text: "b" }]] },
    ]);
  });

  it("writes a link only for a known place", () => {
    expect(linkTo("/bills")).toBe("[Bills](/bills)");
    expect(linkTo("/groceries?tab=list", "the list")).toBe("[the list](/groceries?tab=list)");
    expect(linkTo("/nowhere", "there")).toBe("there");
  });

  it("flattens to plain words for places that cannot render it", () => {
    expect(plainText("**Two** things:\n- a → [Bills](/bills)\n- b")).toBe("Two things:\n• a → Bills\n• b");
  });

  it("names every real screen once", () => {
    const hrefs = APP_PLACES.map((place) => place.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith("/")).toBe(true);
  });
});
