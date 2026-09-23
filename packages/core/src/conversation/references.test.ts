import { describe, expect, it } from "vitest";

import type { HomeSendItem } from "../homesend/items";
import { anaphorOf, chooseCandidate, focusFromProposal, focusFromResult, homeSendFocus, NO_REFERENCES, readFocus, resolveAnaphor, whichOf, type FocusEntity } from "./references";

const NOW = new Date("2026-09-23T10:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const thing = (label: string, source: FocusEntity["source"], at: string, origin: string | null = null): FocusEntity => ({ entityType: "thing", entityId: null, label, source, at, origin });

describe("what counts as a reference", () => {
  it("reads pronouns as references and names as names", () => {
    expect(anaphorOf("that")).toBe("singular");
    expect(anaphorOf("it")).toBe("singular");
    expect(anaphorOf("the same one")).toBe("singular");
    expect(anaphorOf("them")).toBe("plural");
    expect(anaphorOf("those")).toBe("plural");
    expect(anaphorOf("milk")).toBeNull();
    expect(anaphorOf("that milk")).toBeNull();
  });
});

describe("resolving a reference, in the spec's priority order (Wave 4 §8)", () => {
  it("the question just asked comes first, and a pronoun cannot choose between two of its candidates", () => {
    const one = resolveAnaphor("singular", { ...NO_REFERENCES, clarification: [thing("printer paper", "clarification", minutesAgo(1))], conversation: [thing("milk", "action_result", minutesAgo(1))] }, { kinds: ["thing"], now: NOW });
    expect(one).toMatchObject({ kind: "resolved", via: "clarification", entities: [{ label: "printer paper" }] });

    const two = resolveAnaphor("singular", { ...NO_REFERENCES, clarification: [thing("printer paper", "clarification", minutesAgo(1)), thing("white T-shirt", "clarification", minutesAgo(1))] }, { kinds: ["thing"], now: NOW });
    expect(two.kind).toBe("ambiguous");
  });

  it("then the proposal waiting for a yes, over anything older", () => {
    const resolved = resolveAnaphor(
      "singular",
      { ...NO_REFERENCES, proposal: [thing("almond milk", "proposal", minutesAgo(5))], conversation: [thing("bananas", "mention", minutesAgo(1))] },
      { kinds: ["thing"], now: NOW },
    );
    expect(resolved).toMatchObject({ kind: "resolved", via: "proposal", entities: [{ label: "almond milk" }] });
  });

  it("then recent conversation and recent HomeSend by recency — one thing in play resolves", () => {
    const state = { ...NO_REFERENCES, conversation: [thing("printer paper", "mention", minutesAgo(180))], homesend: [thing("white T-shirt", "homesend", minutesAgo(2), "the school notice")] };
    expect(resolveAnaphor("singular", state, { kinds: ["thing"], now: NOW })).toMatchObject({ kind: "resolved", via: "homesend", entities: [{ label: "white T-shirt" }] });
  });

  it("two different things in play at once is a question, not a coin toss", () => {
    const state = { ...NO_REFERENCES, conversation: [thing("printer paper", "mention", minutesAgo(5))], homesend: [thing("white T-shirt", "homesend", minutesAgo(3), "the school notice")] };
    const resolved = resolveAnaphor("singular", state, { kinds: ["thing"], now: NOW });
    expect(resolved.kind).toBe("ambiguous");
    expect(resolved.kind === "ambiguous" && resolved.question).toBe("Do you mean the white T-shirt from the school notice or the printer paper?");
  });

  it("an added list item keeps where it came from, and reads as an ordinary noun in the question", () => {
    const state = {
      ...NO_REFERENCES,
      conversation: [
        { entityType: "consumable", entityId: "c-2", label: "Printer paper", source: "action_result" as const, at: minutesAgo(1) },
        { entityType: "consumable", entityId: "c-1", label: "White T-shirt", source: "action_result" as const, at: minutesAgo(2) },
      ],
      homesend: [thing("white T-shirt", "homesend", minutesAgo(3), "the school notice")],
    };
    const resolved = resolveAnaphor("singular", state, { kinds: ["thing", "consumable"], now: NOW });
    expect(resolved.kind === "ambiguous" && resolved.question).toBe("Do you mean the printer paper or the white T-shirt from the school notice?");
  });

  it("HomeSend older than a day is no longer what \"that\" means", () => {
    const state = { ...NO_REFERENCES, homesend: [thing("white T-shirt", "homesend", minutesAgo(26 * 60), "the school notice")] };
    expect(resolveAnaphor("singular", state, { kinds: ["thing"], now: NOW }).kind).toBe("none");
  });

  it("\"them\" is the group that came in together, not everything ever mentioned", () => {
    const at = minutesAgo(1);
    const state = { ...NO_REFERENCES, conversation: [thing("milk", "action_result", at), thing("bananas", "action_result", at), thing("printer paper", "mention", minutesAgo(90))] };
    const resolved = resolveAnaphor("plural", state, { kinds: ["thing"], now: NOW });
    expect(resolved.kind === "resolved" && resolved.entities.map((entity) => entity.label).sort()).toEqual(["bananas", "milk"]);
  });

  it("only things of the kinds asked for are candidates — \"put that on the list\" never means a person", () => {
    const state = { ...NO_REFERENCES, conversation: [{ entityType: "member", entityId: "m-1", label: "Asmi", source: "mention" as const, at: minutesAgo(1) }] };
    expect(resolveAnaphor("singular", state, { kinds: ["thing", "consumable"], now: NOW }).kind).toBe("none");
  });
});

describe("answering a which-one question", () => {
  const candidates = [thing("white T-shirt", "clarification", minutesAgo(1), "the school notice"), thing("printer paper", "clarification", minutesAgo(1))];

  it("by name, by part of the name, or by position", () => {
    expect(chooseCandidate("the T-shirt", candidates)?.label).toBe("white T-shirt");
    expect(chooseCandidate("printer paper", candidates)?.label).toBe("printer paper");
    expect(chooseCandidate("the second one", candidates)?.label).toBe("printer paper");
    expect(chooseCandidate("bananas", candidates)).toBeNull();
  });

  it("phrases the question in the household's words", () => {
    expect(whichOf(candidates)).toBe("Do you mean the white T-shirt from the school notice or the printer paper?");
  });
});

describe("where focus comes from", () => {
  it("an executed write focuses on the row it actually wrote", () => {
    expect(focusFromResult("add_to_list", { consumableId: "c-1", name: "milk" }, minutesAgo(0))).toEqual([
      expect.objectContaining({ entityType: "consumable", entityId: "c-1", label: "milk", source: "action_result" }),
    ]);
    expect(focusFromResult("add_to_list", {}, minutesAgo(0))).toEqual([]);
    expect(focusFromResult("record_absence", { memberId: "m-1", memberName: "Sunita", onDate: "2026-09-24" }, minutesAgo(0))[0]).toMatchObject({ entityType: "member", label: "Sunita" });
  });

  it("a proposal focuses on what it is about", () => {
    expect(focusFromProposal({ actionType: "order_items", parameters: { items: ["milk", "eggs"] }, at: minutesAgo(0) }).map((entity) => entity.label)).toEqual(["milk", "eggs"]);
    expect(focusFromProposal({ actionType: "make_payment", parameters: { billLabel: "Electricity" }, at: minutesAgo(0) })[0]).toMatchObject({ entityType: "bill", label: "Electricity" });
  });

  it("recent HomeSend yields the things a notice asked for, and skips what was set aside", () => {
    const item = (overrides: Partial<HomeSendItem>): HomeSendItem =>
      ({
        id: "h-1",
        householdId: "hh",
        createdByMemberId: "m-1",
        source: "pasted_text",
        status: "classified",
        classifiedKind: "school_item",
        extracted: { title: "Sports Day" },
        createdAt: minutesAgo(3),
        understanding: {
          entities: [{ type: "item", extractedValue: "a white T-shirt", confidence: 0.9, sourceEvidence: [] }],
          candidateActions: [],
        },
        ...overrides,
      }) as unknown as HomeSendItem;
    const focus = homeSendFocus([item({})]);
    expect(focus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "thing", label: "white T-shirt", origin: "the school notice", source: "homesend" }),
        expect.objectContaining({ entityType: "school_item", label: "Sports Day" }),
      ]),
    );
    expect(homeSendFocus([item({ status: "dismissed" })])).toEqual([]);
  });

  it("reads persisted focus back defensively", () => {
    expect(readFocus([{ entityType: "thing", label: "milk", at: minutesAgo(1), source: "mention" }, { nonsense: true }, "x"])).toHaveLength(1);
    expect(readFocus(null)).toEqual([]);
  });
});
