import { sanitizeIntakeExtraction, type IntakeExtraction } from "./classify-intake";

/**
 * Golden scenario evaluations for HomeSend's classifier (Phase 6 hardening).
 *
 * `classifyIntake()` itself calls a live model — nothing here calls one.
 * What these scenarios evaluate is `sanitizeIntakeExtraction()`, the
 * deterministic backstop that runs on every provider's output: a
 * hallucinated field the model's own kind doesn't own (a `billKind` on a
 * `grocery_item`, a `secondary` proposal on `unknown`) is nulled out here,
 * in code, before the confirm screen ever shows it — the same
 * "policy decides, the model only proposes" discipline `evaluations.ts`
 * already documents for the conversation engine.
 */

export type ClassifyIntakeScenario = {
  id: string;
  description: string;
  /** What a provider's structured output claimed — possibly inconsistent with its own `kind`. */
  raw: IntakeExtraction;
  expected: IntakeExtraction;
};

function extraction(over: Partial<IntakeExtraction>): IntakeExtraction {
  return {
    readable: true,
    kind: "unknown",
    title: null,
    notes: null,
    billKind: null,
    payee: null,
    amount: null,
    currency: null,
    dueDate: null,
    schoolKind: null,
    subject: null,
    quantity: null,
    unit: null,
    category: null,
    healthRecordType: null,
    documentDate: null,
    subjectMemberName: null,
    secondary: null,
    ...over,
  };
}

export const CLASSIFY_INTAKE_SCENARIOS: readonly ClassifyIntakeScenario[] = [
  {
    id: "CI-01",
    description: "A clean bill extraction passes through untouched.",
    raw: extraction({
      kind: "bill",
      title: "Electricity bill",
      billKind: "utility",
      payee: "City Power",
      amount: 120.5,
      currency: "USD",
      dueDate: "2026-10-01",
    }),
    expected: extraction({
      kind: "bill",
      title: "Electricity bill",
      billKind: "utility",
      payee: "City Power",
      amount: 120.5,
      currency: "USD",
      dueDate: "2026-10-01",
    }),
  },
  {
    id: "CI-02",
    description: "A grocery item hallucinated with bill fields has them stripped.",
    raw: extraction({
      kind: "grocery_item",
      title: "Milk",
      quantity: 2,
      unit: "litre",
      billKind: "utility",
      amount: 120.5,
      dueDate: "2026-10-01",
    }),
    expected: extraction({
      kind: "grocery_item",
      title: "Milk",
      quantity: 2,
      unit: "litre",
    }),
  },
  {
    id: "CI-03",
    description: "A school item hallucinated with grocery fields has them stripped.",
    raw: extraction({
      kind: "school_item",
      title: "Science worksheet",
      schoolKind: "homework",
      subject: "Science",
      quantity: 3,
      unit: "kg",
      category: "produce",
    }),
    expected: extraction({
      kind: "school_item",
      title: "Science worksheet",
      schoolKind: "homework",
      subject: "Science",
    }),
  },
  {
    id: "CI-04",
    description: "A secondary proposal on a grocery_item is dropped — secondary only ever belongs to bill or school_item.",
    raw: extraction({
      kind: "grocery_item",
      title: "Paper towels",
      quantity: 1,
      unit: "pack",
      secondary: { reason: "Hallucinated — groceries never get a secondary.", title: "Should not survive" },
    }),
    expected: extraction({
      kind: "grocery_item",
      title: "Paper towels",
      quantity: 1,
      unit: "pack",
    }),
  },
  {
    id: "CI-05",
    description: "A secondary proposal on unknown is dropped.",
    raw: extraction({
      kind: "unknown",
      title: "Blurry photo",
      secondary: { reason: "Hallucinated on unknown.", title: "Should not survive" },
    }),
    expected: extraction({ kind: "unknown", title: "Blurry photo" }),
  },
  {
    id: "CI-06",
    description: "A legitimate secondary proposal on a school_item survives.",
    raw: extraction({
      kind: "school_item",
      title: "Sports day notice",
      schoolKind: "event",
      secondary: { reason: "Sports day asks for a white T-shirt.", title: "White T-shirt" },
    }),
    expected: extraction({
      kind: "school_item",
      title: "Sports day notice",
      schoolKind: "event",
      secondary: { reason: "Sports day asks for a white T-shirt.", title: "White T-shirt" },
    }),
  },
  {
    id: "CI-07",
    description: "Unreadable content is nulled to a bare unknown, whatever else the model claimed.",
    raw: extraction({
      readable: false,
      kind: "bill",
      title: "Guessed title",
      billKind: "utility",
      amount: 50,
      secondary: { reason: "Should not survive.", title: "Should not survive" },
    }),
    expected: extraction({ readable: false, kind: "unknown" }),
  },
  {
    id: "CI-08",
    description: "A bill with no hallucinated fields at all is unchanged, including a null secondary.",
    raw: extraction({ kind: "bill", title: "Rent", billKind: "rent", amount: 1500, currency: "USD" }),
    expected: extraction({ kind: "bill", title: "Rent", billKind: "rent", amount: 1500, currency: "USD" }),
  },
  {
    id: "CI-09",
    description: "A clean health_document extraction passes through untouched.",
    raw: extraction({
      kind: "health_document",
      title: "Blood test results",
      healthRecordType: "lab_result",
      documentDate: "2026-09-15",
      subjectMemberName: "Aarav",
    }),
    expected: extraction({
      kind: "health_document",
      title: "Blood test results",
      healthRecordType: "lab_result",
      documentDate: "2026-09-15",
      subjectMemberName: "Aarav",
    }),
  },
  {
    id: "CI-10",
    description: "A health_document hallucinated with bill and grocery fields has them stripped.",
    raw: extraction({
      kind: "health_document",
      title: "Vaccination card",
      healthRecordType: "vaccination_certificate",
      billKind: "utility",
      amount: 120.5,
      quantity: 2,
      unit: "kg",
    }),
    expected: extraction({
      kind: "health_document",
      title: "Vaccination card",
      healthRecordType: "vaccination_certificate",
    }),
  },
  {
    id: "CI-11",
    description: "A secondary proposal on health_document is dropped — secondary only ever belongs to bill or school_item.",
    raw: extraction({
      kind: "health_document",
      title: "Discharge summary",
      healthRecordType: "discharge_summary",
      secondary: { reason: "Hallucinated — health documents never get a secondary.", title: "Should not survive" },
    }),
    expected: extraction({ kind: "health_document", title: "Discharge summary", healthRecordType: "discharge_summary" }),
  },
] as const;

export type ClassifyIntakeEvaluationResult = {
  scenario: ClassifyIntakeScenario;
  actual: IntakeExtraction;
  passed: boolean;
};

export function evaluateAllClassifyIntake(
  scenarios: readonly ClassifyIntakeScenario[] = CLASSIFY_INTAKE_SCENARIOS,
): ClassifyIntakeEvaluationResult[] {
  return scenarios.map((scenario) => {
    const actual = sanitizeIntakeExtraction(scenario.raw);
    return { scenario, actual, passed: JSON.stringify(actual) === JSON.stringify(scenario.expected) };
  });
}
