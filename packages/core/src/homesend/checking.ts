import { COMPLETENESS, missingDetails, type CompletenessReading, type DetailField } from "./completeness";
import type { HomeSendKind } from "./items";
import { FROM_A_FILE, type ReadingCheck } from "./verify";

/**
 * The questions that raise a "Checking" entry over the household's bar (the
 * owner, 2026-11-03: "send a message in HomeTalk and WhatsApp to clarify the
 * confusion; when the user answers, update the entry automatically till you
 * reach the threshold defined"). Story 14-061.
 *
 * Every question comes from evidence, never from a guess:
 *
 *   - read from a photo or a file: one "Looks right?" over everything it read
 *     ("Electricity · ₹2,140 · due 12 Nov"), because nothing could be checked
 *     word by word (`verify.ts` `FROM_A_FILE`). One yes confirms it (14-066,
 *     part 3: one tap instead of up to three); a no goes on to the details,
 *     one at a time, still three questions in all;
 *   - a useful detail the reading lacks (`completeness.ts`, need "useful"):
 *     asked, as HomeTalk asks before an add;
 *   - otherwise (heard at 93%, or a "medium" reading): the entry itself is
 *     confirmed by its name.
 *
 * At most `MAX_CHECK_QUESTIONS`, one at a time. Each answered one closes its
 * share of the gap to 100%: the arithmetic is "how sure it was, plus the part
 * the answers settled" (principle 9), so every question answered reaches
 * 100%, over any bar an Admin can pick. A skipped one leaves the entry
 * Checking, with one "please check" at the end, never a fourth question.
 *
 * Pure: the same reading always gives the same questions, and the same answer
 * the same reading of it. Nothing here writes or reaches a model.
 */

export const MAX_CHECK_QUESTIONS = 3;

/**
 * Confirm what was read, or fill in what wasn't; "correct" follows a "no" to
 * a confirm. "confirm_all" is the one "Looks right?" over a photo's or file's
 * whole reading (14-066, part 3); its `field` is the first detail it names.
 */
export type CheckMode = "confirm" | "fill" | "correct" | "confirm_all";
export type CheckQuestion = { field: DetailField; mode: Exclude<CheckMode, "correct"> };

export type CheckOutcome = "yes" | "corrected" | "filled" | "skipped";
export type CheckChannel = "hometalk" | "whatsapp";

/**
 * Kept on the HomeSend item's own `understanding.checking` (HomeSend's own
 * table, X-003), so the one question is shared by HomeTalk and WhatsApp:
 * answering in either moves `open` on, and the other channel's copy is then
 * already answered.
 */
export type CheckingState = {
  version: 1;
  /** Who is asked: the member who sent it in. Only they answer (decision C). */
  recipientMemberId: string;
  /** How sure the reading was when it was added, 0..1. */
  base: number;
  /** The household's bar when it was added, in percent. */
  percent: number;
  planned: CheckQuestion[];
  /** `whole`: the answer was to "Looks right?" over the whole reading. */
  answered: { field: DetailField; outcome: CheckOutcome; via: CheckChannel; at: string; whole?: true }[];
  /** The question waiting for an answer; its `ordinal` is its place in `planned`, from 1. */
  open: { field: DetailField; mode: CheckMode; ordinal: number; retried?: true } | null;
  /** How it ended: over the bar, or left for a person to check. Null while asking. */
  done: "confirmed" | "please_check" | null;
};

/** The details a person would recognise each kind by, in the order they are confirmed. */
const KEY_DETAILS: Record<Exclude<HomeSendKind, "unknown">, readonly DetailField[]> = {
  grocery_item: ["name", "quantity"],
  school_item: ["title", "dueDate"],
  activity_item: ["className", "date"],
  event: ["title", "date"],
  bill: ["payee", "amount", "dueDate"],
  health_document: ["recordType", "date"],
  receipt: ["merchant", "date"],
};

/** What a reading holds for a detail, or null when it holds nothing. */
export function readValue(kind: HomeSendKind, field: DetailField, reading: CompletenessReading): string | number | null {
  const value = (key: string): unknown => (reading as Record<string, unknown> | null)?.[key];
  const text = (key: string): string | null => {
    const said = value(key);
    return typeof said === "string" && said.trim() ? said.trim() : null;
  };
  switch (field) {
    case "name":
    case "title":
      return text("title");
    case "quantity": {
      const quantity = Number(value("quantity"));
      return Number.isFinite(quantity) && quantity > 0 ? `${quantity}${text("unit") ? ` ${text("unit")}` : ""}` : null;
    }
    case "amount": {
      const amount = Number(value("amount"));
      return value("amount") !== null && Number.isFinite(amount) && amount > 0 ? amount : null;
    }
    case "dueDate":
      return text("dueDate");
    case "date":
      return kind === "health_document" || kind === "receipt" ? text("documentDate") : text("dueDate");
    case "payee":
      return text("payee");
    case "merchant":
      return text("merchant");
    case "recordType":
      return text("healthRecordType");
    case "className":
      return text("subject") ?? text("title");
    case "where":
      return text("location");
    case "time":
      return text("dueTime");
    default:
      return null;
  }
}

/**
 * The questions for an entry added as Checking, most telling first, at most
 * three. Empty for an unknown kind (nothing it could have been added as).
 */
export function planCheckQuestions(input: {
  kind: HomeSendKind | null;
  extracted: CompletenessReading;
  check: Pick<ReadingCheck, "unverified"> | null | undefined;
}): CheckQuestion[] {
  const kind = input.kind;
  if (!kind || kind === "unknown") return [];
  const planned: CheckQuestion[] = [];
  const add = (question: CheckQuestion) => {
    if (planned.length < MAX_CHECK_QUESTIONS && !planned.some((entry) => entry.field === question.field)) planned.push(question);
  };
  const held = KEY_DETAILS[kind].filter((field) => readValue(kind, field, input.extracted) !== null);
  const fromAFile = input.check?.unverified?.includes(FROM_A_FILE) ?? false;

  // Nothing could be checked word by word: each key detail it holds is confirmed.
  if (fromAFile) for (const field of held) add({ field, mode: "confirm" });
  // A useful detail it lacks is asked, as HomeTalk asks before an add.
  for (const spec of missingDetails(kind, input.extracted)) if (spec.need === "useful" && spec.answer !== "person") add({ field: spec.field, mode: "fill" });
  // Otherwise the entry itself is confirmed, by the first thing a person knows it by.
  if (!fromAFile && held[0]) planned.unshift({ field: held[0], mode: "confirm" });
  // A photo or file: one "Looks right?" first; its details follow only after a no, so three questions at most in all.
  if (fromAFile && held[0]) return [{ field: held[0], mode: "confirm_all" }, ...planned.slice(0, MAX_CHECK_QUESTIONS - 1)];
  return planned.slice(0, MAX_CHECK_QUESTIONS);
}

/** The state an entry starts with once it is added as Checking; null when there is nothing to ask. */
export function startChecking(input: {
  kind: HomeSendKind | null;
  extracted: CompletenessReading;
  check: Pick<ReadingCheck, "unverified"> | null | undefined;
  recipientMemberId: string;
  score: number | null;
  percent: number;
}): CheckingState | null {
  const planned = planCheckQuestions(input);
  if (planned.length === 0) return null;
  return {
    version: 1,
    recipientMemberId: input.recipientMemberId,
    base: clamp(input.score ?? 0),
    percent: input.percent,
    planned,
    answered: [],
    open: { field: planned[0]!.field, mode: planned[0]!.mode, ordinal: 1 },
    done: null,
  };
}

/** Reads a stored state back, or null when it isn't one (an item stored before 14-061). */
export function readCheckingState(value: unknown): CheckingState | null {
  const state = value as CheckingState | null;
  if (!state || typeof state !== "object" || state.version !== 1 || !Array.isArray(state.planned) || !Array.isArray(state.answered) || typeof state.recipientMemberId !== "string") return null;
  return state;
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * How sure the entry is now: what it was, plus each settled answer's share of
 * the gap to 100%. Three questions, two answered from 90%: 90 + 10 × 2⁄3 ≈ 96.7%.
 */
export function checkedScore(state: Pick<CheckingState, "base" | "planned" | "answered">): number {
  // "Looks right" over the whole reading settles all of it.
  if (state.answered.some((entry) => entry.whole && entry.outcome === "yes")) return 1;
  const details = state.planned.filter((question) => question.mode !== "confirm_all");
  if (details.length === 0) return clamp(state.base);
  const settled = state.answered.filter((entry) => !entry.whole && entry.outcome !== "skipped").length;
  return clamp(state.base + (1 - state.base) * Math.min(1, settled / details.length));
}

/** Strictly above the household's bar, as `confirmation.ts` reads it. */
export function overTheBar(state: CheckingState): boolean {
  return checkedScore(state) > state.percent / 100;
}

// --- Reading an answer -----------------------------------------------------------------

const YES = /^(?:y|yes|yeah|yep|yup|ok|okay|correct|right|that'?s right|that'?s correct|looks right|it'?s right|exactly|sure|haan|ha|ji|haan ji|si|sí|oui|ja|是|对|好|👍|✅)(?:[ ,!.]+(?:that'?s right|it is|thanks|thank you|correct))?[.!]*$/i;
const NO = /^(?:n|no|nope|nah|wrong|not right|that'?s wrong|incorrect|fix (?:it|something|this)|something'?s wrong|nahi|nahin|non|nein|不|不对|👎|❌)[.!]*$/i;
/** "No, it's 3 litres" — the correction after the no. */
const NO_THEN = /^(?:no|nope|nah|not quite|wrong|actually)[,.!:;\s-]+(?:it'?s|it is|it was|should be|make it)?\s*/i;

/** What an answer to one checking question says, before anything is written. */
export type CheckReading =
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "skip" }
  /** The detail's new value, read by HomeTalk's own detail reader. */
  | { kind: "value"; text: string }
  | { kind: "unread" };

/**
 * Splits an answer into yes, no, skip or a value to read. Pure. The value is
 * read by `hometalk/detail-answers.ts`, the same reader a question before an
 * add uses; a value that reader can't take stays unread, never a guess.
 */
export function splitCheckAnswer(mode: CheckMode, answer: string): CheckReading {
  const said = answer.trim().replace(/[*_~`]/g, "").replace(/\s+/g, " ");
  if (!said || said.length > 160) return { kind: "unread" };
  if (/^(?:skip|pass|don'?t know|not sure|dunno|no idea|later|leave it)[.!]*$/i.test(said)) return { kind: "skip" };
  const confirming = mode === "confirm" || mode === "confirm_all";
  if (confirming && YES.test(said)) return { kind: "yes" };
  if (confirming && NO.test(said)) return { kind: "no" };
  // "Looks right?" over a whole reading: anything but a yes or a skip goes on to the details, one at a time.
  if (mode === "confirm_all") return { kind: "no" };
  const corrected = said.replace(NO_THEN, "").trim();
  if (!corrected) return mode === "confirm" ? { kind: "no" } : { kind: "unread" };
  if (YES.test(corrected) || NO.test(corrected)) return { kind: "unread" };
  return { kind: "value", text: corrected };
}

/** The next question after `state.open`'s answer, or how it ends. Pure; returns a new state. */
export function afterAnswer(state: CheckingState, outcome: CheckOutcome, via: CheckChannel, at: Date): CheckingState {
  const open = state.open;
  if (!open) return state;
  const whole = open.mode === "confirm_all";
  const answered = [...state.answered, { field: open.field, outcome, via, at: at.toISOString(), ...(whole ? { whole: true as const } : {}) }];
  // A skipped "Looks right?" ends with one "please check", never the detail questions behind it.
  if (whole && outcome === "skipped") return { ...state, answered, open: null, done: "please_check" };
  const next = state.planned[open.ordinal];
  const moved = { ...state, answered };
  // Over the household's bar: confirmed now, whatever is left to ask ("till you reach the threshold").
  if (overTheBar(moved)) return { ...moved, open: null, done: "confirmed" };
  if (next) return { ...moved, open: { field: next.field, mode: next.mode, ordinal: open.ordinal + 1 } };
  return { ...moved, open: null, done: overTheBar(moved) ? "confirmed" : "please_check" };
}

/** How many questions are still to answer about an entry being checked; 0 when none waits (14-062). */
export function questionsLeft(value: unknown): number {
  const state = readCheckingState(value);
  if (!state?.open || state.done) return 0;
  // One tap settles it; the details behind it are asked only after a no.
  if (state.open.mode === "confirm_all") return 1;
  return Math.max(0, state.planned.length - state.open.ordinal + 1);
}

/**
 * A "no" to a confirm: the same question, asking what it should be — not a
 * new one. A "no" to "Looks right?" goes on to the details it read, one at a
 * time; with none planned it ends with one "please check".
 */
export function askCorrection(state: CheckingState): CheckingState {
  if (!state.open) return state;
  if (state.open.mode === "confirm_all") {
    const next = state.planned[state.open.ordinal];
    return next ? { ...state, open: { field: next.field, mode: next.mode, ordinal: state.open.ordinal + 1 } } : { ...state, open: null, done: "please_check" };
  }
  return { ...state, open: { ...state.open, mode: "correct" } };
}

/** Each detail's name in a question, never a code. */
export const CHECK_LABELS: Record<DetailField, string> = {
  name: "item",
  quantity: "amount to get",
  child: "person",
  person: "person",
  title: "name",
  dueDate: "due date",
  className: "class",
  date: "date",
  time: "time",
  where: "place",
  payee: "sender",
  amount: "amount",
  recordType: "record type",
  merchant: "shop",
};

/** Whether a detail is one this kind keeps at all (`completeness.ts`), so a stored question is never about another kind's field. */
export function fieldOf(kind: HomeSendKind, field: DetailField): boolean {
  return kind !== "unknown" && (COMPLETENESS[kind].some((spec) => spec.field === field) || KEY_DETAILS[kind].includes(field));
}
