import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { GroceryItem } from "../commerce/inventory";
import { readAcrossUnits } from "../commerce/pack-amount";
import { answerClarification } from "./clarify";
import { converse, type TurnInput } from "./engine";
import { canExecute, executeIntent, failedReply } from "./executor";
import { groundIntent } from "./grounding";
import type { HouseholdIntent } from "./intent";
import { NO_REFERENCES } from "./references";

/**
 * "Add 1 litre coconut oil" for coconut oil kept in bottles (25-038; the
 * owner on WhatsApp, 2026-10-26: "Coconut oil is kept in bottle, so 1 l does
 * not fit it" — "what is this???"). Each expected result is written first:
 *
 *  - 1 L for an item kept in 1 L bottles → +1 bottle, said in both units;
 *  - 1 L for bottles of unknown size → one question, with choices;
 *  - "Count it in litres instead" → the unit is changed, then 1 L added;
 *  - 500 ml for 1 L bottles → asks, never rounds silently;
 *  - "2 bottles" → added straight;
 *  - no reply ever says "does not fit", a unit code, or "I tried".
 */

const inventory = vi.hoisted(() => ({
  items: [] as GroceryItem[],
  adjust: vi.fn(),
  change: vi.fn(),
  refuse: null as ApiError | null,
}));

vi.mock("../commerce/inventory", async (original) => ({
  ...(await original<typeof import("../commerce/inventory")>()),
  listGroceries: vi.fn(async () => inventory.items.map((item) => ({ ...item }))),
  adjustListEntry: vi.fn(async (_client: unknown, input: { itemId: string; amount: { quantity: number; unit: string } }) => {
    inventory.adjust(input);
    if (inventory.refuse) throw inventory.refuse;
    const item = inventory.items.find((entry) => entry.id === input.itemId)!;
    const after = (item.toBuy?.quantity ?? 0) + input.amount.quantity;
    return { before: item.toBuy?.quantity ?? null, after, unit: input.amount.unit, version: 2, clamped: false, replayed: false, conflict: false, entryId: "e-1" };
  }),
}));

vi.mock("../commerce/unit-change", async (original) => ({
  ...(await original<typeof import("../commerce/unit-change")>()),
  changeItemUnit: vi.fn(async (_client: unknown, input: { item: { id: string }; unit: string }) => {
    inventory.change(input);
    const index = inventory.items.findIndex((entry) => entry.id === input.item.id);
    // The Groceries screen's change: the list entry starts again in the new unit.
    inventory.items[index] = { ...inventory.items[index]!, unit: input.unit, step: null, stock: null, toBuy: null };
    return { unit: input.unit, stockCleared: null, listAfter: null, converts: false };
  }),
}));

function oil(pack: { quantity: number; unit: string } | null, toBuy: number | null = 1): GroceryItem {
  return {
    id: "c-oil",
    name: "Coconut oil",
    category: "grocery",
    unit: "bottle",
    step: null,
    lowLevel: null,
    storage: null,
    note: null,
    aliases: [],
    imageUrl: null,
    imagePath: null,
    catalog: pack ? ({ pack, ladder: { unit: "bottle", sizes: [1] }, category: "grocery", subcategory: null } as unknown as GroceryItem["catalog"]) : null,
    lastPurchasedOn: null,
    stock: null,
    toBuy: toBuy === null ? null : { entryId: "e-oil", quantity: toBuy, unit: "bottle", version: 1, source: "manual", mealId: null },
  };
}

const MEMBER = "m-1";
const context = { supabase: {} as SupabaseClient, householdId: "h-1", actorMemberId: MEMBER, members: [], timezone: "Asia/Kolkata" };
const intent = (parameters: Record<string, unknown>): HouseholdIntent => ({ actorMemberId: MEMBER, channel: "text", utterance: "", action: "add_to_list", target: { kind: "unspecified" }, parameters, confidence: 0.9 });
const ground = (parameters: Record<string, unknown>) => groundIntent(intent(parameters), { people: [], viewerMemberId: MEMBER, timezone: "Asia/Kolkata", now: new Date(), references: async () => NO_REFERENCES, groceries: async () => inventory.items });
const RAW = /does not fit|kept in bottle,|\b1 l\b|I tried/;

beforeEach(() => {
  inventory.items = [];
  inventory.adjust.mockReset();
  inventory.change.mockReset();
  inventory.refuse = null;
});

describe("an amount said in another unit than the item is kept in", () => {
  it("1 L of an item kept in 1 L bottles is 1 bottle; 975 ml is too, within tolerance", () => {
    expect(readAcrossUnits({ quantity: 1, unit: "l" }, oil({ quantity: 1, unit: "l" }))).toMatchObject({ kind: "packs", packs: 1, amount: { quantity: 1, unit: "bottle" } });
    expect(readAcrossUnits({ quantity: 975, unit: "ml" }, oil({ quantity: 1, unit: "l" }))).toMatchObject({ kind: "packs", packs: 1 });
    expect(readAcrossUnits({ quantity: 1, unit: "l" }, oil({ quantity: 200, unit: "ml" }))).toMatchObject({ kind: "packs", packs: 5 });
  });

  it("bottles of unknown size are asked about, with practical choices", () => {
    const read = readAcrossUnits({ quantity: 1, unit: "l" }, oil(null));
    expect(read).toMatchObject({ kind: "ask", choices: ["1 bottle", "2 bottles", "Count it in litres instead"], switchTo: "l" });
    expect(read.kind === "ask" && read.question).toBe('Coconut oil is kept in bottles. How many bottles should I add for 1 litre? For example "1 bottle", "2 bottles", or "count it in litres instead".');
  });

  it("500 ml for 1 L bottles asks, never rounds silently", () => {
    const read = readAcrossUnits({ quantity: 500, unit: "ml" }, oil({ quantity: 1, unit: "l" }));
    expect(read.kind).toBe("ask");
    expect(read.kind === "ask" && read.question).toContain("Coconut oil is kept in bottles of 1 litre. How many bottles should I add for 500 ml?");
  });

  it("an item kept in litres takes \"2 bottles\" as twice its known pack", () => {
    const litres = { ...oil({ quantity: 1, unit: "l" }), unit: "l" };
    expect(readAcrossUnits({ quantity: 2, unit: "bottle" }, litres)).toMatchObject({ kind: "packs", amount: { quantity: 2000, unit: "ml" } });
  });
});

describe("HomeTalk adds it, or asks once — never a raw refusal", () => {
  it("1 L for 1 L bottles adds 1 bottle and says both units", async () => {
    inventory.items = [oil({ quantity: 1, unit: "l" })];
    const done = await executeIntent(intent({ item: "1 litre coconut oil" }), context);
    expect(inventory.adjust).toHaveBeenCalledWith(expect.objectContaining({ itemId: "c-oil", amount: { quantity: 1, unit: "bottle" } }));
    expect(done.ok && done.text).toBe("Added **Coconut oil** (+1 bottle, 1 L, now 2 bottles) to the [shopping list](/groceries?view=to-buy).");
  });

  it("grounding asks before anything is written when the bottle's size is unknown, with the choices in its metadata", async () => {
    inventory.items = [oil(null)];
    const grounded = await ground({ item: "1 litre coconut oil" });
    expect(grounded.kind).toBe("clarify");
    if (grounded.kind !== "clarify") return;
    expect(grounded.question).toMatch(/^Coconut oil is kept in bottles\. How many bottles should I add for 1 litre\?/);
    expect(grounded.question).not.toMatch(RAW);
    expect(grounded.intent.parameters).toMatchObject({ awaiting: "quantity", item: "coconut oil", choices: ["1 bottle", "2 bottles", "Count it in litres instead"] });
    expect(inventory.adjust).not.toHaveBeenCalled();
  });

  it("500 ml for 1 L bottles is asked in grounding too", async () => {
    inventory.items = [oil({ quantity: 1, unit: "l" })];
    expect((await ground({ item: "500 ml coconut oil" })).kind).toBe("clarify");
  });

  it("\"2 bottles\" answers the question and is added straight", async () => {
    inventory.items = [oil(null)];
    const grounded = await ground({ item: "1 litre coconut oil" });
    if (grounded.kind !== "clarify") throw new Error("expected a question");
    const answered = answerClarification({ ...grounded.intent, question: grounded.question, utterance: "add 1 litre coconut oil", asked: 1 } as never, "2 bottles", { actorMemberId: MEMBER, channel: "text" })!;
    expect(answered.parameters).toMatchObject({ item: "2 bottles coconut oil" });
    expect(answered.parameters.choices).toBeUndefined();
    const done = await executeIntent(answered, context);
    expect(done.ok && done.text).toBe("Added **Coconut oil** (+2 bottles, now 3 bottles) to the [shopping list](/groceries?view=to-buy).");
  });

  it("\"Count it in litres instead\" changes the unit as the Groceries screen does, then adds 1 L", async () => {
    inventory.items = [oil(null)];
    const grounded = await ground({ item: "1 litre coconut oil" });
    if (grounded.kind !== "clarify") throw new Error("expected a question");
    const answered = answerClarification({ ...grounded.intent, question: grounded.question, utterance: "add 1 litre coconut oil", asked: 1 } as never, "Count it in litres instead", { actorMemberId: MEMBER, channel: "text" })!;
    expect(answered.parameters).toMatchObject({ item: "1 litre coconut oil", switchUnit: { itemId: "c-oil", unit: "l" } });
    // Grounding does not ask the same question again on the way through.
    expect((await ground(answered.parameters)).kind).not.toBe("clarify");
    const done = await executeIntent(answered, context);
    expect(inventory.change).toHaveBeenCalledWith(expect.objectContaining({ unit: "l", item: expect.objectContaining({ id: "c-oil", unit: "bottle" }) }));
    expect(inventory.adjust).toHaveBeenCalledWith(expect.objectContaining({ amount: { quantity: 1000, unit: "ml" } }));
    expect(done.ok && done.text).toBe("**Coconut oil** is counted in litres now.\nAdded **Coconut oil** (1 L) to the [shopping list](/groceries?view=to-buy).");
  });

  it("a write that reaches the executor unasked is answered with the question, said as it is", async () => {
    inventory.items = [oil(null)];
    const done = await executeIntent(intent({ item: "1 litre coconut oil" }), context);
    expect(done.ok).toBe(false);
    if (done.ok) return;
    const said = failedReply(done);
    expect(said).toMatch(/^Coconut oil is kept in bottles\. How many bottles/);
    expect(said).not.toMatch(RAW);
    expect(inventory.adjust).not.toHaveBeenCalled();
  });

  it("the database's own unit refusal is said in words, with what to do", async () => {
    inventory.items = [oil(null)];
    inventory.refuse = ApiError.badRequest("unit does not match this item");
    const done = await executeIntent(intent({ item: "2 bottles coconut oil" }), context);
    expect(done.ok).toBe(false);
    if (done.ok) return;
    expect(failedReply(done)).toBe("Coconut oil is counted in bottles, so I have left it as it was. Tell me the amount in bottles, or change how it is counted on the Groceries screen.");
  });

  it("other refusals still say they did not go through", () => {
    expect(failedReply({ reason: "That is no longer on the list." })).toBe("I tried, and it did not go through: That is no longer on the list.");
  });

  it("the whole turn: the engine asks, never executes, never says \"does not fit\"", async () => {
    inventory.items = [oil(null)];
    const now = new Date();
    const turn = await converse({
      utterance: "add 1 litre coconut oil to the list", channel: "text", actor: { memberId: MEMBER, roles: ["head"] }, pending: null, clarifying: null, autonomyFor: () => "execute", entitledFor: () => true, executable: canExecute, sessionId: "s-1", now,
      ground: (next) => groundIntent(next, { people: [], viewerMemberId: MEMBER, timezone: "Asia/Kolkata", now, references: async () => NO_REFERENCES, groceries: async () => inventory.items }),
    } as TurnInput);
    expect(turn.kind).toBe("reply");
    if (turn.kind !== "reply") return;
    expect(turn.proposal.kind).toBe("clarify");
    expect(turn.text).toContain("How many bottles should I add for 1 litre?");
    expect(turn.text).not.toMatch(RAW);
  });
});
