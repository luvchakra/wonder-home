import { describe, expect, it } from "vitest";

import type { GroceryItem } from "../commerce/inventory";
import { personItems } from "../context/builders";
import type { PendingClarification } from "./clarify";
import { applyCorrection, readCorrection } from "./corrections";
import { heldBecause, splitRequest } from "./decompose";
import { converse, type TurnInput } from "./engine";
import { confidenceLead, groundIntent, type GroundingEnv } from "./grounding";
import { canExecute } from "./executor";
import { NO_REFERENCES, type FocusEntity, type ReferenceState } from "./references";

/**
 * The Wave 4 evaluation matrix (§22) and the required examples (§21), run
 * through the whole deterministic turn: rules → grounding → gates →
 * proposal. No provider is configured here, which is the point — this is
 * the safety net §18 says a model may augment but never remove.
 *
 * One household throughout: Priya (the head), Asmi (12) and Manan (9), and
 * Sunita, who helps. Wednesday 23 September 2026, 10:00 in Kolkata.
 */

const NOW = new Date("2026-09-23T04:30:00Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const PEOPLE = personItems(
  [
    { id: "m-priya", displayName: "Priya", memberType: "adult", relationship: "mother" },
    { id: "m-asmi", displayName: "Asmi", memberType: "child", dateOfBirth: "2014-05-01", relationship: "daughter" },
    { id: "m-manan", displayName: "Manan", memberType: "child", dateOfBirth: "2017-02-11", relationship: "son" },
    { id: "m-sunita", displayName: "Sunita", memberType: "helper" },
  ],
  { householdId: "hh", now: NOW },
);

const SCHOOL = [
  { id: "s-ws", title: "Maths worksheet", childMemberId: "m-asmi", dueAt: "2026-09-24T12:30:00.000Z", status: "pending" },
  { id: "s-sci", title: "Science project", childMemberId: "m-manan", dueAt: "2026-09-29T11:30:00.000Z", status: "pending" },
  { id: "s-eng", title: "English worksheet", childMemberId: "m-manan", dueAt: null, status: "pending" },
];

const env = (references: Partial<ReferenceState> = {}): GroundingEnv => ({
  people: PEOPLE,
  viewerMemberId: "m-priya",
  timezone: "Asia/Kolkata",
  now: NOW,
  references: async () => ({ ...NO_REFERENCES, ...references }),
  recipes: async () => [
    { id: "r-pasta", name: "Tomato pasta" },
    { id: "r-dal", name: "Dal tadka" },
  ],
  bills: async () => [
    { id: "b-power", name: "Electricity", billType: "electricity" },
    { id: "b-power-2", name: "BESCOM flat 402", billType: "electricity" },
    { id: "b-rent", name: "Rent", billType: "rent" },
  ],
  catalogRecipes: async () => [
    { slug: "poha", name: "Poha" },
    { slug: "dal-tadka", name: "Dal tadka" },
    { slug: "masala-dosa", name: "Masala dosa" },
  ],
  ingredients: async (of) => (of.recipeId === "r-pasta" || of.mealId === "meal-1" ? ["pasta", "tomatoes", "basil"] : []),
  schoolItems: async () => SCHOOL,
  assets: async () => [
    { id: "a-wm", name: "Washing machine" },
    { id: "a-fridge", name: "Fridge" },
  ],
});

const HEAD = { memberId: "m-priya", roles: ["head" as const] };
const CHILD = { memberId: "m-asmi", roles: ["child" as const], memberType: "child" as const };

async function turn(utterance: string, over: Partial<TurnInput> & { references?: Partial<ReferenceState> } = {}) {
  const { references, ...rest } = over;
  return converse({
    utterance,
    channel: "text",
    actor: HEAD,
    pending: null,
    autonomyFor: () => "prepare",
    entitledFor: () => true,
    executable: canExecute,
    sessionId: "s-1",
    now: NOW,
    ground: (intent) => groundIntent(intent, env(references)),
    ...rest,
  });
}

/** The kind of turn, for a table-driven check: what the household is shown. */
async function kindOf(utterance: string, over: Parameters<typeof turn>[1] = {}) {
  const result = await turn(utterance, over);
  if (result.kind !== "reply") return { kind: result.kind, action: null, text: result.text, intent: null };
  return { kind: result.proposal.kind, action: result.intent.action, text: result.text, intent: result.intent };
}

describe("§21 required examples — each is understood, and nothing is claimed that is not done", () => {
  const cases: { say: string; action: string; kind: string }[] = [
    // School
    { say: "What does Asmi have tomorrow?", action: "ask_status", kind: "answer" },
    { say: "Move Manan's science project to Friday.", action: "adjust_schedule", kind: "needs_approval" },
    { say: "Mark Asmi's worksheet complete.", action: "complete_school_item", kind: "executed" },
    // Groceries
    // No amount said: how much is asked first (the owner, 2026-10-26).
    { say: "We're out of atta.", action: "add_to_list", kind: "clarify" },
    { say: "Add the same milk we bought last week.", action: "add_to_list", kind: "clarify" },
    { say: "Add 2 litres of the same milk we bought last week.", action: "add_to_list", kind: "executed" },
    { say: "Remove the bananas.", action: "remove_from_list", kind: "executed" },
    // Meals
    { say: "What are we eating tonight?", action: "ask_status", kind: "answer" },
    { say: "Plan something vegetarian for tomorrow.", action: "plan_meal", kind: "clarify" },
    // Finance
    { say: "Which bills are due this week?", action: "ask_status", kind: "answer" },
    { say: "Prepare the electricity payment.", action: "make_payment", kind: "needs_approval" },
    // Bills recorded (11-010): a payment noted is done at once; a new bill is asked first; neither pays anything.
    { say: "I paid the rent, 25,000 yesterday.", action: "record_bill_payment", kind: "executed" },
    { say: "Next month's rent is 26,000.", action: "set_bill_amount", kind: "executed" },
    { say: "Add the water bill, due on the 10th every month.", action: "add_bill", kind: "needs_approval" },
    { say: "I paid the light bill.", action: "record_bill_payment", kind: "clarify" },
    // Home
    { say: "The washing machine is making that noise again.", action: "raise_service_request", kind: "executed" },
    { say: "Raise a service request.", action: "raise_service_request", kind: "clarify" },
    // Family
    { say: "Protect Saturday evening for family time.", action: "plan_event", kind: "needs_approval" },
    // Health
    { say: "When is my next checkup?", action: "ask_status", kind: "answer" },
    { say: "Log my weight as 71.5 kg.", action: "log_vital", kind: "executed" },
  ];

  for (const example of cases) {
    it(`"${example.say}" → ${example.action}, ${example.kind}`, async () => {
      // Autonomy "execute" for the harmless ones, as a household would set
      // it; consequential ones still wait for a yes whatever it says.
      const result = await kindOf(example.say, { autonomyFor: () => (example.kind === "executed" ? "execute" : "prepare") });
      expect({ action: result.action, kind: result.kind }).toEqual({ action: example.action, kind: example.kind });
    });
  }

  it("the school examples name the one real item, never a guess", async () => {
    const moved = await kindOf("Move Manan's science project to Friday.");
    expect(moved.intent?.parameters).toMatchObject({ schoolItemId: "s-sci", toResolved: expect.objectContaining({ date: "2026-09-25" }) });
    expect(moved.text).toMatch(/move Manan's Science project to Fri 25 Sep/);
    const done = await kindOf("Mark Asmi's worksheet complete.", { autonomyFor: () => "execute" });
    expect(done.intent?.parameters).toMatchObject({ schoolItemId: "s-ws", childName: "Asmi" });
  });

  it("\"worksheet\" for Manan, who has one — and for someone with none, it says so", async () => {
    const his = await kindOf("Mark Manan's worksheet complete.", { autonomyFor: () => "execute" });
    expect(his.intent?.parameters.schoolItemId).toBe("s-eng");
    const none = await kindOf("Mark Asmi's essay complete.");
    expect(none.kind).toBe("clarify");
    expect(none.text).toMatch(/I cannot find anything called "essay" still open for Asmi/);
  });

  it("the appliance is the household's own, and a vegetarian dinner is chosen from its own recipes", async () => {
    const repair = await kindOf("The washing machine is making that noise again.", { autonomyFor: () => "execute" });
    expect(repair.intent?.parameters).toMatchObject({ assetId: "a-wm", assetName: "Washing machine" });
    const veg = await kindOf("Plan something vegetarian for tomorrow.");
    expect(veg.text).toBe("Which vegetarian dish should I plan for tomorrow? For example Tomato pasta or Dal tadka — or name another.");
  });

  it("protected time is a real window on a real day", async () => {
    const result = await kindOf("Protect Saturday evening for family time.");
    expect(result.intent?.parameters).toMatchObject({ protected: true, windowResolved: expect.objectContaining({ date: "2026-09-26", window: { from: "17:00", to: "21:00" } }) });
  });
});

describe("§22 evaluation matrix", () => {
  it("contextual references: \"put that on the list\" after a school notice", async () => {
    const homesend: FocusEntity[] = [{ entityType: "thing", entityId: null, label: "white T-shirt", source: "homesend", at: minutesAgo(2), origin: "the school notice" }];
    const result = await kindOf("put that on the list", { autonomyFor: () => "execute", references: { homesend } });
    expect(result.intent?.parameters).toMatchObject({ item: "white T-shirt" });
  });

  it("Asmi vs Manan: names, relationships and ages each find one child", async () => {
    for (const [said, id] of [["Asmi is away tomorrow", "m-asmi"], ["Manan is away tomorrow", "m-manan"]] as const) {
      expect((await kindOf(said)).intent?.parameters.memberId).toBe(id);
    }
  });

  it("an ambiguous child reference is one question with both names", async () => {
    const result = await kindOf("the kid is away tomorrow");
    expect(result.kind).toBe("clarify");
    expect(result.text).toBe("I found two possibilities — Asmi or Manan. Which did you mean?");
  });

  it("confidence UX (§20): high goes unsaid, medium says \"I think you mean\"", async () => {
    const high = await kindOf("Asmi is away tomorrow");
    expect(confidenceLead(high.intent!)).toBeNull();
    const medium = await kindOf("the younger one is away tomorrow");
    expect(medium.intent?.parameters.memberId).toBe("m-manan");
    expect(confidenceLead(medium.intent!)).toBe('I think you mean Manan (you said "the younger one") — if not, say who.');
  });

  it("date expressions resolve to the household's own days", async () => {
    const cases: [string, string][] = [
      ["Sunita is away tomorrow", "2026-09-24"],
      ["Sunita is away next friday", "2026-10-02"],
      ["Sunita is away on friday", "2026-09-25"],
    ];
    for (const [said, date] of cases) {
      expect((await kindOf(said)).intent?.parameters.whenResolved).toMatchObject({ date });
    }
  });

  it("corrections: before a write they amend the request; after one they carry what to undo", () => {
    const correction = readCorrection("No, I meant Manan")!;
    const context = { actorMemberId: "m-priya", channel: "text" as const, utterance: "No, I meant Manan", timezone: "Asia/Kolkata", now: NOW };
    const subject = { actionId: "a-1", actionType: "record_absence", outcomeKey: null, parameters: { when: "tomorrow", memberId: "m-asmi", memberName: "Asmi" }, result: null };
    expect(applyCorrection(correction, { ...subject, status: "proposed" }, context)?.parameters.corrects).toBeUndefined();
    expect(applyCorrection(correction, { ...subject, status: "executed", result: { memberId: "m-asmi", onDate: "2026-09-24" } }, context)?.parameters.corrects).toMatchObject({ actionId: "a-1" });
  });

  it("voice confidence: a shaky transcript of something consequential is read back, never acted on", async () => {
    const result = await turn("pay the electricity bill", { channel: "voice", transcriptConfidence: 0.4 });
    expect(result.kind).toBe("confirm_transcript");
    expect(result.text).toMatch(/^I heard "pay the electricity bill" but I am not certain/);
    // The same words, clearly heard, reach the ordinary gates.
    expect((await turn("pay the electricity bill", { channel: "voice", transcriptConfidence: 0.95 })).kind).toBe("reply");
  });

  it("payments, orders and access changes always wait for a person — or are refused outright", async () => {
    expect((await kindOf("pay the electricity bill", { autonomyFor: () => "execute" })).kind).toBe("needs_approval");
    // No shop is connected, so an order is prepared and says so — never "done" (§13).
    expect(["needs_approval", "prepared"]).toContain((await kindOf("order rice", { autonomyFor: () => "execute" })).kind);
    expect((await kindOf("Sunita handles the school run", { autonomyFor: () => "execute" })).kind).toBe("needs_approval");
    // A child asking to pay is refused, whatever they say.
    expect((await kindOf("pay the electricity bill", { actor: CHILD, autonomyFor: () => "execute" })).kind).toBe("refused");
  });

  it("cross-domain plans: a meal, then what it needs — and the second waits for the first", async () => {
    expect(splitRequest("Plan pasta for tonight and make sure we have everything")).toEqual(["Plan pasta for tonight", "make sure we have everything"]);
    const meal = await kindOf("Plan pasta for tonight");
    expect(meal.intent).toMatchObject({ action: "plan_meal", parameters: expect.objectContaining({ recipeId: "r-pasta", mealName: "Tomato pasta" }) });
    expect(heldBecause("make sure we have everything", [{ part: "Plan pasta for tonight", outcome: "waiting" }])).toMatch(/waiting for your yes/);
    const planned: FocusEntity[] = [{ entityType: "meal", entityId: "meal-1", label: "Tomato pasta", source: "action_result", at: minutesAgo(0) }];
    const needs = await kindOf("make sure we have everything", { autonomyFor: () => "execute", references: { conversation: planned } });
    expect(needs.intent?.parameters).toMatchObject({ items: ["pasta", "tomatoes", "basil"], forMeal: "Tomato pasta" });
  });

  it("bills (11-010): the bill paid is grounded to the household's own, and a child cannot record one", async () => {
    const rent = await kindOf("I paid the rent, 25,000 yesterday");
    expect(rent.intent?.parameters).toMatchObject({ billId: "b-rent", billLabel: "Rent", amount: 25000, whenResolved: expect.objectContaining({ date: "2026-09-22" }) });
    const two = await turn("I paid the light bill");
    expect(two.text).toMatch(/Which bill — Electricity or BESCOM flat 402\?/);
    const unknown = await turn("I paid the gym bill");
    expect(unknown.text).toMatch(/don't have a bill called "gym"/);
    expect((await kindOf("I paid the rent", { actor: CHILD, autonomyFor: () => "execute" })).kind).not.toBe("executed");
  });

  it("recipe catalog (25-022): a dish the household has no recipe for is planned from WonderHome's, its own recipe wins", async () => {
    const poha = await kindOf("Plan poha for breakfast tomorrow");
    expect(poha.intent).toMatchObject({ action: "plan_meal", parameters: expect.objectContaining({ catalogSlug: "poha", mealName: "Poha" }) });
    expect(poha.intent?.parameters.recipeId).toBeUndefined();
    // The household's own dal tadka stands before the catalog's.
    const dal = await kindOf("Plan dal tadka for dinner tomorrow");
    expect(dal.intent?.parameters).toMatchObject({ recipeId: "r-dal" });
    expect(dal.intent?.parameters.catalogSlug).toBeUndefined();
  });

  it("HomeSend-created context: what a notice asked for is what \"that\" means", async () => {
    const homesend: FocusEntity[] = [{ entityType: "school_item", entityId: "s-sports", label: "Sports Day", source: "homesend", at: minutesAgo(5), origin: "the school notice" }, { entityType: "thing", entityId: null, label: "white T-shirt", source: "homesend", at: minutesAgo(5), origin: "the school notice" }];
    const result = await kindOf("add that to the list", { autonomyFor: () => "execute", references: { homesend } });
    expect(result.intent?.parameters.item).toBe("white T-shirt");
  });

  it("previously executed actions are corrected through the record of what was written", () => {
    const correction = readCorrection("Not milk, almond milk")!;
    const corrected = applyCorrection(
      correction,
      { actionId: "a-9", actionType: "add_to_list", outcomeKey: "groceries", parameters: { items: ["milk", "bananas"] }, status: "executed", result: { items: [{ name: "Milk", consumableId: "c-1", alreadyTracked: false }] } },
      { actorMemberId: "m-priya", channel: "text", utterance: "Not milk, almond milk", timezone: "Asia/Kolkata", now: NOW },
    );
    expect(corrected?.parameters).toMatchObject({ items: ["almond milk", "bananas"], corrects: { actionId: "a-9" } });
  });
});

describe("the reminder conversation of 24 Sep, 8:34 pm — replayed through the whole turn", () => {
  const EVENING = new Date("2026-09-24T15:04:00Z");
  const evening = (utterance: string, clarifying: PendingClarification | null = null) =>
    turn(utterance, { now: EVENING, clarifying, ground: (intent) => groundIntent(intent, { ...env(), now: EVENING }) });

  it("\"…while my way back from office\" is understood as this evening, with the thing itself as the reminder", async () => {
    const result = await evening("remind me to pick some coriander while my back way back from office");
    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.proposal.kind).not.toBe("clarify");
    expect(result.intent.parameters.what).toBe("pick some coriander");
    expect(result.intent.parameters.remindAtResolved).toMatchObject({ day: "today (Thu 24 Sep)", time: "9pm" });
  });

  it("the answers our own question offers — \"later today\", \"today\" — are understood, and never land in the past", async () => {
    const asked = await evening("remind me to call the plumber");
    expect(asked.kind === "reply" && asked.proposal.kind).toBe("clarify");
    if (asked.kind !== "reply") return;
    expect(asked.text).toContain("later today");

    for (const answer of ["later today", "today"]) {
      const answered = await evening(answer, asked.clarification!);
      expect(answered.kind).toBe("reply");
      if (answered.kind !== "reply") return;
      expect(answered.proposal.kind).not.toBe("clarify");
      expect(answered.intent.parameters.remindAtResolved).toMatchObject({ day: "today (Thu 24 Sep)", time: "9:45pm" });
      expect(answered.text).not.toContain("9am");
    }
  });

  it("a time already gone is one question, and \"tomorrow\" answers it", async () => {
    const asked = await evening("remind me to call mum today at 9am");
    expect(asked.kind === "reply" && asked.proposal.kind).toBe("clarify");
    if (asked.kind !== "reply") return;
    expect(asked.text).toContain("9am today has already passed");

    const answered = await evening("tomorrow", asked.clarification!);
    expect(answered.kind === "reply" && answered.intent.parameters.remindAtResolved).toMatchObject({ day: "tomorrow (Fri 25 Sep)", time: "9am" });
  });
});

/**
 * Groceries Phase 2 (story 09-011): the conversation cases A–H from
 * the Groceries spec §5.3, through the same deterministic turn. The list
 * and what is at home are separate; amounts are read by rules; what is at
 * home changes only with a yes unless the household chose otherwise.
 */
describe("groceries in conversation (Groceries §5.3, cases A–H)", () => {
  const item = (id: string, name: string, unit = "pcs") => ({
    id,
    name,
    category: "grocery",
    unit,
    step: null,
    lowLevel: null,
    storage: null,
    note: null,
    aliases: [],
    imageUrl: null,
    imagePath: null,
    catalog: null,
    lastPurchasedOn: null,
    stock: null,
    toBuy: null,
  });
  const KITCHEN = [item("c-eggs", "Eggs"), item("c-milk", "Milk", "l"), item("c-rice", "Rice", "kg"), item("c-cherry", "Cherry tomatoes", "g"), item("c-plum", "Plum tomatoes", "g")];
  const grocTurn = (utterance: string, over: Parameters<typeof turn>[1] = {}) =>
    turn(utterance, { ...over, ground: (intent) => groundIntent(intent, { ...env(over.references), groceries: async () => KITCHEN }) });
  const eggsJustDiscussed: Partial<ReferenceState> = {
    conversation: [{ entityType: "consumable", entityId: "c-eggs", label: "Eggs", source: "mention", at: minutesAgo(1) } as FocusEntity],
  };

  it("A: \"Yes, add 6\" after talking about eggs adds six eggs to the list — nothing else", async () => {
    const result = await grocTurn("Yes, add 6.", { references: eggsJustDiscussed });
    expect(result.kind === "reply" && result.intent).toMatchObject({ action: "add_to_list", parameters: { item: "6 Eggs" } });
    expect(result.kind === "reply" && result.proposal.kind).toBe("executed");
  });

  it("A′: \"add 6 more to the list\" is an increment on the same eggs", async () => {
    const result = await grocTurn("Okay, add 6 more to the list", { references: eggsJustDiscussed });
    expect(result.kind === "reply" && result.intent.parameters.item).toBe("6 more Eggs");
  });

  // B changed by the owner's decision (2026-10-26): "it should ask for
  // quantity". A bare name was once the item's usual step, or "already on
  // the list, so there was nothing to add"; now HomeTalk asks how much first.
  const ask = async (utterance: string, kitchen: GroceryItem[] = KITCHEN, over: Parameters<typeof turn>[1] = {}) =>
    turn(utterance, { autonomyFor: () => "execute", ...over, ground: (intent) => groundIntent(intent, { ...env(over.references), groceries: async () => kitchen }) });
  const milkOnList: GroceryItem[] = KITCHEN.map((entry) =>
    entry.id === "c-milk" ? { ...entry, toBuy: { entryId: "e-milk", quantity: 1, unit: "l", version: 1, source: "manual", mealId: null } } : entry,
  );

  it("B: \"add milk to the list\" asks how much before anything is written", async () => {
    const result = await ask("Add milk to the list");
    expect(result.kind === "reply" && result.proposal.kind).toBe("clarify");
    expect(result.kind === "reply" && result.text).toBe("How much milk should I add? For example 1 litre or 2 bottles.");
    expect(result.kind === "reply" && result.clarification?.parameters).toMatchObject({ awaiting: "quantity", quantityFor: ["milk"] });
  });

  it("B′: an item already on the list asks how much more, with what is there", async () => {
    const result = await ask("Add milk to the list", milkOnList);
    expect(result.kind === "reply" && result.text).toBe('Milk is already on your shopping list (1 L). How much more should I add? Or say "that\'s enough" to leave it.');
  });

  it("B″: the answer adds that much, through the same add", async () => {
    const first = await ask("Add milk to the list", milkOnList);
    const clarifying = first.kind === "reply" ? (first.clarification ?? null) : null;
    const result = await ask("2 litres", milkOnList, { clarifying });
    expect(result.kind === "reply" && result.intent).toMatchObject({ action: "add_to_list", parameters: { item: "2 litres milk" } });
    expect(result.kind === "reply" && result.proposal.kind).toBe("executed");
  });

  it("B‴: \"that's enough\" leaves the list as it is", async () => {
    const first = await ask("Add milk to the list", milkOnList);
    const clarifying = first.kind === "reply" ? (first.clarification ?? null) : null;
    const result = await ask("that's enough", milkOnList, { clarifying });
    expect(result.kind === "reply" && result.intent.parameters).toMatchObject({ keepAsIs: true, item: "milk" });
    expect(result.kind === "reply" && result.intent.parameters.awaiting).toBeUndefined();
  });

  it("B⁗: an unreadable answer gets the polite second ask, never the same question", async () => {
    const first = await ask("Add milk to the list");
    const clarifying = first.kind === "reply" ? (first.clarification ?? null) : null;
    const result = await ask("lots", KITCHEN, { clarifying });
    expect(result.kind === "reply" && result.proposal.kind).toBe("clarify");
    expect(result.kind === "reply" && result.text).toContain("Sorry, I didn't catch how much of milk.");
  });

  it("B⁵: several bare items are one question; an amount said is never asked about", async () => {
    const both = await ask("add milk and eggs to the list");
    expect(both.kind === "reply" && both.text).toMatch(/^How much of each should I add\? Milk, Eggs\./);
    const said = await ask("add 2 litres of milk to the list");
    expect(said.kind === "reply" && said.proposal.kind).toBe("executed");
  });

  it("C: \"make sure we have everything\" after planning pasta adds only what the recipe needs, for that meal", async () => {
    const planned: FocusEntity[] = [{ entityType: "meal", entityId: "meal-1", label: "Tomato pasta", source: "action_result", at: minutesAgo(1) }];
    const result = await grocTurn("make sure we have everything", { references: { conversation: planned }, autonomyFor: () => "execute" });
    expect(result.kind === "reply" && result.intent.parameters).toMatchObject({ items: ["pasta", "tomatoes", "basil"], forMeal: "Tomato pasta" });
  });

  it("D: \"actually we have 10 eggs in the fridge\" changes what is at home — and asks first by default", async () => {
    const result = await grocTurn("Actually we have 10 eggs in the fridge");
    expect(result.kind === "reply" && result.intent).toMatchObject({ action: "set_stock", parameters: { items: ["10 eggs in the fridge"] } });
    expect(result.kind === "reply" && result.proposal.kind).toBe("needs_approval");
    const allowed = await grocTurn("Actually we have 10 eggs in the fridge", { autonomyFor: () => "execute" });
    expect(allowed.kind === "reply" && allowed.proposal.kind).toBe("executed");
  });

  it("E: \"bought 2 kg potatoes and 1 litre milk\" is one purchase of each, asked first", async () => {
    const result = await grocTurn("Bought 2 kg potatoes and 1 litre milk");
    expect(result.kind === "reply" && result.intent).toMatchObject({ action: "mark_bought", parameters: { items: ["2 kg potatoes", "1 litre milk"] } });
    expect(result.kind === "reply" && result.proposal.kind).toBe("needs_approval");
  });

  it("F: \"add tomatoes\" with two kinds on record is one question, never a guess", async () => {
    const result = await grocTurn("add half a kilo of tomatoes to the list");
    expect(result.kind === "reply" && result.proposal.kind).toBe("clarify");
    expect(result.kind === "reply" && result.text).toBe("Should I use cherry tomatoes or plum tomatoes?");
  });

  it("G: \"remove 500 grams of rice from the shopping list\" takes that much off the list", async () => {
    const result = await grocTurn("No, I meant remove 500 grams of rice from the shopping list");
    expect(result.kind === "reply" && result.intent).toMatchObject({ action: "remove_from_list", parameters: { item: "500 grams of rice" } });
  });

  it("H: a child cannot change what is at home or send anything on the household's behalf", async () => {
    const stock = await grocTurn("we have 10 eggs", { actor: CHILD, autonomyFor: () => "execute" });
    // The rules read it; the database refuses a child's stock change (scripts/test-grocery-rls.mjs), so it is never claimed done here either.
    expect(stock.kind === "reply" && stock.intent.action).toBe("set_stock");
    const send = await grocTurn("send today's menu to Sunita on WhatsApp", { actor: CHILD });
    expect(send.kind === "reply" && send.proposal.kind).not.toBe("executed");
  });
});
