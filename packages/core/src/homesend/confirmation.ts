import { decideAutonomy, type AutonomyMode } from "../household/autonomy";
import type { HomeSendExtraction, HomeSendKind } from "./items";
import type { HomeSendReconciliation } from "./reconcile";
import type { SubjectResolution } from "./resolve";
import type { IntakeUnderstanding } from "./understanding";
import { DEFAULT_AUTO_ADD_PERCENT } from "./auto-add";
import { listDetails, missingRequired, type CompletenessReading } from "./completeness";
import { FROM_A_FILE } from "./verify";

/**
 * How HomeSend confirms what it read (Wave 3 §12):
 *
 *   - high confidence, safe and reversible → may apply on its own, but only
 *     where the domain allows it AND the household's own autonomy setting
 *     for that outcome says "execute" AND the score is above the bar an
 *     Admin picked (`auto-add.ts`, 95% unless changed);
 *   - medium confidence → prepare it and ask;
 *   - low confidence → ask one targeted question;
 *   - consequential → the existing governance, whatever the confidence.
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
  /** An `auto_apply` that adds to a grocery already on the shopping list, never a second entry (I-24). */
  topUp?: true;
};

/** Why something that would be added on its own waits: already on the list, the setting, or the bar. */
export type WaitReason = "on_list" | "wait_for_approval" | "below_bar";
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
 * item is safe and reversible — one Undo removes it. A bill is money and a
 * health document is private: neither is here, so neither can be applied
 * without a person, whatever a setting says.
 */
export const AUTO_APPLY_OUTCOMES: Partial<Record<HomeSendKind, { outcomeKey: string; label: string }>> = {
  grocery_item: { outcomeKey: "groceries.stocked", label: "groceries" },
  school_item: { outcomeKey: "school.homework_done", label: "school work" },
};

const CONSEQUENTIAL: Partial<Record<HomeSendKind, string>> = {
  bill: "A bill is about money, so it always waits for a person — however clearly it was read.",
  health_document: "A health document is private, so it always waits for a person — however clearly it was read.",
  receipt: "A receipt becomes purchase history line by line, so a person confirms which lines are which — however clearly it was read.",
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
   * now 3 L" (design §6), not a duplicate to choose about (I-24).
   */
  onShoppingList?: boolean;
};

/** Why a clear reading still waits: what WonderHome could not find in what was sent. */
function notSureEnough(unverified: readonly string[], percent: number): string {
  if (unverified.length === 0) return `WonderHome adds things on its own only when it is more than ${percent}% sure, so a person looks first.`;
  if (unverified.includes(FROM_A_FILE)) return "This was read from a photo or a file, which can't be checked word by word, so a person looks first.";
  const listed = unverified.length === 1 ? unverified[0] : `${unverified.slice(0, -1).join(", ")} and ${unverified.at(-1)}`;
  return `WonderHome couldn't check ${listed} against what was sent, so a person looks first.`;
}

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
  // Held for a person whatever happens; what it still needs is reported beside it.
  if (consequential) return { mode: "govern", reason: consequential, question: null, ...stillNeeded };

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

  // Nothing is added while something it can't be added without is missing
  // (`completeness.ts`, the owner 2026-10-26). HomeSend says what is missing;
  // HomeTalk is the one that asks.
  if (missing.length > 0) return { mode: "ask", reason: `It doesn't say the ${listDetails(missing)}.`, question: null, ...stillNeeded };

  // A grocery already on the shopping list, said with an amount, is more of
  // it (I-24, the owner 2026-10-26): the same decision as anything new, then
  // added to the entry that is there. Without an amount it waits for the
  // person to choose. Every other match keeps the duplicate rule (I-4).
  const listed = kind === "grocery_item" && input.onShoppingList === true && input.reconciliation?.proposal.type === "duplicate";
  if (input.reconciliation && !listed) return { mode: "prepare", reason: input.reconciliation.message, question: null };
  if (listed && !hasAmount(input.extracted)) {
    return { mode: "prepare", reason: `${title} is already on your shopping list, so it waits for you to choose how much more.`, question: null, wait: { reason: "on_list", listed: true } };
  }
  if (confidence === "medium" && !aboveBar) return { mode: "prepare", reason: "WonderHome read it, but not surely enough to act on its own.", question: null };
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

  // More sure than the household's bar (95% unless an Admin picked another),
  // or a person confirms (the owner, 2026-10-25 and 2026-10-26).
  // A photo or a file always waits, whatever the bar: there are no words of its own to check the reading against.
  const unverified = input.understanding?.check?.unverified ?? [];
  const onList = listed ? { listed: true as const } : {};
  if (unverified.includes(FROM_A_FILE)) return { mode: "prepare", reason: notSureEnough(unverified, percent), question: null };
  if (!aboveBar) return { mode: "prepare", reason: notSureEnough(unverified, percent), question: null, wait: { reason: "below_bar", percent, ...onList } };

  const decision = decideAutonomy(input.autonomy, { outcomeKey: outcome.outcomeKey, kind: "schedule", reversible: true });
  if (decision.outcome === "execute") {
    if (listed) {
      return { mode: "auto_apply", reason: `Your household lets WonderHome handle ${outcome.label} on its own, and this was clear, so it adds to what is already on the shopping list. Undo it any time.`, question: null, topUp: true };
    }
    return { mode: "auto_apply", reason: `Your household lets WonderHome handle ${outcome.label} on its own, and this was clear. Undo it any time.`, question: null };
  }
  const area = kind === "grocery_item" ? "groceries" : "school";
  return { mode: "prepare", reason: `Your household has ${outcome.label} set to “Wait for Approval”, so WonderHome asks first.`, question: null, wait: { reason: "wait_for_approval", area, ...onList } };
}

/** An amount was said ("2 litres", or a number alone, 25-037), not left for WonderHome to pick. */
function hasAmount(extracted: ConfirmationInput["extracted"]): boolean {
  const quantity = Number(extracted?.quantity);
  return Number.isFinite(quantity) && quantity > 0;
}
