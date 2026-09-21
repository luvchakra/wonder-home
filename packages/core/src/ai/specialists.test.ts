import { describe, expect, it } from "vitest";

import type { HomeAssessment } from "../home/assessment";
import {
  billsSpecialist,
  coordinate,
  groceriesSpecialist,
  handoff,
  homeSpecialist,
  mealsSpecialist,
  petsSpecialist,
} from "./specialists";

const assessment = (over: Partial<HomeAssessment> = {}): HomeAssessment => ({
  subjectKey: "meal.dinner-1",
  title: "Dinner",
  status: "blocked",
  riskLevel: "medium",
  notable: true,
  reason: "Dinner needs milk.",
  action: { action: "shop_for_meal", target: "dinner-1" },
  dueOn: null,
  ...over,
});

describe("a specialist proposes for its own domain only", () => {
  it("meals hands a needed ingredient to groceries rather than acting on it", () => {
    const result = mealsSpecialist({ runId: "r-1", assessments: [assessment()], inbox: [] });
    expect(result.steps).toEqual([]);
    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0]).toMatchObject({ type: "grocery_list", producedBy: "meals", runId: "r-1" });
  });

  it("meals proposes its own step for a replan, not a handoff", () => {
    const result = mealsSpecialist({
      runId: "r-1",
      assessments: [assessment({ action: { action: "replan_meal", target: "dinner-1" } })],
      inbox: [],
    });
    expect(result.contracts).toEqual([]);
    expect(result.steps).toEqual([{ toolName: "outcomes.replan", rationale: "Dinner needs milk.", arguments: { outcomeKey: "meal.dinner-1" } }]);
  });

  it("ignores an assessment nobody needs to see", () => {
    const result = mealsSpecialist({ runId: "r-1", assessments: [assessment({ notable: false })], inbox: [] });
    expect(result).toEqual({ steps: [], contracts: [] });
  });

  it("ignores another domain's assessment entirely", () => {
    const result = mealsSpecialist({
      runId: "r-1",
      assessments: [assessment({ subjectKey: "asset.boiler-1" })],
      inbox: [],
    });
    expect(result).toEqual({ steps: [], contracts: [] });
  });

  it("pets hand a supply shortage to groceries the same way meals do", () => {
    const result = petsSpecialist({
      runId: "r-1",
      assessments: [
        assessment({
          subjectKey: "pet.milo-1.food",
          title: "Milo's food",
          action: { action: "order_supplies", target: "milo-1" },
        }),
      ],
      inbox: [],
    });
    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0]).toMatchObject({ type: "grocery_list", producedBy: "pets" });
  });

  it("home proposes booking a service directly, with nothing to hand off", () => {
    const result = homeSpecialist({
      runId: "r-1",
      assessments: [
        assessment({
          subjectKey: "asset.boiler-1",
          title: "Boiler",
          reason: "The boiler is overdue for service.",
          action: { action: "book_service", target: "boiler-1" },
        }),
      ],
      inbox: [],
    });
    expect(result.contracts).toEqual([]);
    expect(result.steps).toEqual([
      { toolName: "home.book_service", rationale: "The boiler is overdue for service.", arguments: { assetId: "boiler-1" } },
    ]);
  });

  it("bills only ever proposes the step — approval is authorizeToolCall's job, not this domain's", () => {
    const result = billsSpecialist({
      runId: "r-1",
      assessments: [
        assessment({
          subjectKey: "bill.electricity",
          title: "Electricity",
          reason: "Due tomorrow, nobody has paid it.",
          action: { action: "pay_bill", target: "electricity" },
        }),
      ],
      inbox: [],
    });
    expect(result.steps).toEqual([
      { toolName: "bills.pay", rationale: "Due tomorrow, nobody has paid it.", arguments: { billId: "electricity" } },
    ]);
  });
});

describe("groceries consolidates what it is handed", () => {
  it("does nothing when nothing was handed to it", () => {
    expect(groceriesSpecialist({ runId: "r-1", assessments: [], inbox: [] })).toEqual({ steps: [], contracts: [] });
  });

  it("turns two producers' contracts into one list, deduplicated", () => {
    const fromMeals = handoff("meals", "r-1", "grocery_list", {
      reason: "Dinner needs milk.",
      items: [{ name: "Milk", quantity: 1, unit: "litre" }],
    });
    const fromPets = handoff("pets", "r-1", "grocery_list", {
      reason: "Milo is low on food.",
      items: [
        { name: "Cat food", quantity: 1, unit: "supply" },
        { name: "Milk", quantity: 1, unit: "litre" },
      ],
    });

    const result = groceriesSpecialist({ runId: "r-1", assessments: [], inbox: [fromMeals, fromPets] });

    expect(result.steps.map((s) => s.arguments.name)).toEqual(["Milk", "Cat food"]);
  });

  it("never produces a contract of its own — it is where the chain ends", () => {
    const fromMeals = handoff("meals", "r-1", "grocery_list", { items: [{ name: "Milk", quantity: 1, unit: "litre" }] });
    expect(groceriesSpecialist({ runId: "r-1", assessments: [], inbox: [fromMeals] }).contracts).toEqual([]);
  });
});

describe("coordinating a full run", () => {
  it("decomposes a cross-domain goal into every domain's governed actions, in one plan", () => {
    const result = coordinate("r-1", [
      assessment({ subjectKey: "meal.dinner-1", reason: "Dinner needs milk.", action: { action: "shop_for_meal", target: "dinner-1" } }),
      assessment({
        subjectKey: "pet.milo-1.food",
        title: "Milo's food",
        reason: "Milo is low on food.",
        action: { action: "order_supplies", target: "milo-1" },
      }),
      assessment({
        subjectKey: "asset.boiler-1",
        title: "Boiler",
        reason: "The boiler is overdue for service.",
        action: { action: "book_service", target: "boiler-1" },
      }),
      assessment({
        subjectKey: "bill.electricity",
        title: "Electricity",
        reason: "Due tomorrow, nobody has paid it.",
        action: { action: "pay_bill", target: "electricity" },
      }),
    ]);

    // Groceries only knows to add these because meals and pets handed it the
    // need — this is the collaboration, not four domains acting alone.
    expect(result.steps.map((s) => s.toolName)).toEqual(["home.book_service", "bills.pay", "list.add_item", "list.add_item"]);
    expect(result.contracts).toHaveLength(2);
    expect(new Set(result.contracts.map((c) => c.producedBy))).toEqual(new Set(["meals", "pets"]));
  });

  it("is silent when nothing is notable — normal routines produce an empty plan", () => {
    const result = coordinate("r-1", [assessment({ notable: false })]);
    expect(result.steps).toEqual([]);
    expect(result.contracts).toEqual([]);
  });

  it("every contract carries the run it belongs to, so a step can be traced back", () => {
    const result = coordinate("r-2", [
      assessment({ subjectKey: "meal.dinner-1", action: { action: "shop_for_meal", target: "dinner-1" } }),
    ]);
    expect(result.contracts.every((c) => c.runId === "r-2")).toBe(true);
  });
});
