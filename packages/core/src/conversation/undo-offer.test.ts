import { describe, expect, it } from "vitest";

import { UNDOABLE } from "./undo-offer";

describe("which HomeTalk replies offer Undo", () => {
  it("offers it for every record HomeTalk makes straight away, a bill included (NSR-22)", () => {
    for (const action of ["add_to_list", "set_reminder", "record_absence", "plan_event", "plan_meal", "add_bill"] as const) expect(UNDOABLE.has(action)).toBe(true);
  });

  it("never offers it for a payment, which waits for a tap and is never recorded by a sentence", () => {
    expect(UNDOABLE.has("make_payment")).toBe(false);
  });
});
