import { isLeaveIt } from "../conversation/leave-it";
import { dayFromDateText, timeFromDateText } from "../ai/classify-intake";
import { RECORD_TYPES, type RecordType } from "../health/records";
import { COMPLETENESS, readQuantity, type DetailField } from "../homesend/completeness";
import type { HomeSendExtraction, HomeSendKind } from "../homesend/items";

/**
 * HomeTalk reading a short reply as the HomeSend detail it asked about
 * (`hometalk/intake-questions.ts`, the owner 2026-10-26): a quantity, an
 * amount, a date phrase through the intake's own date grounding, a time, a
 * choice from a known set, or a few words. Server-side only: it reaches the
 * classifier's date rules. Pure, and never a guess — what can't be read as
 * the detail asked is null.
 */

/** "Skip", "don't know": the person passes on this detail. */
const SKIP = /^(?:skip|pass|no|none|nope|nothing|don'?t know|do not know|not sure|dunno|no idea|later|n\/?a)[.!]?$/i;

/** An amount of money ("₹2,140", "Rs 499.50", "2140 rupees"), or null. Never said back. */
export function readAmount(text: string): number | null {
  const numbers = text.replace(/(\d),(?=\d{2,3}\b)/g, "$1").match(/\d+(?:\.\d{1,2})?/g) ?? [];
  if (numbers.length !== 1) return null;
  const value = Number(numbers[0]);
  return Number.isFinite(value) && value > 0 && value <= 10_000_000 ? value : null;
}

const RECORD_WORDS: [RegExp, RecordType][] = [
  [/prescri|medicine list|\brx\b/i, "prescription"],
  [/vaccin|immuni[sz]|jab/i, "vaccination_certificate"],
  [/scan|x-?ray|mri|ultrasound|imaging|ct\b/i, "imaging_report"],
  [/discharge/i, "discharge_summary"],
  [/referral|referred/i, "referral"],
  [/insurance|policy|claim/i, "insurance_document"],
  [/visit|consult|doctor'?s note/i, "visit_summary"],
  [/lab|blood|test|report|result/i, "lab_result"],
  [/other|something else/i, "other"],
];

/** A health record type from a few words ("a blood test report" → lab result), or null. */
export function readRecordType(text: string): RecordType | null {
  const exact = RECORD_TYPES.find((type) => type === text.trim().toLowerCase().replace(/\s+/g, "_"));
  if (exact) return exact;
  return RECORD_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/**
 * Reads a short reply as the detail that was asked. Returns the fields to
 * set on the reading, `"skip"` when the person passes, or null when the
 * reply can't be read as that detail — never a guess.
 */
export function readDetailAnswer(
  kind: HomeSendKind,
  field: DetailField,
  text: string,
  context: { timezone: string; now: Date },
): Partial<HomeSendExtraction> | "skip" | null {
  const said = text.trim().replace(/[*_~`]/g, "");
  if (!said || said.length > 160) return null;
  if (SKIP.test(said) || isLeaveIt(said)) return "skip";
  const spec = kind === "unknown" ? undefined : COMPLETENESS[kind].find((entry) => entry.field === field);
  if (!spec) return null;
  switch (spec.answer) {
    case "quantity": {
      const read = readQuantity(said);
      return read ? { quantity: read.quantity, unit: read.unit } : null;
    }
    case "amount": {
      const amount = readAmount(said);
      return amount === null ? null : { amount };
    }
    case "date": {
      const day = dayFromDateText(said, context);
      if (!day) return null;
      const time = timeFromDateText(said);
      if (kind === "health_document" || kind === "receipt") return { documentDate: day };
      return { dueDate: day, ...(time ? { dueTime: time.start, ...(time.end ? { endTime: time.end } : {}) } : {}), dateText: said };
    }
    case "time": {
      const time = timeFromDateText(said);
      return time ? { dueTime: time.start, ...(time.end ? { endTime: time.end } : {}) } : null;
    }
    case "choice": {
      const type = readRecordType(said);
      return type ? { healthRecordType: type } : null;
    }
    case "text": {
      const value = said.replace(/^(?:it'?s|it is|at|from|for|the)\s+/i, "").replace(/[.!]+$/, "").trim().slice(0, 120);
      if (!value) return null;
      switch (field) {
        case "name":
        case "title":
          return { title: value };
        case "className":
          return { subject: value };
        case "where":
          return { location: value };
        case "payee":
          return { payee: value };
        case "merchant":
          return { merchant: value };
        default:
          return null;
      }
    }
    case "person":
      return null;
  }
}

