import { decideAutonomy, type AutonomyMode } from "../household/autonomy";
import type { HomeSendExtraction, HomeSendKind } from "./items";
import type { HomeSendReconciliation } from "./reconcile";
import type { SubjectResolution } from "./resolve";
import type { IntakeUnderstanding } from "./understanding";

/**
 * How HomeSend confirms what it read (Wave 3 §12):
 *
 *   - high confidence, safe and reversible → may apply on its own, but only
 *     where the domain allows it AND the household's own autonomy setting
 *     for that outcome says "execute";
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
};

const KIND_LABEL: Record<HomeSendKind, string> = {
  bill: "a bill",
  school_item: "school work",
  grocery_item: "something to buy",
  health_document: "a health document",
  unknown: "something",
};

export type ConfirmationInput = {
  kind: HomeSendKind | null;
  extracted: Pick<HomeSendExtraction, "title" | "needs" | "confidence"> | null;
  understanding: Pick<IntakeUnderstanding, "readable" | "confidence" | "safety"> | null;
  reconciliation: Pick<HomeSendReconciliation, "message" | "proposal"> | null;
  subject: Pick<SubjectResolution, "question" | "selected"> | null;
  /** A member sent it in themselves; an email arrives with nobody in the household acting. */
  memberInitiated: boolean;
  /** The household's own setting for this kind's outcome; "observe" when nothing is configured. */
  autonomy: AutonomyMode;
};

export function decideConfirmation(input: ConfirmationInput): ConfirmationDecision {
  const kind = input.kind;
  const title = input.extracted?.title?.trim() ?? "";

  if (!kind || kind === "unknown" || input.understanding?.readable === false) {
    return { mode: "ask", reason: "WonderHome couldn't tell what this is.", question: "What is this — a bill, school work, something to buy or a health document?" };
  }

  const consequential = CONSEQUENTIAL[kind];
  if (consequential) return { mode: "govern", reason: consequential, question: null };

  const confidence = input.understanding?.confidence ?? input.extracted?.confidence ?? "low";
  if (confidence === "low" || !title) {
    const question = input.subject?.question ?? (title ? `Is this ${KIND_LABEL[kind]}: “${title}”?` : "What is it?");
    return { mode: "ask", reason: "WonderHome isn't sure it read this right.", question };
  }
  if (input.subject?.question) return { mode: "ask", reason: "It doesn't say who it's for.", question: input.subject.question };
  if (kind === "school_item" && !input.subject?.selected) return { mode: "ask", reason: "It doesn't say who it's for.", question: "Who is this for?" };

  if (input.reconciliation) return { mode: "prepare", reason: input.reconciliation.message, question: null };
  if (confidence === "medium") return { mode: "prepare", reason: "WonderHome read it, but not surely enough to act on its own.", question: null };
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

  const decision = decideAutonomy(input.autonomy, { outcomeKey: outcome.outcomeKey, kind: "schedule", reversible: true });
  if (decision.outcome === "execute") {
    return { mode: "auto_apply", reason: `Your household lets WonderHome handle ${outcome.label} on its own, and this was clear. Undo it any time.`, question: null };
  }
  return { mode: "prepare", reason: `Your household has ${outcome.label} set to “${input.autonomy}”, so WonderHome asks first.`, question: null };
}
