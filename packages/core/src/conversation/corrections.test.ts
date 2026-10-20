import { describe, expect, it } from "vitest";

import { applyCorrection, describeCorrection, readCorrection, type CorrectableAction } from "./corrections";

// Wednesday 23 September 2026, 10:00 in Kolkata.
const NOW = new Date("2026-09-23T04:30:00Z");
const context = { actorMemberId: "m-priya", channel: "text" as const, utterance: "", timezone: "Asia/Kolkata", now: NOW };

const pending = (over: Partial<CorrectableAction>): CorrectableAction => ({
  actionId: "a-1",
  actionType: "add_to_list",
  outcomeKey: "groceries",
  parameters: { item: "milk" },
  status: "proposed",
  result: null,
  ...over,
});

describe("reading a correction (Wave 4 §9)", () => {
  it("reads the three shapes the spec names", () => {
    expect(readCorrection("Not milk, almond milk.")).toEqual({ kind: "replace", from: "milk", to: "almond milk" });
    expect(readCorrection("No, I meant Manan")).toEqual({ kind: "value", to: "Manan" });
    expect(readCorrection("Actually, make that Friday")).toEqual({ kind: "value", to: "Friday" });
  });

  it("reads the everyday variants", () => {
    expect(readCorrection("not the milk but the almond milk")).toEqual({ kind: "replace", from: "milk", to: "almond milk" });
    expect(readCorrection("change it to next Monday")).toEqual({ kind: "value", to: "next Monday" });
    expect(readCorrection("actually it's Friday")).toEqual({ kind: "value", to: "Friday" });
  });

  it("an ordinary request is not a correction", () => {
    expect(readCorrection("add milk")).toBeNull();
    expect(readCorrection("Sunita is away tomorrow")).toBeNull();
    // Too long to be a quick "actually, X".
    expect(readCorrection("actually I think we should plan something nice for the weekend")).toBeNull();
  });
});

describe("applying a correction to the request it corrects", () => {
  it("\"not milk, almond milk\" swaps that one item and nothing else", () => {
    const corrected = applyCorrection({ kind: "replace", from: "milk", to: "almond milk" }, pending({ parameters: { items: ["milk", "bananas"] } }), context);
    expect(corrected?.parameters.items).toEqual(["almond milk", "bananas"]);
    expect(corrected?.action).toBe("add_to_list");
  });

  it("\"make that Friday\" changes the day, and the day is grounded afresh", () => {
    const corrected = applyCorrection(
      { kind: "value", to: "Friday" },
      pending({ actionType: "record_absence", outcomeKey: null, parameters: { when: "tomorrow", memberId: "m-sunita", memberName: "Sunita", whenResolved: { date: "2026-09-24" } } }),
      context,
    );
    expect(corrected?.parameters).toMatchObject({ when: "Friday", memberId: "m-sunita" });
    expect(corrected?.parameters.whenResolved).toBeUndefined();
  });

  it("\"I meant Manan\" changes the person, and drops the one it replaced", () => {
    const corrected = applyCorrection(
      { kind: "value", to: "Manan" },
      pending({ actionType: "record_absence", outcomeKey: null, parameters: { when: "tomorrow", memberId: "m-asmi", memberName: "Asmi" } }),
      context,
    );
    expect(corrected?.target).toEqual({ kind: "member", reference: "manan" });
    expect(corrected?.parameters.memberId).toBeUndefined();
    expect(corrected?.parameters.when).toBe("tomorrow");
  });

  it("a correction of something already done carries what it replaces, for the executor to undo", () => {
    const corrected = applyCorrection({ kind: "replace", from: "milk", to: "almond milk" }, pending({ status: "executed", result: { consumableId: "c-1", name: "Milk" } }), context);
    expect(corrected?.parameters.corrects).toEqual({ actionId: "a-1", actionType: "add_to_list", result: { consumableId: "c-1", name: "Milk" } });
  });

  it("a reminder's day is corrected like any other", () => {
    const corrected = applyCorrection({ kind: "value", to: "Friday" }, pending({ actionType: "set_reminder", outcomeKey: "reminders", parameters: { what: "buy milk", when: "tomorrow" } }), context);
    expect(corrected).toMatchObject({ action: "set_reminder", parameters: { what: "buy milk", when: "Friday" } });
  });

  it("a correction that does not fit the request is not forced onto it", () => {
    expect(applyCorrection({ kind: "replace", from: "milk", to: "almond milk" }, pending({ actionType: "record_absence", parameters: { when: "tomorrow" } }), context)).toBeNull();
    expect(applyCorrection({ kind: "replace", from: "eggs", to: "bread" }, pending({}), context)).toBeNull();
    // A day is never an item: "make that Friday" after "add milk" is not about the milk.
    expect(applyCorrection({ kind: "value", to: "Friday" }, pending({}), context)).toBeNull();
  });

  it("the reply says what changed, in the household's words", () => {
    const subject = pending({ actionType: "record_absence", outcomeKey: null, parameters: { when: "tomorrow", memberName: "Asmi" } });
    const corrected = applyCorrection({ kind: "value", to: "Manan" }, subject, context)!;
    expect(describeCorrection(subject, corrected)).toBe("Asmi → Manan");
    const list = pending({});
    expect(describeCorrection(list, applyCorrection({ kind: "replace", from: "milk", to: "almond milk" }, list, context)!)).toBe("milk → almond milk");
  });
});

describe("\"make that 2 litres\" corrects an amount (story 25-005)", () => {
  it("is read as a correction whose value is an amount", () => {
    expect(readCorrection("make that 2 litres")).toEqual({ kind: "value", to: "2 litres" });
    expect(readCorrection("Actually, make it 500 grams.")).toEqual({ kind: "value", to: "500 grams" });
  });

  it("keeps the item and changes how much, on a proposal or on what was done", () => {
    const waiting = applyCorrection({ kind: "value", to: "2 litres" }, pending({ parameters: { item: "milk" } }), context);
    expect(waiting).toMatchObject({ action: "add_to_list", parameters: { item: "2 litres milk" } });
    const done = applyCorrection(
      { kind: "value", to: "500 grams" },
      pending({ status: "executed", parameters: { item: "1 kg rice" }, result: { items: [{ name: "Rice", consumableId: "c-rice" }] } }),
      context,
    );
    expect(done).toMatchObject({ parameters: { item: "500 grams rice", corrects: { actionId: "a-1" } } });
  });

  it("works for what is at home and a purchase, and never turns the amount into an item name", () => {
    expect(applyCorrection({ kind: "value", to: "10" }, pending({ actionType: "set_stock", outcomeKey: "stock", parameters: { item: "6 eggs" } }), context)).toMatchObject({ parameters: { item: "10 eggs" } });
    expect(applyCorrection({ kind: "value", to: "3 packs" }, pending({ actionType: "mark_bought", parameters: { item: "2 packs bread" } }), context)).toMatchObject({ parameters: { item: "3 packs bread" } });
  });

  it("leaves a request with several items, or no amount to change, alone", () => {
    expect(applyCorrection({ kind: "value", to: "2 litres" }, pending({ parameters: { items: ["milk", "bananas"] } }), context)).toBeNull();
    expect(applyCorrection({ kind: "value", to: "2 litres" }, pending({ actionType: "record_absence", parameters: { when: "tomorrow" } }), context)).toBeNull();
  });

  it("the reply says what changed", () => {
    const subject = pending({ parameters: { item: "milk" } });
    expect(describeCorrection(subject, applyCorrection({ kind: "value", to: "2 litres" }, subject, context)!)).toBe("milk → 2 litres milk");
  });
});
