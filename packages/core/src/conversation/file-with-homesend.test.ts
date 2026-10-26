import { beforeEach, describe, expect, it, vi } from "vitest";

import { decideConfirmation } from "../homesend/confirmation";
import { intentFromModelOutput } from "../ai/model-client";
import { minimiseContext, reidentifyIntent, type DataUsePolicy, type Person } from "../ai/privacy";
import type { HouseholdIntent } from "./intent";

/** What HomeSend read from the sentence: a complete grocery line, or a school item that names nobody. */
const outcome = vi.hoisted(() => ({ current: null as unknown, filed: [] as string[] }));
vi.mock("../homesend/ingest", () => ({ ingestText: async (_supabase: unknown, _actor: unknown, input: { text: string }) => (outcome.filed.push(input.text), outcome.current) }));

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

// AT-J (docs/testing/2026-10-26-hometalk-homesend-acceptance.md): told in HomeTalk, under the
// household's approval settings. HomeSend's own decision stands in for the app's review.
describe("AT-J: filed from HomeTalk, under the approval settings", () => {
  const understanding = { readable: true, confidence: "high" as const, score: 0.97, check: { verified: true, unverified: [] }, safety: { signals: [], instructionsIgnored: false } };
  const decideWith = (autonomy: "execute" | "prepare", bar: number, kind: string, extracted: Record<string, unknown>, listed = false) => async () => {
    const onList = listed ? { reconciliation: { message: "This looks like the same one.", proposal: { type: "duplicate" as const } }, onShoppingList: true } : { reconciliation: null };
    const decision = decideConfirmation({ kind: kind as never, extracted: extracted as never, understanding, subject: null, memberInitiated: true, autonomy, autoAddPercent: bar, ...onList });
    if (decision.mode !== "auto_apply") return decision.wait ? { waiting: decision.wait, title: String(extracted.title) } : null;
    const more = decision.topUp ? { more: { added: { quantity: 2000, unit: "ml" }, now: { quantity: 3000, unit: "ml" } } } : {};
    return { title: String(extracted.title), where: "Groceries", percent: 97, why: "verified" as const, ...more };
  };
  const oil = { title: "Mustard oil", quantity: 2, unit: "l", needs: [], confidence: "high" };
  const bill = { title: "Electricity", payee: "BESCOM", amount: 2140, dueDate: "2026-11-05", needs: [], confidence: "high" };
  // A wait that would otherwise have been added says why, with what was read (I-27, 2026-10-26).
  const cases: [id: string, kind: string, extracted: Record<string, unknown>, autonomy: "execute" | "prepare", bar: number, expected: RegExp, listed?: boolean][] = [
    ["AT-J01", "grocery_item", oil, "execute", 95, /^Added \*\*Mustard oil\*\* to Groceries \(97% sure — every detail is in what you sent\)/],
    ["AT-J02", "grocery_item", oil, "execute", 99, /^WonderHome adds things on its own only when it is more than 99% sure, so it's waiting in HomeSend for you to check\. I read it as something to buy: \*\*Mustard oil\*\*\.$/],
    ["AT-J03", "grocery_item", oil, "prepare", 60, /^Your household has groceries set to Wait for Approval, so it's waiting in HomeSend for you to approve\. I read it as/],
    ["AT-J04", "bill", bill, "execute", 60, /for you to check before anything is added/],
    ["AT-J05", "grocery_item", oil, "execute", 95, /^Added 2 L more \*\*Mustard oil\*\* \(now 3 L\) \(97% sure/, true],
    ["AT-J06", "grocery_item", oil, "prepare", 95, /^\*\*Mustard oil\*\* is already on your shopping list, so it's waiting in HomeSend for you to choose\./, true],
  ];
  for (const [id, kind, extracted, autonomy, bar, expected, listed] of cases) {
    it(`${id} ${kind}, ${autonomy === "execute" ? "Pre Approved" : "Wait for Approval"}, bar ${bar}%${listed ? ", already on the list" : ""}`, async () => {
      outcome.current = read(kind, extracted);
      const result = await executeIntent(intent, context(decideWith(autonomy, bar, kind, extracted, listed)));
      expect(result.ok && result.text).toMatch(expected);
      if (kind === "bill") expect(result.ok && result.text).not.toMatch(/2,?140/);
    });
  }
});

// I-26 (the owner, 2026-10-26): "Asmi has a karate grading exam next Sunday at 10 am at the
// Koramangala dojo" was filed with HomeSend as "Child B has a karate grading exam …" — the masked
// copy the model read, not the member's words.
describe("I-26: what is filed is the member's own words", () => {
  const said = "Asmi has a karate grading exam next Sunday at 10 am at the Koramangala dojo";
  const people: Person[] = [
    { id: "m-kunal", displayName: "Kunal Mehta", memberType: "adult" },
    { id: "m-asmi", displayName: "Asmi", memberType: "child" },
    { id: "m-manan", displayName: "Manan", memberType: "child" },
  ];
  const policy = { allowedClasses: ["general"], maxItems: 8 } as unknown as DataUsePolicy;

  beforeEach(() => {
    outcome.filed = [];
    outcome.current = read("activity_item", { title: "Karate grading exam", people: ["Asmi"], dueDate: "2026-11-01" });
  });

  it("the model reads placeholders, and the sentence filed with HomeSend names Asmi and the dojo", async () => {
    // Expected, written first: the provider sees "Child A" (never "Asmi"); ingestText receives `said` exactly.
    const minimised = minimiseContext([{ id: "utterance", contentClass: "general", need: "what was asked", text: said, relevant: true }], { policy, people });
    const sent = minimised.included[0]!.text;
    expect(sent).not.toMatch(/Asmi/);
    expect(sent).toMatch(/^Child [AB] has a karate grading exam/);

    const fromModel = intentFromModelOutput(
      { action: "file_with_homesend", target: { kind: "member", reference: sent.split(" has")[0]! }, parameters: { what: `${sent.split(" has")[0]} karate grading exam` }, confidence: 0.9 } as never,
      { actorMemberId: "m-kunal", channel: "text", utterance: sent },
    );
    expect(fromModel.utterance).toBe(sent);

    const household = reidentifyIntent(fromModel, said, minimised.pseudonyms, people);
    expect(household.utterance).toBe(said);
    expect(household.target).toEqual({ kind: "member", reference: "asmi" });
    expect(household.parameters).toMatchObject({ what: "Asmi karate grading exam", memberId: "m-asmi" });
    expect(JSON.stringify(household)).not.toMatch(/\b(Child|Adult|Helper) [A-Z]\b/);

    const result = await executeIntent(household, context(async () => null));
    expect(outcome.filed).toEqual([said]);
    expect(result.ok).toBe(true);
  });

  it("files nothing when the words it was handed still carry a placeholder", async () => {
    const result = await executeIntent({ ...intent, utterance: "Child B has a karate grading exam next Sunday at 10 am" }, context(async () => null));
    expect(outcome.filed).toEqual([]);
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/with their name/) });
  });
});
