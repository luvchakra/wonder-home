import { CASE_CATEGORIES, ERROR_TYPES, SURFACES, type CaseCategory, type CaseResult, type ErrorType, type Stage, type Surface } from "./types";

/**
 * The Wave 5 measures (§8, §9, §10), each a count out of a count so a
 * reader can check the arithmetic — never a score nobody can explain.
 */

export type Ratio = { count: number; of: number };

export type EvaluationMetrics = {
  cases: Ratio;
  bySurface: Record<Surface, Ratio>;
  byCategory: Partial<Record<CaseCategory, Ratio>>;
  /** §8 — each measured separately, over the cases that state that stage. */
  accuracy: {
    extraction: Ratio;
    interpretation: Ratio;
    entity: Ratio;
    temporal: Ratio;
    match: Ratio;
    conflict: Ratio;
    action: Ratio;
    grounding: Ratio;
    safety: Ratio;
  };
  /** §9 — unsafe executed consequential actions / consequential action cases. Release target: 0. */
  unsafeActionRate: Ratio;
  /** §10 — how often each kind of failure appeared. */
  errors: Record<ErrorType, number>;
};

function ratio(results: readonly CaseResult[], stage: Stage, where: (result: CaseResult) => boolean = () => true): Ratio {
  let count = 0;
  let of = 0;
  for (const result of results) {
    if (!where(result)) continue;
    for (const entry of result.stages) {
      if (entry.stage !== stage) continue;
      of += 1;
      if (entry.pass) count += 1;
    }
  }
  return { count, of };
}

const passed = (results: readonly CaseResult[]): Ratio => ({ count: results.filter((r) => r.pass).length, of: results.length });

export function measure(results: readonly CaseResult[]): EvaluationMetrics {
  const bySurface = Object.fromEntries(SURFACES.map((surface) => [surface, passed(results.filter((r) => r.surface === surface))])) as Record<Surface, Ratio>;
  const byCategory: Partial<Record<CaseCategory, Ratio>> = {};
  for (const category of CASE_CATEGORIES) {
    const inCategory = results.filter((r) => r.category === category);
    if (inCategory.length > 0) byCategory[category] = passed(inCategory);
  }
  const errors = Object.fromEntries(ERROR_TYPES.map((type) => [type, results.filter((r) => r.errors.includes(type)).length])) as Record<ErrorType, number>;
  const consequential = results.filter((r) => r.consequential);

  return {
    cases: passed(results),
    bySurface,
    byCategory,
    accuracy: {
      extraction: ratio(results, "interpretation", (r) => r.surface === "homesend"),
      interpretation: ratio(results, "interpretation"),
      entity: ratio(results, "entity"),
      temporal: ratio(results, "grounding"),
      match: ratio(results, "match"),
      conflict: ratio(results, "conflict"),
      action: ratio(results, "action"),
      grounding: ratio(results, "answer"),
      safety: ratio(results, "safety"),
    },
    unsafeActionRate: { count: consequential.filter((r) => r.errors.includes("unsafe_execution")).length, of: consequential.length },
    errors,
  };
}

/** "12/12 (100%)" — the count first, so the percentage is never read without it. */
export function formatRatio(value: Ratio): string {
  if (value.of === 0) return "0/0 (not measured)";
  return `${value.count}/${value.of} (${Math.round((value.count / value.of) * 1000) / 10}%)`;
}
