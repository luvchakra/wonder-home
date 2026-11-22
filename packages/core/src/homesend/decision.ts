import { z } from "zod";
import type { IntakeExtraction } from "../ai/classify-intake";
import { CAPABILITIES, capability, type CapabilityId, type SafetyClass } from "./capabilities";
import type { PaymentProof } from "./payment-proof";

/**
 * HomeSend's one decision (owner, 2026-11-22: "it should be able to decide
 * what to do with incoming info by applying ai algorithms and take
 * decisions"). The model says what an item is (free words, plus the nearest
 * known kind, so kinds nobody anticipated are allowed) and which operations
 * over the capability registry it calls for, each with its evidence and
 * confidence. The code then validates every operation against its schema,
 * grounds it against what was sent and the household's records, and applies
 * the guardrails the owner's request did not change (`validateDecision`).
 * Only accepted operations are ever executed, through the governed writes.
 *
 * Design: `docs/design/2026-11-22-homesend-ai-decides.md`.
 */

const EvidenceSchema = z.object({
  field: z.string().trim().min(1).max(40),
  /** The exact words in what was sent. */
  quote: z.string().trim().max(240).nullable(),
  /** Or a household record the value came from (one handed to the model as context). */
  recordId: z.string().trim().max(80).nullable(),
});

export const DecisionOperationSchema = z.object({
  op: z.enum(["create", "update", "attach"]),
  capability: z.string().trim().min(1).max(40),
  /** For update/attach: the record it is about, by an id handed to the model. Never invented. */
  ref: z.string().trim().max(80).nullable(),
  fields: z.record(z.string(), z.unknown()),
  /** Who it is for, exactly as written ("Asmi", "Class 5B") — resolved by WonderHome, never an id. */
  forPerson: z.string().trim().max(80).nullable(),
  evidence: z.array(EvidenceSchema).max(20),
  confidence: z.number().min(0).max(1),
});
export type DecisionOperation = z.infer<typeof DecisionOperationSchema>;

export const HomeSendDecisionSchema = z.object({
  /** What it is, in plain words ("a society maintenance notice"). */
  whatIs: z.string().trim().min(1).max(160),
  /** The closest capability, or "note" when nothing fits. */
  nearestKind: z.string().trim().min(1).max(40),
  /** A short name for a kind the registry has no capability for ("society notice"); null otherwise. */
  newKind: z.string().trim().max(60).nullable(),
  operations: z.array(DecisionOperationSchema).max(20),
  /** At most one question, only when a wrong guess would matter. */
  question: z.object({ text: z.string().trim().min(1).max(200), options: z.array(z.string().trim().min(1).max(80)).max(4) }).nullable(),
});
export type HomeSendDecision = z.infer<typeof HomeSendDecisionSchema> & {
  /** Where the decision came from: the model's own decision, today's reading expressed as one, or a learned rule. */
  source: "model" | "reading" | "learned_rule";
};

export type OperationVerdict =
  | { status: "accepted"; safety: SafetyClass; dropped: string[] }
  | { status: "needs_consent"; safety: "action" }
  | { status: "unresolved"; reason: "no_reference" }
  | { status: "rejected"; reason: "unknown_capability" | "unsupported_op" | "invalid_fields" | "missing_required" | "not_in_what_was_sent" | "unknown_reference" };

export type ValidatedDecision = HomeSendDecision & {
  verdicts: OperationVerdict[];
  /** Operations that may be executed (accepted), in order. */
  accepted: number[];
};

export type DecisionContext = {
  /** What was sent, as text, when it was text (a photo's words are not known to WonderHome). */
  sourceText: string | null;
  /** Ids of the household records handed to the model as context. */
  knownRecordIds: ReadonlySet<string>;
  /** The content tried to instruct WonderHome (`injection.ts`). */
  injectionFlagged: boolean;
  /** The sender is on "Who may file health records for others" (`health-filers.ts`). */
  healthFiler: boolean;
};

const fold = (value: string) => value.toLowerCase().normalize("NFKC").replace(/[\s ]+/g, " ").replace(/[“”"'’‘]/g, "").trim();

/** Whether a quote is in what was sent; true when there is no text to check against (a photo). */
function quoted(quote: string, sourceText: string | null): boolean {
  if (sourceText === null) return true;
  const needle = fold(quote);
  return needle.length === 0 || fold(sourceText).includes(needle);
}

/** A model's confidence is never above what an injected item may earn. */
const INJECTED_CEILING = 0.6;

/**
 * Every guardrail the owner's request left in place, after the model decides:
 * schema per capability, grounding against what was sent and the household's
 * records, actions held for a yes, money and health under their own rules,
 * and who a health record is for never taken from a model.
 */
export function validateDecision(decision: HomeSendDecision, context: DecisionContext): ValidatedDecision {
  const verdicts: OperationVerdict[] = [];
  const operations: DecisionOperation[] = [];
  for (const raw of decision.operations) {
    const op: DecisionOperation = { ...raw, fields: { ...raw.fields }, confidence: context.injectionFlagged ? Math.min(raw.confidence, INJECTED_CEILING) : raw.confidence };
    const cap = capability(op.capability);
    operations.push(op);
    if (!cap) {
      verdicts.push({ status: "rejected", reason: "unknown_capability" });
      continue;
    }
    if (!cap.ops.includes(op.op)) {
      verdicts.push({ status: "rejected", reason: "unsupported_op" });
      continue;
    }
    // Only the capability's own fields; anything else is dropped, never passed on.
    const shape = cap.fields.shape;
    const dropped = Object.keys(op.fields).filter((key) => !(key in shape));
    for (const key of dropped) delete op.fields[key];
    for (const [key, value] of Object.entries(op.fields)) if (value === null || value === undefined || value === "") delete op.fields[key];
    const parsed = cap.fields.partial().safeParse(op.fields);
    if (!parsed.success) {
      verdicts.push({ status: "rejected", reason: "invalid_fields" });
      continue;
    }
    if (op.op === "create" && cap.required.some((key) => op.fields[key] === undefined)) {
      verdicts.push({ status: "rejected", reason: "missing_required" });
      continue;
    }
    // A reading naming something not in what was sent adds nothing.
    const quotes = op.evidence.filter((evidence) => evidence.quote);
    const records = op.evidence.filter((evidence) => evidence.recordId);
    const groundedQuotes = quotes.every((evidence) => quoted(evidence.quote ?? "", context.sourceText));
    const groundedRecords = records.every((evidence) => context.knownRecordIds.has(evidence.recordId ?? ""));
    const unevidenced = decision.source === "model" && quotes.length === 0 && records.length === 0 && context.sourceText !== null;
    if (!groundedQuotes || !groundedRecords || unevidenced) {
      verdicts.push({ status: "rejected", reason: "not_in_what_was_sent" });
      continue;
    }
    if (op.op !== "create") {
      if (!op.ref) {
        verdicts.push({ status: "unresolved", reason: "no_reference" });
        continue;
      }
      if (!context.knownRecordIds.has(op.ref)) {
        verdicts.push({ status: "rejected", reason: "unknown_reference" });
        continue;
      }
    }
    if (cap.safety === "action") {
      verdicts.push({ status: "needs_consent", safety: "action" });
      continue;
    }
    // Who a health document is for is never filled by a model (only a health filer's named member, resolved by WonderHome).
    if (cap.safety === "health" && op.forPerson && !context.healthFiler) {
      op.forPerson = null;
      dropped.push("forPerson");
    }
    verdicts.push({ status: "accepted", safety: cap.safety, dropped });
  }
  const question = decision.question && decision.question.options.length <= 4 ? decision.question : null;
  return {
    ...decision,
    operations,
    question,
    verdicts,
    accepted: verdicts.flatMap((verdict, index) => (verdict.status === "accepted" ? [index] : [])),
  };
}

const CONFIDENCE = { high: 0.95, medium: 0.75, low: 0.5 } as const;

const DOMAIN_CAPABILITY: Record<string, CapabilityId> = { bill: "bill", school_item: "school_item", grocery_item: "to_buy" };

function compact(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

/**
 * Today's reading expressed as a decision (no visible change, 14-081): the
 * kind and its per-kind special cases become operations over the registry,
 * so every item carries one decision whichever path read it.
 */
export function decisionFromReading(reading: IntakeExtraction, payment?: PaymentProof | null): HomeSendDecision {
  const confidence = CONFIDENCE[reading.confidence];
  const title = reading.title ?? reading.summary ?? "Something sent in";
  const quoteOf = (value: string | null | undefined) => (value ? [{ field: "title", quote: value, recordId: null }] : []);
  const operations: DecisionOperation[] = [];
  const op = (capabilityId: CapabilityId, fields: Record<string, unknown>, extra: Partial<DecisionOperation> = {}): DecisionOperation => ({
    op: "create", capability: capabilityId, ref: null, fields: compact(fields), forPerson: null, evidence: [], confidence, ...extra,
  });
  const headline = { title, notes: reading.notes ?? undefined };

  if (payment) {
    operations.push(op("payment", { title: payment.payee ? `Paid ${payment.payee}` : title, payee: payment.payee, amount: payment.amount, currency: payment.currency, paidOn: payment.paidOn }, { op: "attach" }));
  } else if ((reading.records ?? []).length >= 2) {
    // A document of several records (DDU 2.0): each is its own operation, below.
  } else if (reading.schedule && reading.schedule.rows.length > 0) {
    // A timetable: one exam per dated row, expanded by `timetable.ts` against the class on record.
    operations.push(op("exam", { ...headline, title: reading.schedule.title ?? title }));
  } else if (reading.syllabus) {
    // A syllabus or portion list is ABOUT an exam (`exam-match.ts` finds which).
    operations.push(op("exam_portion", { ...headline }, { op: "attach" }));
  } else {
    switch (reading.kind) {
      case "bill":
        operations.push(op("bill", { ...headline, payee: reading.payee, amount: reading.amount, currency: reading.currency, dueDate: reading.dueDate, billKind: reading.billKind }));
        break;
      case "receipt":
        operations.push(op("receipt", { ...headline, merchant: reading.merchant, amount: reading.amount, currency: reading.currency, documentDate: reading.documentDate }));
        break;
      case "school_item":
        operations.push(op(reading.schoolKind === "exam" ? "exam" : "school_item", { ...headline, schoolKind: reading.schoolKind, subject: reading.subject, dueDate: reading.dueDate, location: reading.location }));
        break;
      case "activity_item":
        operations.push(op("activity_item", { ...headline, subject: reading.subject, activityKind: reading.activityKind, dueDate: reading.dueDate, location: reading.location }));
        break;
      case "event":
        operations.push(op("event", { ...headline, dueDate: reading.dueDate, dateText: reading.dateText, location: reading.location }));
        break;
      case "grocery_item":
        operations.push(op("to_buy", { title, quantity: reading.quantity, unit: reading.unit, category: reading.category }));
        break;
      case "health_document":
        operations.push(op("health_record", { ...headline, healthRecordType: reading.healthRecordType, documentDate: reading.documentDate }, { forPerson: reading.subjectMemberName }));
        break;
      default:
        operations.push(op("note", { ...headline, facts: reading.facts.map((fact) => fact.statement) }));
    }
  }
  // The document's further records (DDU 2.0), each its own operation with where it was read.
  const records = !payment && !(reading.schedule && reading.schedule.rows.length > 0) && !reading.syllabus && (reading.records ?? []).length >= 2 ? reading.records ?? [] : [];
  for (const record of records) {
    const capabilityId = record.domain === "school_item" && record.schoolKind === "exam" ? "exam" : DOMAIN_CAPABILITY[record.domain];
    if (!capabilityId) continue;
    operations.push(op(capabilityId, {
      title: record.title, notes: record.notes, subject: record.subject, dueDate: record.dueDate, payee: record.payee, amount: record.amount,
      currency: record.currency, quantity: record.quantity, unit: record.unit, location: record.location,
      schoolKind: capabilityId === "school_item" ? record.schoolKind : undefined, billKind: record.billKind,
    }, { forPerson: record.person, evidence: quoteOf(record.evidence.quote) }));
  }
  for (const need of reading.needs ?? []) operations.push(op("to_buy", { title: need.title, notes: need.reason }));

  const nearestKind = operations[0]?.capability ?? "note";
  return {
    whatIs: reading.summary ?? title,
    nearestKind,
    newKind: null,
    operations,
    question: null,
    source: "reading",
  };
}

/** The capabilities a decision's accepted operations write to, for "Why?" and metrics. */
export function decidedCapabilities(decision: ValidatedDecision): CapabilityId[] {
  return [...new Set(decision.accepted.map((index) => decision.operations[index]?.capability as CapabilityId))].filter((id) => id in CAPABILITIES);
}
