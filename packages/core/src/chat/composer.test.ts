import { describe, expect, it } from "vitest";

import { activeTrigger, normaliseTag, piecesOf, replaceTrigger, tagsIn, trendingTags } from "./composer";

describe("activeTrigger", () => {
  it("finds a /, @ or # that starts a word, and what was typed after it", () => {
    expect(activeTrigger("Pay /ele", 8)).toEqual({ char: "/", query: "ele", start: 4, end: 8 });
    expect(activeTrigger("@", 1)).toEqual({ char: "@", query: "", start: 0, end: 1 });
    expect(activeTrigger("hi @Upasana Ch", 14)).toEqual({ char: "@", query: "Upasana Ch", start: 3, end: 14 });
    expect(activeTrigger("so #diw", 7)).toEqual({ char: "#", query: "diw", start: 3, end: 7 });
  });

  it("ignores a symbol inside a word, a finished tag or path, and another line", () => {
    expect(activeTrigger("email@home", 10)).toBeNull();
    expect(activeTrigger("1/2 cup", 3)).toBeNull();
    expect(activeTrigger("#diwali is", 10)).toBeNull();
    expect(activeTrigger("/bills now", 10)).toBeNull();
    expect(activeTrigger("@Asmi\nok", 8)).toBeNull();
  });
});

describe("replaceTrigger", () => {
  it("puts the pick where the trigger was, with one space after it", () => {
    const text = "Ask @Asm about it";
    const trigger = activeTrigger(text, 8)!;
    expect(replaceTrigger(text, trigger, "@Asmi")).toEqual({ text: "Ask @Asmi about it", caret: 10 });
    const slash = "Pay /ele";
    expect(replaceTrigger(slash, activeTrigger(slash, 8)!, "")).toEqual({ text: "Pay ", caret: 4 });
  });
});

describe("tags", () => {
  it("reads each tag once, in lower case, in any script, never a number or a fragment of a word", () => {
    expect(tagsIn("Prep for #Diwali and #diwali, #गृहप्रवेश!")).toEqual(["diwali", "गृहप्रवेश"]);
    expect(tagsIn("Room #2 and C# and a&#39; done")).toEqual([]);
    expect(normaliseTag("#Spring-Clean")).toBe("springclean");
    expect(normaliseTag("#!!")).toBeNull();
  });

  it("trends by how many messages use a tag, newest first among equals, with the chat it was last used in", () => {
    const trending = trendingTags([
      { threadId: "t1", body: "#diwali lights", createdAt: "2026-10-20T10:00:00Z" },
      { threadId: "t2", body: "#diwali sweets #diwali", createdAt: "2026-10-21T09:00:00Z" },
      { threadId: "t1", body: "#picnic sunday", createdAt: "2026-10-21T08:00:00Z" },
      { threadId: "t1", body: "#exam week", createdAt: "2026-10-19T08:00:00Z" },
    ]);
    expect(trending.map((tag) => [tag.tag, tag.count])).toEqual([["diwali", 2], ["picnic", 1], ["exam", 1]]);
    expect(trending[0]!.threadId).toBe("t2");
  });
});

describe("piecesOf", () => {
  it("marks the household's own names and tags, the longest name first", () => {
    expect(piecesOf("@Upasana Chakraborty and @Rowdy, see #diwali", ["Upasana", "Upasana Chakraborty", "Rowdy"])).toEqual([
      { kind: "mention", text: "@Upasana Chakraborty" },
      { kind: "text", text: " and " },
      { kind: "mention", text: "@Rowdy" },
      { kind: "text", text: ", see " },
      { kind: "tag", text: "#diwali" },
    ]);
    expect(piecesOf("mail me@Asmi.com", ["Asmi"])).toEqual([{ kind: "text", text: "mail me" }, { kind: "mention", text: "@Asmi" }, { kind: "text", text: ".com" }]);
  });
});
