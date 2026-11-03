import { decideAutonomy, type AutonomyMode } from "../household/autonomy";
import type { HomeSendExtraction, HomeSendKind } from "./items";
import type { HomeSendReconciliation } from "./reconcile";
import type { SubjectResolution } from "./resolve";
import type { IntakeUnderstanding } from "./understanding";
import { DEFAULT_AUTO_ADD_PERCENT, directAddAreaOf, NO_DIRECT_ADD, type DirectAdd } from "./auto-add";
import { listDetails, missingRequired, type CompletenessReading } from "./completeness";
import { FROM_A_FILE } from "./verify";

/**
 * How HomeSend confirms what it read (Wave 3 §12):
 *
 *   - a complete, safe and reversible reading → added directly where the
 *     domain allows it AND the household's own autonomy setting for that
 *     outcome says "execute" (the owner, 2026-11-03). Above the bar an Admin
 *     picked (`auto-add.ts`, 95% unless changed) it is simply added; below
 *     it, or read from a photo or file, it is added "unconfirmed": shown as
 *     Checking, its reminders held, while HomeTalk asks;
 *   - low confidence, or a required detail missing → ask one targeted question;
 *   - consequential (a bill, receipt or health document) → the existing
 *     governance, whatever the confidence — unless an Admin turned on "Add
 *     money entries directly" or "Add health entries directly", when it
 *     goes through every rule above like a grocery (the owner, 2026-10-26).
 *
 * Pure: the same reading, household and setting always give the same
 * answer. Nothing here writes; the caller applies an `auto_apply` through
 * the same governed domain service a person's confirm would use, and it is
 * undoable exactly like one.
 */

export type ConfirmationMode = "auto_apply" | "prepare" | "ask" | "govern";

export type ConfirmationDecision = {
  mode: ConfirmationMode;
  /** Why, in the household's words — shown beside the review, never a code. */
  reason: string;
  /** The one question to ask, when `mode` is `ask`. */
  question: string | null;
  /**
   * What the entry can't be added without, by name ("due date"), in the order
   * HomeTalk would ask (`completeness.ts`). HomeSend reports it and never words
   * the question: HomeTalk asks, and the review shows "Still needed".
   */
  stillNeeded?: string[];
  /**
   * An item that would otherwise be added on its own, held for a reason the
   * person can act on (the owner, 2026-10-26): shown on its Needs review row
   * and said on WhatsApp, in a few words, never with an amount.
   */
  wait?: WaitingFor;
  /** An `auto_apply` that adds to a grocery already on the shopping list, never a second entry (I-27). */
  topUp?: true;
  /**
   * An `auto_apply` below the household's bar (or read from a photo or file):
   * added now, marked "Checking", its reminders held, and HomeTalk asks until
   * it is sure enough (the owner, 2026-11-03).
   */
  unconfirmed?: true;
};

/** Why something that would be added on its own waits: already on the list, the setting, or the bar. */
export type WaitReason = "on_list" | "wait_for_approval" | "below_bar" | "untraced";
export type WaitingFor = {
  reason: WaitReason;
  /** The household's bar, for "below your bar of N%". */
  percent?: number;
  /** Whose setting holds it, for "groceries set to Wait for Approval". */
  area?: "groceries" | "school";
  /** It is a grocery already on the shopping list: WhatsApp says that, whatever else holds it. */
  listed?: true;
};

/**
 * The domains HomeSend may ever apply on its own, and the household outcome
 * whose autonomy setting decides it. A new grocery item or a new school
 * item is safe and reversible — one Undo removes it. A bill, a receipt and
 * a health document are here too, but are reached only when the Admin's
 * matching "add directly" setting is on (`CONSEQUENTIAL` below): a bill
 * entry is a record and a reminder, never a payment; a health record keeps
 * its own privacy (self or guardian only).
 */
export const AUTO_APPLY_OUTCOMES: Partial<Record<HomeSendKind, { outcomeKey: string; label: string }>> = {
  grocery_item: { outcomeKey: "groceries.stocked", label: "groceries" },
  school_item: { outcomeKey: "school.homework_done", label: "school work" },
  bill: { outcomeKey: "finance.bills_paid", label: "the bills" },
  receipt: { outcomeKey: "finance.budget_reviewed", label: "the budget check" },
  health_document: { outcomeKey: "health.records_kept", label: "health records" },
};

/** Why a bill, receipt or health document waits while the household's "add directly" setting for it is off. */
const CONSEQUENTIAL: Partial<Record<HomeSendKind, string>> = {
  bill: "A bill is about money, so it waits for a person unless an Admin lets WonderHome add money entries directly.",
  health_document: "A health document is private, so it waits for a person unless an Admin lets WonderHome add health entries directly.",
  receipt: "A receipt becomes purchase history line by line, so it waits for a person unless an Admin lets WonderHome add money entries directly.",
};

const KIND_LABEL: Record<HomeSendKind, string> = {
  bill: "a bill",
  school_item: "school work",
  activity_item: "a class outside school",
  event: "an event",
  grocery_item: "something to buy",
  health_document: "a health document",
  receipt: "a receipt",
  unknown: "something",
};

export type ConfirmationInput = {
  kind: HomeSendKind | null;
  /** The reading; the rest of its fields decide whether it is complete (`completeness.ts`). */
  extracted: (Pick<HomeSendExtraction, "title" | "needs" | "confidence"> & NonNullable<CompletenessReading>) | null;
  understanding: Pick<IntakeUnderstanding, "readable" | "confidence" | "safety" | "score" | "check"> | null;
  reconciliation: Pick<HomeSendReconciliation, "message" | "proposal"> | null;
  subject: Pick<SubjectResolution, "question" | "selected"> | null;
  /** A member sent it in themselves; an email arrives with nobody in the household acting. */
  memberInitiated: boolean;
  /** The household's own setting for this kind's outcome; "prepare" when nothing is configured. */
  autonomy: AutonomyMode;
  /** How sure, in percent, a reading must be (strictly above) to be added on its own (`auto-add.ts`); 95 when unset. */
  autoAddPercent?: number;
  /**
   * The grocery it matched is on the shopping list now (`home-send-review.ts`
   * reads it). With an explicit amount that is a top-up, as HomeTalk's "+2 L,
   * now 3 L" (design §6), not a duplicate to choose about (I-27).
   */
  onShoppingList?: boolean;
  /** The Admin's "add money / health entries directly" settings (`auto-add.ts`); both off when unset. */
  directAdd?: DirectAdd;
  /** Already on record by a check of its own kind (a receipt with the same shop, day and total). */
  duplicate?: boolean;
};

export function decideConfirmation(input: ConfirmationInput): ConfirmationDecision {
  const kind = input.kind;
  const title = input.extracted?.title?.trim() ?? "";

  if (!kind || kind === "unknown" || input.understanding?.readable === false) {
    return { mode: "ask", reason: "WonderHome couldn't tell what this is.", question: "What is this — a bill, school work, something to buy, a receipt or a health document?" };
  }

  // What it can't be added without (`completeness.ts`, the owner 2026-10-26).
  // Who it is for is settled below, through the household's own people.
  const missing = missingRequired(kind, input.extracted, { person: true });

  const consequential = CONSEQUENTIAL[kind];
  const stillNeeded = missing.length > 0 ? { stillNeeded: missing.map((spec) => spec.label) } : {};
  // Held for a person unless the Admin's matching setting is on; what it still needs is reported beside it.
  const directArea = directAddAreaOf(kind);
  const allowed = directArea !== null && (input.directAdd ?? NO_DIRECT_ADD)[directArea];
  if (consequential && !allowed) return { mode: "govern", reason: consequential, question: null, ...stillNeeded };

  const confidence = input.understanding?.confidence ?? input.extracted?.confidence ?? "low";
  const percent = input.autoAddPercent ?? DEFAULT_AUTO_ADD_PERCENT;
  const score = input.understanding?.score ?? null;
  // Above the household's bar, a "medium" reading is still a candidate: the Admin chose that bar.
  const aboveBar = score !== null && score > percent / 100;
  if (confidence === "low" || !title) {
    const question = input.subject?.question ?? (title ? `Is this ${KIND_LABEL[kind]}: “${title}”?` : "What is it?");
    return { mode: "ask", reason: "WonderHome isn't sure it read this right.", question };
  }
  if (input.subject?.question) return { mode: "ask", reason: "It doesn't say who it's for.", question: input.subject.question };
  if ((kind === "school_item" || kind === "activity_item") && !input.subject?.selected) return { mode: "ask", reason: "It doesn't say who it's for.", question: "Who is this for?" };
  // A health record is filed against one person, so it is never added on its own for "me" by default.
  if (kind === "health_document" && !input.subject?.selected) return { mode: "ask", reason: "It doesn't say who it's for.", question: "Who is this for?", stillNeeded: ["who it's for"] };

  // Nothing is added while something it can't be added without is missing
  // (`completeness.ts`, the owner 2026-10-26). HomeSend says what is missing;
  // HomeTalk is the one that asks.
  if (missing.length > 0) return { mode: "ask", reason: `It doesn't say the ${listDetails(missing)}.`, question: null, ...stillNeeded };

  // A grocery already on the shopping list, said with an amount, is more of
  // it (I-27, the owner 2026-10-26): the same decision as anything new, then
  // added to the entry that is there. Without an amount it waits for the
  // person to choose. Every other match keeps the duplicate rule (I-4).
  const listed = kind === "grocery_item" && input.onShoppingList === true && input.reconciliation?.proposal.type === "duplicate";
  if (input.reconciliation && !listed) return { mode: "prepare", reason: input.reconciliation.message, question: null };
  if (listed && !hasAmount(input.extracted)) {
    return { mode: "prepare", reason: `${title} is already on your shopping list, so it waits for you to choose how much more.`, question: null, wait: { reason: "on_list", listed: true } };
  }
  if (input.duplicate) return { mode: "prepare", reason: "This looks like one already recorded, so a person looks first.", question: null };
  if (input.understanding?.safety.instructionsIgnored) {
    return { mode: "prepare", reason: "It contained instructions aimed at WonderHome, so a person looks first.", question: null };
  }
  if ((input.extracted?.needs?.length ?? 0) > 0) {
    return { mode: "prepare", reason: "It asks for more than one thing, and each is yours to confirm.", question: null };
  }
  if (!input.memberInitiated) {
    return { mode: "prepare", reason: "Nobody in the household sent this in directly, so a person looks first.", question: null };
  }

  const outcome = AUTO_APPLY_OUTCOMES[kind];
  if (!outcome) return { mode: "prepare", reason: "Ready for you to check.", question: null };

  // Added directly (the owner, 2026-11-03: "add the entry directly in
  // WonderHome without asking for a review"). More sure than the household's
  // bar (95% unless an Admin picked another) it is simply added; below it, or
  // read from a photo or file (no words of its own to check against), it is
  // added marked "Checking": its reminders wait and HomeTalk asks until it is
  // sure enough. What the household's autonomy setting says still decides
  // whether it is added at all.
  const unverified = input.understanding?.check?.unverified ?? [];
  const fromAFile = unverified.includes(FROM_A_FILE);
  // A reading that names something the words sent don't contain (a shop, a
  // date, an amount, a name) is never added, not even as Checking (the
  // owner, 2026-11-03, decision 3): it waits in HomeSend for a person. A
  // photo or a file has no words to check, and that alone is not this.
  const untraced = input.understanding?.check?.untraced ?? [];
  if (untraced.length > 0) {
    return { mode: "prepare", reason: `What WonderHome read as ${listUntraced(untraced)} isn't in what was sent, so nothing was added: a person looks first.`, question: null, wait: { reason: "untraced" } };
  }
  const checking = !aboveBar || fromAFile ? { unconfirmed: true as const } : {};
  const onList = listed ? { listed: true as const } : {};

  // A bill, receipt or health entry is a record of the household's own, never a payment or an order.
  const decision = decideAutonomy(input.autonomy, { outcomeKey: outcome.outcomeKey, kind: consequential ? "change" : "schedule", reversible: true });
  if (decision.outcome === "execute") {
    const sure = checking.unconfirmed ? ` It wasn't more than ${percent}% sure, so it is marked Checking until you answer a question or say it's right.` : "";
    if (listed) {
      return { mode: "auto_apply", reason: `Your household lets WonderHome handle ${outcome.label} on its own, so it adds to what is already on the shopping list.${sure} Undo it any time.`, question: null, topUp: true, ...checking };
    }
    return { mode: "auto_apply", reason: `Your household lets WonderHome handle ${outcome.label} on its own.${sure} Undo it any time.`, question: null, ...checking };
  }
  const reason = `Your household has ${outcome.label} set to “Wait for Approval”, so WonderHome asks first.`;
  // The row and WhatsApp name groceries or school work; a bill, receipt or health entry waits with the reason alone.
  if (consequential) return { mode: "prepare", reason, question: null };
  const area = kind === "grocery_item" ? "groceries" : "school";
  return { mode: "prepare", reason, question: null, wait: { reason: "wait_for_approval", area, ...onList } };
}

/** "the amount and the date": what the reading named that the words sent don't contain. */
function listUntraced(details: readonly string[]): string {
  if (details.length === 1) return details[0]!;
  return `${details.slice(0, -1).join(", ")} and ${details.at(-1)}`;
}

/** An amount was said ("2 litres", or a number alone, 25-037), not left for WonderHome to pick. */
function hasAmount(extracted: ConfirmationInput["extracted"]): boolean {
  const quantity = Number(extracted?.quantity);
  return Number.isFinite(quantity) && quantity > 0;
}
