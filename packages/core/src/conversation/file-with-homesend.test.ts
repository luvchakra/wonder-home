import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HouseholdIntent } from "./intent";

/** What HomeSend read from the sentence: a complete grocery line, or a school item that names nobody. */
const outcome = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../homesend/ingest", () => ({ ingestText: async () => outcome.current }));

const { executeIntent } = await import("./executor");

const intent: HouseholdIntent = {
  action: "file_with_homesend",
  actorMemberId: "m-kunal",
  target: { kind: "unspecified" },
  parameters: {},
  confidence: 0.9,
  channel: "text",
  utterance: "We need 2 litres of mustard oil",
};

const context = (addFromHomeSend: (itemId: string) => Promise<unknown>) =>
  ({ supabase: {} as never, householdId: "h-1", actorMemberId: "m-kunal", members: [], timezone: "Asia/Kolkata", addFromHomeSend }) as Parameters<typeof executeIntent>[1];

const read = (kind: string, extracted: Record<string, unknown>) => ({
  itemId: "i-1",
  duplicate: false,
  state: "needs_review",
  notice: "",
  item: { classifiedKind: kind, extracted, understanding: { references: [] } },
});

// Design §13.2: told in HomeTalk, filed with HomeSend, given HomeSend's own decision.
describe("something told to HomeTalk and filed with HomeSend", () => {
  beforeEach(() => {
    outcome.current = null;
  });

  it("is added on its own when it needs no question and the household allows it, with how sure", async () => {
    outcome.current = read("grocery_item", { title: "Mustard oil", quantity: 2, unit: "l" });
    const asked: string[] = [];
    const result = await executeIntent(intent, context(async (itemId) => (asked.push(itemId), { title: "Mustard oil", where: "Groceries", percent: 97, why: "verified" })));
    expect(asked).toEqual(["i-1"]);
    expect(result).toEqual({
      ok: true,
      text: "Added **Mustard oil** to Groceries (97% sure — every detail is in what you sent) — your household lets WonderHome add these on its own. You can undo it in HomeSend.",
      result: { homeSendItemId: "i-1", added: "Groceries" },
    });
  });

  it("waits in HomeSend when the household doesn't let it be added on its own", async () => {
    outcome.current = read("grocery_item", { title: "Mustard oil", quantity: 2, unit: "l" });
    const result = await executeIntent(intent, context(async () => null));
    expect(result.ok && result.text).toMatch(/for you to check before anything is added/);
  });

  it("asks first, and adds nothing, while something is still missing", async () => {
    outcome.current = read("school_item", { title: "Maths worksheet", people: ["Asmi"], dueDate: null });
    const asked: string[] = [];
    const result = await executeIntent(intent, context(async (itemId) => (asked.push(itemId), null)));
    expect(asked).toEqual([]);
    expect(result.ok && result.text).toMatch(/When is it due\?$/);
  });
});
