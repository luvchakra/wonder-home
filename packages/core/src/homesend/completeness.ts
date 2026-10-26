import { COUNTED_UNITS, normalizeUnit, parseQuantity } from "../commerce/units";
import type { HomeSendExtraction, HomeSendKind } from "./items";

/**
 * What makes each HomeSend entry complete (the owner, 2026-10-26: "HomeSend
 * should be able to deeply analyse the structure of entity to be added and
 * ask relevant questions to ensure entry added has complete info").
 *
 * Derived from what each domain's create takes (`home-send-writes.ts`
 * `createNew`). A **required** detail is one the entry cannot be added
 * without: nothing is added on its own while one is missing
 * (`confirmation.ts`), and the review keeps Add off until it is filled. A
 * **useful** detail is asked once if the reading lacks it, never insisted on.
 *
 * Pure. It reads only what the reading already holds: a detail the content
 * really said is never asked again, and an answer is never guessed — a reply
 * that can't be read as the detail asked is not taken (`completeness-answers.ts`).
 * Light enough for the review screen to import: nothing here reaches a model.
 */

export type DetailField =
  | "name"
  | "quantity"
  | "child"
  | "title"
  | "dueDate"
  | "className"
  | "date"
  | "time"
  | "where"
  | "payee"
  | "amount"
  | "person"
  | "recordType"
  | "merchant";

/** How a short reply to the question is read. */
export type DetailAnswerType = "quantity" | "date" | "time" | "amount" | "person" | "choice" | "text";

export type DetailSpec = {
  field: DetailField;
  need: "required" | "useful";
  answer: DetailAnswerType;
  /** The review form's input this detail fills, so the screen can mark it. */
  input: string;
  /** One short, polite question in the UI's own words. */
  question: string;
  /** The detail's name in a list ("Still needed: quantity, due date"). */
  label: string;
};

type CompleteKind = Exclude<HomeSendKind, "unknown">;

const WHO = (input: string, question = "Who is it for?"): Omit<DetailSpec, "need"> => ({ field: input === "childMemberId" ? "child" : "person", answer: "person", input, question, label: "who it's for" });

/** Each kind's details, in the order they are asked: required first, then useful. */
export const COMPLETENESS: Record<CompleteKind, readonly DetailSpec[]> = {
  grocery_item: [
    { field: "name", need: "required", answer: "text", input: "title", question: "What should go on the list?", label: "what it is" },
    { field: "quantity", need: "useful", answer: "quantity", input: "quantity", question: "How much should I get? For example 2 litres or 1 kg.", label: "quantity" },
  ],
  school_item: [
    { ...WHO("childMemberId"), need: "required" },
    { field: "title", need: "required", answer: "text", input: "title", question: "What is it called?", label: "what it is" },
    { field: "dueDate", need: "required", answer: "date", input: "dueDate", question: "When is it due?", label: "due date" },
  ],
  activity_item: [
    { ...WHO("childMemberId"), need: "required" },
    { field: "className", need: "required", answer: "text", input: "activityName", question: "Which class is it for?", label: "class" },
    { field: "date", need: "useful", answer: "date", input: "dueDate", question: "Which day is it?", label: "day" },
  ],
  event: [
    { field: "title", need: "required", answer: "text", input: "title", question: "What is the event called?", label: "what it is" },
    { field: "date", need: "required", answer: "date", input: "dueDate", question: "Which day is it?", label: "day" },
    { field: "time", need: "useful", answer: "time", input: "dueTime", question: "What time does it start?", label: "start time" },
    { field: "where", need: "useful", answer: "text", input: "location", question: "Where is it?", label: "where" },
  ],
  bill: [
    { field: "payee", need: "required", answer: "text", input: "payee", question: "Who is the bill from?", label: "who it's from" },
    { field: "amount", need: "required", answer: "amount", input: "amount", question: "How much is the bill?", label: "amount" },
    { field: "dueDate", need: "required", answer: "date", input: "dueDate", question: "When is it due?", label: "due date" },
  ],
  health_document: [
    { ...WHO("subjectMemberId", "Whose record is it?"), need: "required" },
    { field: "recordType", need: "required", answer: "choice", input: "healthRecordType", question: "What kind of record is it — a prescription, a lab report, a scan, a vaccination or something else?", label: "record type" },
    { field: "date", need: "useful", answer: "date", input: "documentDate", question: "What date is on it?", label: "date" },
  ],
  receipt: [
    { field: "merchant", need: "required", answer: "text", input: "merchant", question: "Which shop is it from?", label: "shop" },
    { field: "date", need: "required", answer: "date", input: "purchasedOn", question: "What day was it bought?", label: "date" },
  ],
};

/** At most this many questions about one item on WhatsApp; the rest can be filled in in HomeSend. */
export const MAX_DETAIL_QUESTIONS = 3;

/** What the reading holds, as far as completeness looks. */
export type CompletenessReading = Partial<
  Pick<
    HomeSendExtraction,
    "title" | "quantity" | "unit" | "dueDate" | "dueTime" | "subject" | "location" | "payee" | "amount" | "healthRecordType" | "documentDate" | "subjectMemberName" | "people" | "merchant"
  >
> | null;

const filled = (value: unknown): boolean => (typeof value === "string" ? value.trim() !== "" : typeof value === "number" ? Number.isFinite(value) : value !== null && value !== undefined);

/** Who the reading says it is for: the name it read, or the first person it named. */
export function personNamed(reading: CompletenessReading): string | null {
  const named = reading?.subjectMemberName?.trim();
  if (named) return named;
  return reading?.people?.find((entry) => typeof entry === "string" && entry.trim())?.trim() ?? null;
}

function has(kind: CompleteKind, field: DetailField, reading: CompletenessReading, person: boolean | undefined): boolean {
  switch (field) {
    case "name":
    case "title":
      return filled(reading?.title);
    case "quantity":
      return filled(reading?.quantity);
    case "child":
    case "person":
      return person ?? personNamed(reading) !== null;
    case "dueDate":
      return filled(reading?.dueDate);
    case "className":
      return filled(reading?.subject);
    case "date":
      return kind === "health_document" || kind === "receipt" ? filled(reading?.documentDate) || filled(reading?.dueDate) : filled(reading?.dueDate);
    case "time":
      return filled(reading?.dueTime);
    case "where":
      return filled(reading?.location);
    case "payee":
      return filled(reading?.payee);
    case "amount":
      return filled(reading?.amount) && (reading?.amount ?? 0) > 0;
    case "recordType":
      return filled(reading?.healthRecordType);
    case "merchant":
      return filled(reading?.merchant);
  }
}

/**
 * The details a reading lacks, in the order to ask: required first, then
 * useful. `person` is whether the caller already knows who it is for (the
 * review's resolved subject); left out, the reading's own name decides.
 */
export function missingDetails(kind: HomeSendKind | null, reading: CompletenessReading, options: { person?: boolean } = {}): DetailSpec[] {
  if (!kind || kind === "unknown") return [];
  const specs = COMPLETENESS[kind];
  const missing = specs.filter((spec) => !has(kind, spec.field, reading, options.person));
  return [...missing.filter((spec) => spec.need === "required"), ...missing.filter((spec) => spec.need === "useful")];
}

/** Only the required details still missing. */
export function missingRequired(kind: HomeSendKind | null, reading: CompletenessReading, options: { person?: boolean } = {}): DetailSpec[] {
  return missingDetails(kind, reading, options).filter((spec) => spec.need === "required");
}

/** "quantity and due date" — a short list of what is still needed, for a sentence. */
export function listDetails(specs: readonly Pick<DetailSpec, "label">[]): string {
  const labels = [...new Set(specs.map((spec) => spec.label))];
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/** What HomeSend has asked about an item on WhatsApp, kept on its reading. */
export type DetailAsking = { awaiting: DetailField | null; asked: DetailField[] };

export function askingOf(extracted: Record<string, unknown> | null | undefined): DetailAsking {
  const raw = (extracted?.asking ?? null) as Partial<DetailAsking> | null;
  return {
    awaiting: typeof raw?.awaiting === "string" ? (raw.awaiting as DetailField) : null,
    asked: Array.isArray(raw?.asked) ? (raw!.asked.filter((entry) => typeof entry === "string") as DetailField[]) : [],
  };
}

/**
 * The next detail to ask about on WhatsApp: the first one missing that has
 * not been asked yet, while fewer than `MAX_DETAIL_QUESTIONS` have been.
 * Who it is for is asked by its own flow (with the household's names as
 * choices), so it is never asked here.
 */
export function nextDetailToAsk(kind: HomeSendKind | null, reading: CompletenessReading, asked: readonly DetailField[], options: { person?: boolean } = {}): DetailSpec | null {
  if (asked.length >= MAX_DETAIL_QUESTIONS) return null;
  return missingDetails(kind, reading, options).find((spec) => spec.answer !== "person" && !asked.includes(spec.field)) ?? null;
}

// --- Reading a quantity ----------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, "half a": 0.5 };

/** Units a quantity may be given in: the known ones and the counted words a form offers. */
function knownUnit(word: string): string | null {
  const unit = normalizeUnit(word);
  if (!unit) return null;
  return ["g", "kg", "ml", "l", "pcs", "dozen", ...COUNTED_UNITS].includes(unit) ? unit : null;
}

const QUANTITY = /(?:^|[\s(])(\d+(?:[.,]\d+)?|½|¼|¾|half a|half|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s*([a-z]+)?\b/gi;

/**
 * A quantity and unit in someone's words ("2 litres", "1.5kg", "a dozen",
 * "3"), or null. With `unitRequired`, a bare number is not enough — used when
 * reading a whole message, where any number could be about something else.
 */
export function readQuantity(text: string, options: { unitRequired?: boolean } = {}): { quantity: number; unit: string | null } | null {
  const found: { quantity: number; unit: string | null }[] = [];
  for (const match of text.toLowerCase().matchAll(QUANTITY)) {
    const said = match[1]!;
    const quantity = NUMBER_WORDS[said] ?? parseQuantity(said);
    if (quantity === null || quantity === undefined || quantity <= 0) continue;
    const unit = match[2] ? knownUnit(match[2]) : null;
    // "a" and "one" are words too: they count only with a unit after them.
    if (!unit && (options.unitRequired || /^[a-z]/.test(said))) continue;
    found.push({ quantity, unit });
  }
  // Two different amounts in one message is not one answer: never guess between them.
  return found.length === 1 ? found[0]! : null;
}

/**
 * The reading's own evidence, used before anything is asked: a grocery item
 * whose reading lost its quantity ("Add 2 litres of oil" read as "Coconut
 * oil" with none) takes the one quantity the text sent says, with its unit.
 * Only when the text holds exactly one such amount; anything else stays
 * missing, to be asked.
 */
export function fillFromEvidence<T extends Partial<HomeSendExtraction>>(kind: HomeSendKind | null, reading: T, sourceText: string | null | undefined): T {
  if (kind !== "grocery_item" || !sourceText || filled(reading.quantity) || (reading.needs?.length ?? 0) > 0) return reading;
  const read = readQuantity(sourceText, { unitRequired: true });
  return read ? { ...reading, quantity: read.quantity, unit: reading.unit || read.unit } : reading;
}
