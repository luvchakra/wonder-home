import { decideAutonomy, type AutonomyMode } from "../household/autonomy";
import type { HomeSendExtraction, HomeSendKind } from "./items";
import type { HomeSendReconciliation } from "./reconcile";
import type { SubjectResolution } from "./resolve";
import type { IntakeUnderstanding } from "./understanding";
import { DEFAULT_AUTO_ADD_PERCENT } from "./auto-add";
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
  extracted: Pick<HomeSendExtraction, "title" | "needs" | "confidence"> | null;
  understanding: Pick<IntakeUnderstanding, "readable" | "confidence" | "safety" | "score" | "check"> | null;
  reconciliation: Pick<HomeSendReconciliation, "message" | "proposal"> | null;
  subject: Pick<SubjectResolution, "question" | "selected"> | null;
  /** A member sent it in themselves; an email arrives with nobody in the household acting. */
  memberInitiated: boolean;
  /** The household's own setting for this kind's outcome; "prepare" when nothing is configured. */
  autonomy: AutonomyMode;
  /** How sure, in percent, a reading must be (strictly above) to be added on its own (`auto-add.ts`); 95 when unset. */
  autoAddPercent?: number;
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

  const consequential = CONSEQUENTIAL[kind];
  if (consequential) return { mode: "govern", reason: consequential, question: null };

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

  if (input.reconciliation) return { mode: "prepare", reason: input.reconciliation.message, question: null };
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
  if (!aboveBar || unverified.includes(FROM_A_FILE)) return { mode: "prepare", reason: notSureEnough(unverified, percent), question: null };

  const decision = decideAutonomy(input.autonomy, { outcomeKey: outcome.outcomeKey, kind: "schedule", reversible: true });
  if (decision.outcome === "execute") {
    return { mode: "auto_apply", reason: `Your household lets WonderHome handle ${outcome.label} on its own, and this was clear. Undo it any time.`, question: null };
  }
  return { mode: "prepare", reason: `Your household has ${outcome.label} set to “Wait for Approval”, so WonderHome asks first.`, question: null };
}
