import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Wave 4 §9, §10, §11, §12 — what HomeTalk actually writes for several
 * things at once, a reminder, a meal, and a correction of something already
 * done. The domain services are stubbed; what is asserted is which of them
 * were called, with what, and what the household is told.
 */

const commerce = vi.hoisted(() => ({
  listConsumables: vi.fn(),
  createConsumable: vi.fn(),
  retireConsumable: vi.fn(),
}));
const meals = vi.hoisted(() => ({ createMeal: vi.fn(), attachIngredients: vi.fn() }));
const helpers = vi.hoisted(() => ({ recordAvailabilityException: vi.fn() }));

vi.mock("../commerce/repository", () => commerce);
vi.mock("../meals/repository", () => meals);
vi.mock("../household/helpers-repository", () => helpers);

import { canExecute, executeIntent, type ExecutionContext } from "./executor";
import type { HouseholdIntent } from "./intent";
import { focusFromResult } from "./references";
import { unchangedResult } from "./repository";

// Wednesday 23 September 2026, 10:00 in Kolkata.
const NOW = new Date("2026-09-23T04:30:00Z");

const consumable = (id: string, name: string) => ({
  id,
  name,
  category: "grocery",
  petId: null,
  unit: "item",
  typicalQuantity: 1,
  daysPerUnit: null,
  evidenceBasis: null,
  lastPurchasedOn: null,
  lastPurchasedQuantity: null,
});

const intent = (over: Partial<HouseholdIntent>): HouseholdIntent => ({
  action: "add_to_list",
  actorMemberId: "m-priya",
  target: { kind: "list", reference: "groceries" },
  parameters: {},
  confidence: 0.9,
  channel: "text",
  utterance: "",
  ...over,
});

/** A service-role client that records the one insert/update a reminder makes. */
function fakeAdmin() {
  const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];
  const client = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        writes.push({ table, op: "insert", row });
        return { select: () => ({ single: async () => ({ data: { id: "n-1" }, error: null }) }) };
      },
      update: (row: Record<string, unknown>) => {
        writes.push({ table, op: "update", row });
        const chain = { eq: () => chain, then: (resolve: (value: { error: null }) => void) => resolve({ error: null }) };
        return chain;
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, writes };
}

const context = (over: Partial<ExecutionContext> = {}): ExecutionContext => ({
  supabase: fakeAdmin().client,
  householdId: "hh-1",
  actorMemberId: "m-priya",
  members: [{ id: "m-sunita", displayName: "Sunita", memberType: "helper" }],
  timezone: "Asia/Kolkata",
  now: NOW,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  commerce.listConsumables.mockResolvedValue([]);
  let next = 0;
  commerce.createConsumable.mockImplementation(async () => ({ id: `c-${(next += 1)}` }));
  commerce.retireConsumable.mockResolvedValue(undefined);
});

describe("several things at once (§10): each item on its own", () => {
  it("adds each, and says exactly what was added", async () => {
    const done = await executeIntent(intent({ parameters: { items: ["milk", "bananas"] } }), context());
    expect(commerce.createConsumable).toHaveBeenCalledTimes(2);
    expect(done.ok && done.text).toMatch(/Added \*\*Milk\*\* and \*\*Bananas\*\*/);
    expect(done.ok && focusFromResult("add_to_list", done.result, NOW.toISOString()).map((entity) => entity.label)).toEqual(["Milk", "Bananas"]);
  });

  it("one already on the list never hides the other — and is not added twice", async () => {
    commerce.listConsumables.mockResolvedValue([consumable("c-milk", "Milk")]);
    const done = await executeIntent(intent({ parameters: { items: ["milk", "bananas"] } }), context());
    expect(commerce.createConsumable).toHaveBeenCalledTimes(1);
    expect(done.ok && done.text).toMatch(/Added \*\*Bananas\*\*.*\*\*Milk\*\* was already there/);
    expect(done.ok && unchangedResult(done.result)).toBe(false);
  });

  it("nothing written is \"nothing to change\", never \"done\" (§12)", async () => {
    commerce.listConsumables.mockResolvedValue([consumable("c-milk", "Milk")]);
    const done = await executeIntent(intent({ parameters: { item: "milk" } }), context());
    expect(commerce.createConsumable).not.toHaveBeenCalled();
    expect(done.ok && done.text).toMatch(/already on the .*nothing to add/);
    expect(done.ok && unchangedResult(done.result)).toBe(true);
  });

  it("\"make sure we have everything\" says it checked the list, because it cannot see the kitchen", async () => {
    commerce.listConsumables.mockResolvedValue([consumable("c-pasta", "Pasta")]);
    const done = await executeIntent(intent({ parameters: { items: ["pasta", "tomatoes", "basil"], forMeal: "Tomato pasta" } }), context());
    expect(done.ok && done.text).toMatch(/^I cannot see what is in the kitchen, so I checked what tomato pasta needs/);
    expect(done.ok && done.text).toMatch(/added \*\*Tomatoes\*\* and \*\*Basil\*\*; \*\*Pasta\*\* was already there/);
  });

  it("can be carried out with one item or several, and not with none", () => {
    expect(canExecute(intent({ parameters: { items: ["milk", "bananas"] } }))).toBe(true);
    expect(canExecute(intent({ parameters: { items: [] } }))).toBe(false);
  });
});

describe("a reminder (§10): real, to the speaker only, held until its time", () => {
  it("is a notification addressed to the speaker, scheduled in the household's timezone", async () => {
    const admin = fakeAdmin();
    const done = await executeIntent(
      intent({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: { what: "buy milk and bananas", when: "tomorrow" } }),
      context({ admin: admin.client }),
    );
    expect(done.ok && done.text).toMatch(/I will remind you tomorrow \(Thu 24 Sep\) at 9am to \*\*buy milk and bananas\*\*/);
    const insert = admin.writes.find((write) => write.op === "insert")!;
    expect(insert.table).toBe("notifications");
    expect(insert.row).toMatchObject({ recipient_member_id: "m-priya", type: "action", title: "Reminder: Buy milk and bananas" });
    // 09:00 in Kolkata is 03:30 UTC.
    expect(insert.row.scheduled_for).toBe("2026-09-24T03:30:00.000Z");
  });

  it("a part of the day starts at its window, and a said time wins", async () => {
    const admin = fakeAdmin();
    await executeIntent(intent({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: { what: "pack the kit", when: "tomorrow after school" } }), context({ admin: admin.client }));
    await executeIntent(intent({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: { what: "call the plumber", when: "friday", time: "6pm" } }), context({ admin: admin.client }));
    const [afterSchool, sixPm] = admin.writes.filter((write) => write.op === "insert").map((write) => write.row.scheduled_for);
    expect(afterSchool).toBe("2026-09-24T10:00:00.000Z");
    expect(sixPm).toBe("2026-09-25T12:30:00.000Z");
  });

  it("without the service client it says it could not, and claims nothing", async () => {
    const done = await executeIntent(intent({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: { what: "x", when: "tomorrow" } }), context());
    expect(done.ok).toBe(false);
  });
});

describe("a meal (§11): on the real plan, with its recipe's ingredients", () => {
  it("plans it through the Meals service and copies the recipe on", async () => {
    meals.createMeal.mockResolvedValue({ id: "meal-1" });
    meals.attachIngredients.mockResolvedValue({ attached: 4 });
    const done = await executeIntent(
      intent({
        action: "plan_meal",
        target: { kind: "outcome", reference: "meals" },
        parameters: { what: "pasta", mealName: "Tomato pasta", recipeId: "r-1", slot: "dinner", window: "tonight", windowResolved: { date: "2026-09-23", label: "tonight (Wed 23 Sep)" } },
      }),
      context(),
    );
    expect(meals.createMeal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "Tomato pasta", slot: "dinner", onDate: "2026-09-23", recipeId: "r-1", readyBy: "2026-09-23T14:30:00.000Z" }));
    expect(meals.attachIngredients).toHaveBeenCalledWith(expect.anything(), "hh-1", "meal-1", "r-1");
    expect(done.ok && done.text).toMatch(/^Planned \*\*Tomato pasta\*\* for dinner tonight/);
    expect(done.ok && focusFromResult("plan_meal", done.result, NOW.toISOString())).toEqual([expect.objectContaining({ entityType: "meal", entityId: "meal-1" })]);
  });

  it("with no recipe on record, it says it does not know what the meal needs", async () => {
    meals.createMeal.mockResolvedValue({ id: "meal-2" });
    const done = await executeIntent(
      intent({ action: "plan_meal", target: { kind: "outcome", reference: "meals" }, parameters: { what: "khichdi", slot: "dinner", whenResolved: { date: "2026-09-24", label: "tomorrow (Thu 24 Sep)" } } }),
      context(),
    );
    expect(meals.attachIngredients).not.toHaveBeenCalled();
    expect(done.ok && done.text).toMatch(/no recipe for it on record/);
  });
});

describe("correcting something already done (§9): undo through its own service, then the corrected one", () => {
  it("\"not milk, almond milk\" takes milk off and adds almond milk — both said", async () => {
    const done = await executeIntent(
      intent({ parameters: { item: "almond milk", corrects: { actionId: "a-1", actionType: "add_to_list", result: { consumableId: "c-milk", name: "Milk" } } } }),
      context(),
    );
    expect(commerce.retireConsumable).toHaveBeenCalledWith(expect.anything(), { id: "c-milk", householdId: "hh-1" });
    expect(commerce.createConsumable).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "Almond milk" }));
    expect(done.ok && done.text).toMatch(/^Took \*\*Milk\*\* off the .* Added \*\*Almond milk\*\*/);
    expect(done.ok && done.result.corrected).toBe("a-1");
  });

  it("what was on the list before HomeTalk touched it is never taken off", async () => {
    await executeIntent(
      intent({ parameters: { item: "almond milk", corrects: { actionId: "a-1", actionType: "add_to_list", result: { items: [{ name: "Milk", consumableId: "c-milk", alreadyTracked: true }, { name: "Bread", consumableId: "c-bread", alreadyTracked: false }] } } } }),
      context(),
    );
    expect(commerce.retireConsumable).toHaveBeenCalledTimes(1);
    expect(commerce.retireConsumable).toHaveBeenCalledWith(expect.anything(), { id: "c-bread", householdId: "hh-1" });
  });

  it("\"no, I meant Manan\" frees the first person's day before marking the second", async () => {
    helpers.recordAvailabilityException.mockResolvedValue(undefined);
    const done = await executeIntent(
      intent({
        action: "record_absence",
        target: { kind: "member", reference: "sunita" },
        parameters: { when: "tomorrow", corrects: { actionId: "a-2", actionType: "record_absence", result: { memberId: "m-asmi", memberName: "Asmi", onDate: "2026-09-24" } } },
      }),
      context(),
    );
    expect(helpers.recordAvailabilityException.mock.calls[0]![1]).toMatchObject({ memberId: "m-asmi", onDate: "2026-09-24", available: true });
    expect(helpers.recordAvailabilityException.mock.calls[1]![1]).toMatchObject({ memberId: "m-sunita", available: false });
    expect(done.ok && done.text).toMatch(/^\*\*Asmi\*\* is no longer marked away .* Noted — \*\*Sunita\*\* is away/);
  });

  it("what it cannot undo from here, it leaves exactly as it was", async () => {
    const done = await executeIntent(
      intent({ action: "plan_meal", target: { kind: "outcome", reference: "meals" }, parameters: { what: "pasta", whenResolved: { date: "2026-09-25" }, corrects: { actionId: "a-3", actionType: "plan_meal", result: { mealId: "meal-1" } } } }),
      context(),
    );
    expect(done.ok).toBe(false);
    expect(meals.createMeal).not.toHaveBeenCalled();
  });
});

describe("correcting one of several things (§9)", () => {
  it("\"not milk, almond milk\" after \"add milk and bananas\" swaps the milk and leaves the bananas alone", async () => {
    const done = await executeIntent(
      intent({
        parameters: {
          items: ["almond milk", "Bananas"],
          corrects: { actionId: "a-1", actionType: "add_to_list", result: { items: [{ name: "Milk", consumableId: "c-milk", alreadyTracked: false }, { name: "Bananas", consumableId: "c-ban", alreadyTracked: false }] } },
        },
      }),
      context(),
    );
    expect(commerce.retireConsumable).toHaveBeenCalledTimes(1);
    expect(commerce.retireConsumable).toHaveBeenCalledWith(expect.anything(), { id: "c-milk", householdId: "hh-1" });
    expect(commerce.createConsumable).toHaveBeenCalledTimes(1);
    expect(commerce.createConsumable).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "Almond milk" }));
    expect(done.ok && done.text).toBe("Took **Milk** off the [groceries](/groceries). Added **Almond milk** to the [groceries](/groceries). Once I see it bought a few times I will work out how often you need it.");
  });
});

describe("a reminder's wording", () => {
  it("a named day reads \"on Fri 25 Sep\"", async () => {
    const admin = fakeAdmin();
    const done = await executeIntent(intent({ action: "set_reminder", target: { kind: "outcome", reference: "reminders" }, parameters: { what: "buy jam", when: "friday" } }), context({ admin: admin.client }));
    expect(done.ok && done.text).toMatch(/^I will remind you on Fri 25 Sep at 9am/);
    expect(admin.writes[0]!.row.body).toBe("You asked HomeTalk to remind you on Fri 25 Sep.");
  });
});
