import type { HomeAssessment } from "../home/assessment";
import { authorizeToolCall, type ToolCallContext } from "./tools";
import { coordinate } from "./specialists";

/**
 * Multi-agent evaluation fixtures (story 14-007).
 *
 * `evaluations.ts` covers what a single deterministic decision should be.
 * These scenarios cover what happens once several specialists have to
 * decompose one household goal together — a realistic morning check that
 * touches meals, pets, an asset and a bill at once, an ambiguous case where
 * two domains hand off to the same list, a routine day nothing should
 * interrupt, and an unsafe action a specialist proposes but the tool gate
 * still has the last word on. Every check runs against `coordinate()` and
 * `authorizeToolCall()` — the real deterministic policy — never a model.
 */

export type MultiAgentCategory =
  | "cross_domain_handoff"
  | "notification_suppression"
  | "ambiguous_request"
  | "unsafe_action";

export type MultiAgentScenario = {
  id: string;
  category: MultiAgentCategory;
  description: string;
  assessments: HomeAssessment[];
  /** Present only for the unsafe-action category, where a proposed step needs checking. */
  actor?: ToolCallContext;
};

function assessment(over: Partial<HomeAssessment>): HomeAssessment {
  return {
    subjectKey: "meal.x",
    title: "x",
    status: "blocked",
    riskLevel: "medium",
    notable: true,
    reason: "",
    action: null,
    dueOn: null,
    ...over,
  };
}

export const MULTI_AGENT_SCENARIOS: readonly MultiAgentScenario[] = [
  {
    id: "MA-01",
    category: "cross_domain_handoff",
    description: "A morning check finds a meal short an ingredient and a pet low on food; both go on one list.",
    assessments: [
      assessment({
        subjectKey: "meal.dinner-1",
        title: "Dinner",
        reason: "Dinner needs milk.",
        action: { action: "shop_for_meal", target: "dinner-1" },
      }),
      assessment({
        subjectKey: "pet.milo-1.food",
        title: "Milo's food",
        reason: "Milo is low on food.",
        action: { action: "order_supplies", target: "milo-1" },
      }),
    ],
  },
  {
    id: "MA-02",
    category: "ambiguous_request",
    description:
      "A boiler is overdue, a bill is due tomorrow, and a meal is short an ingredient, all at once — three domains, three different governed actions, decomposed from one goal without conflating them.",
    assessments: [
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
      assessment({
        subjectKey: "meal.lunch-1",
        title: "Lunch",
        reason: "Lunch needs rice.",
        action: { action: "shop_for_meal", target: "lunch-1" },
      }),
    ],
  },
  {
    id: "MA-03",
    category: "notification_suppression",
    description: "Every domain is on track — a normal day produces an empty plan, not a plan with nothing to do.",
    assessments: [
      assessment({ subjectKey: "meal.dinner-1", notable: false }),
      assessment({ subjectKey: "pet.milo-1.food", notable: false }),
      assessment({ subjectKey: "asset.boiler-1", notable: false }),
    ],
  },
  {
    id: "MA-04",
    category: "unsafe_action",
    description: "A specialist proposes paying a bill; the tool gate still requires approval, whoever is asking.",
    assessments: [
      assessment({
        subjectKey: "bill.electricity",
        title: "Electricity",
        reason: "Due tomorrow, nobody has paid it.",
        action: { action: "pay_bill", target: "electricity" },
      }),
    ],
    actor: {
      actor: { roles: ["head"] },
      actorHouseholdId: "h-1",
      targetHouseholdId: "h-1",
      autonomy: "prepare",
      entitled: true,
    },
  },
  {
    id: "MA-05",
    category: "unsafe_action",
    description: "A specialist proposes booking a service the actor has no permission to book; the gate refuses it.",
    assessments: [
      assessment({
        subjectKey: "asset.boiler-1",
        title: "Boiler",
        reason: "The boiler is overdue for service.",
        action: { action: "book_service", target: "boiler-1" },
      }),
    ],
    actor: {
      actor: { roles: ["adult"] },
      actorHouseholdId: "h-1",
      targetHouseholdId: "h-1",
      autonomy: "execute",
      entitled: true,
    },
  },
] as const;

export type MultiAgentResult = {
  scenario: MultiAgentScenario;
  stepCount: number;
  contractCount: number;
  toolNames: string[];
  /** Only set for an unsafe_action scenario: whether the gate let the proposed step through unattended. */
  gateAllowedUnattended: boolean | null;
  passed: boolean;
};

/**
 * Runs every scenario through the real coordination and tool gate, and
 * checks the property the category names — never a fixed expected plan,
 * because the plan's exact shape is what `specialists.test.ts` already
 * pins down.
 */
export function evaluateMultiAgent(
  scenarios: readonly MultiAgentScenario[] = MULTI_AGENT_SCENARIOS,
): MultiAgentResult[] {
  return scenarios.map((scenario) => {
    const { steps, contracts } = coordinate(scenario.id, scenario.assessments);
    const toolNames = steps.map((step) => step.toolName);

    let gateAllowedUnattended: boolean | null = null;
    let passed: boolean;

    switch (scenario.category) {
      case "cross_domain_handoff":
        // Two producers, one consolidated consumer step each — the handoff happened.
        passed = contracts.length >= 2 && toolNames.filter((name) => name === "list.add_item").length === contracts.length;
        break;
      case "ambiguous_request":
        // Three domains, three distinct governed tools, none conflated into another.
        passed = new Set(toolNames).size === toolNames.length && toolNames.length >= 3;
        break;
      case "notification_suppression":
        passed = steps.length === 0 && contracts.length === 0;
        break;
      case "unsafe_action": {
        const step = steps[0];
        const authorization = step && scenario.actor
          ? authorizeToolCall(step.toolName, scenario.actor)
          : null;
        gateAllowedUnattended = authorization?.allowed === true && authorization.requiresApproval === false;
        passed = gateAllowedUnattended === false;
        break;
      }
    }

    return { scenario, stepCount: steps.length, contractCount: contracts.length, toolNames, gateAllowedUnattended, passed };
  });
}
