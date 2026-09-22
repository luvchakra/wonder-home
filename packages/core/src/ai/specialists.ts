import type { HomeAssessment } from "../home/assessment";
import { type Contract, type ContractType, type PlannedStep } from "./orchestrator";

/**
 * Specialist agents (story 14-007).
 *
 * A specialist is a named planner for one domain: given the household's
 * current assessed state — the same `HomeAssessment[]` module 13's meals,
 * assets, laundry and pet-care assessors already produce — it proposes
 * `PlannedStep`s for the *existing* governed tool registry (`tools.ts`). A
 * specialist never calls a tool itself, so `authorizeToolCall` stays the one
 * place a step is allowed to happen; a specialist only ever proposes.
 *
 * Some domains cannot finish their own job: a meal missing milk and a cat
 * needing food both resolve to "put it on the shopping list", and a
 * household has one list, not one per domain that happened to need it. A
 * contract is how a specialist hands off work it identified but cannot
 * itself complete — a small, typed payload, never raw model text, stamped
 * with which specialist produced it and which run it belongs to so any step
 * it led to can be traced back to why it exists.
 */

export const SPECIALIST_NAMES = ["meals", "pets", "home", "health", "bills", "groceries"] as const;
export type SpecialistName = (typeof SPECIALIST_NAMES)[number];

export type SpecialistGoal = {
  runId: string;
  /** The household's current assessed state, across every domain. */
  assessments: readonly HomeAssessment[];
  /** Contracts specialists earlier in this run's order have already produced. */
  inbox: readonly Contract[];
};

export type SpecialistResult = {
  steps: PlannedStep[];
  contracts: Contract[];
};

export type Specialist = (goal: SpecialistGoal) => SpecialistResult;

/** Stamps a contract with provenance. A specialist never invents these fields itself. */
export function handoff(
  producedBy: SpecialistName,
  runId: string,
  type: ContractType,
  payload: Record<string, unknown>,
): Contract {
  return { id: `${runId}:${producedBy}:${type}`, type, producedBy, runId, payload };
}

const EMPTY: SpecialistResult = { steps: [], contracts: [] };

/**
 * A domain's own notable assessments, keyed by its `subjectKey` prefix — the
 * one thing every module-13 assessor already agrees on.
 */
function forDomain(assessments: readonly HomeAssessment[], prefix: string): HomeAssessment[] {
  return assessments.filter((a) => a.notable && a.subjectKey.startsWith(`${prefix}.`));
}

/**
 * Meals (module 10): a meal that needs shopping cannot shop for itself, so it
 * hands the need to groceries rather than acting on it. Everything else about
 * a meal — replanning, finding a cook — stays inside this domain.
 */
export const mealsSpecialist: Specialist = ({ runId, assessments }) => {
  const steps: PlannedStep[] = [];
  const contracts: Contract[] = [];

  for (const meal of forDomain(assessments, "meal")) {
    const action = meal.action?.action;
    if (action === "shop_for_meal") {
      contracts.push(
        handoff("meals", runId, "grocery_list", {
          reason: meal.reason,
          items: [{ name: meal.title, quantity: 1, unit: "meal's worth" }],
        }),
      );
    } else if (action === "replan_meal" || action === "substitute" || action === "find_cook") {
      steps.push({
        toolName: "outcomes.replan",
        rationale: meal.reason,
        arguments: { outcomeKey: meal.subjectKey },
      });
    }
  }

  return contracts.length === 0 && steps.length === 0 ? EMPTY : { steps, contracts };
};

/**
 * Pet care (module 09): supplies running out is the same shopping problem a
 * meal has, and goes to the same list rather than a pet-only one.
 */
export const petsSpecialist: Specialist = ({ runId, assessments }) => {
  const contracts: Contract[] = [];

  for (const pet of forDomain(assessments, "pet")) {
    if (pet.action?.action === "order_supplies") {
      contracts.push(
        handoff("pets", runId, "grocery_list", {
          reason: pet.reason,
          items: [{ name: pet.title, quantity: 1, unit: "supply" }],
        }),
      );
    }
  }

  return contracts.length === 0 ? EMPTY : { steps: [], contracts };
};

/**
 * Home assets (module 13): a service request is this domain's own to raise —
 * nothing downstream needs to know about it before it happens.
 */
export const homeSpecialist: Specialist = ({ assessments }) => {
  const steps: PlannedStep[] = [];

  for (const asset of forDomain(assessments, "asset")) {
    if (asset.action?.action === "book_service") {
      steps.push({
        toolName: "home.book_service",
        rationale: asset.reason,
        arguments: { assetId: asset.action.target },
      });
    }
  }

  return steps.length === 0 ? EMPTY : { steps, contracts: [] };
};

/**
 * Health (story 21-006): an overdue checkup is the one health item this
 * pipeline acts on — a booked appointment or an open issue is something a
 * person already knows about and is tracking, but an overdue checkup nobody
 * has rebooked is exactly the kind of quiet drift the household agents exist
 * to catch. Only ever proposes `health.notify_overdue` — telling someone,
 * never diagnosing, never writing a health record — and the tool itself is
 * gated by `health.manage`, the same permission HomeTalk's own health rules
 * require.
 */
export const healthSpecialist: Specialist = ({ assessments }) => {
  const steps: PlannedStep[] = [];

  for (const checkup of forDomain(assessments, "checkup")) {
    if (checkup.status === "at_risk") {
      steps.push({
        toolName: "health.notify_overdue",
        rationale: checkup.reason,
        arguments: { checkupId: checkup.subjectKey.replace("checkup.", "") },
      });
    }
  }

  return steps.length === 0 ? EMPTY : { steps, contracts: [] };
};

/**
 * Bills (module 11): paying is always a step-up action, so this domain only
 * ever proposes the step — `authorizeToolCall` is what actually requires the
 * approval.
 */
export const billsSpecialist: Specialist = ({ assessments }) => {
  const steps: PlannedStep[] = [];

  for (const bill of forDomain(assessments, "bill")) {
    if (bill.action?.action === "pay_bill") {
      steps.push({
        toolName: "bills.pay",
        rationale: bill.reason,
        arguments: { billId: bill.action.target },
      });
    }
  }

  return steps.length === 0 ? EMPTY : { steps, contracts: [] };
};

/**
 * Groceries (module 09): the one specialist whose job is entirely other
 * specialists' contracts. It consolidates every `grocery_list` handed to it
 * into one list rather than one call per producer, because a shopper reading
 * three near-duplicate entries for "cat food" is worse served than one.
 */
export const groceriesSpecialist: Specialist = ({ inbox }) => {
  const lists = inbox.filter((c) => c.type === "grocery_list");
  if (lists.length === 0) return EMPTY;

  const seen = new Set<string>();
  const steps: PlannedStep[] = [];
  for (const contract of lists) {
    const items = (contract.payload.items as { name: string; quantity: number; unit: string }[] | undefined) ?? [];
    for (const item of items) {
      const key = `${item.name}:${item.unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      steps.push({
        toolName: "list.add_item",
        rationale: (contract.payload.reason as string | undefined) ?? `Needed for ${item.name}.`,
        arguments: { name: item.name, quantity: item.quantity, unit: item.unit },
      });
    }
  }

  return { steps, contracts: [] };
};

export const SPECIALISTS: Record<SpecialistName, Specialist> = {
  meals: mealsSpecialist,
  pets: petsSpecialist,
  home: homeSpecialist,
  health: healthSpecialist,
  bills: billsSpecialist,
  groceries: groceriesSpecialist,
};

/** The order specialists run in: producers of a contract before its consumer. */
export const COORDINATION_ORDER: readonly SpecialistName[] = ["meals", "pets", "home", "health", "bills", "groceries"];

/**
 * Decomposes a household goal into governed domain actions across
 * specialists (story 14-007).
 *
 * Each specialist sees every contract produced by the ones that ran before
 * it, so groceries — last in the order — sees everything meals and pets
 * handed off. The result is one ordered plan and one full record of what was
 * handed off, both of which become part of the `AgentRun` and are recorded
 * whether or not any step goes on to execute.
 */
export function coordinate(
  runId: string,
  assessments: readonly HomeAssessment[],
  order: readonly SpecialistName[] = COORDINATION_ORDER,
): { steps: PlannedStep[]; contracts: Contract[] } {
  const steps: PlannedStep[] = [];
  const contracts: Contract[] = [];
  let inbox: readonly Contract[] = [];

  for (const name of order) {
    const result = SPECIALISTS[name]({ runId, assessments, inbox });
    steps.push(...result.steps);
    contracts.push(...result.contracts);
    inbox = [...inbox, ...result.contracts];
  }

  return { steps, contracts };
}
