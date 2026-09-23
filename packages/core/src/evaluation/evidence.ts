import type { SupabaseClient } from "@supabase/supabase-js";

import type { CorrectableAction } from "../conversation/corrections";
import type { HouseholdIntent } from "../conversation/intent";
import { promptVersion } from "./prompt-version";

/**
 * Corrections as evaluation evidence (Wave 5 §13).
 *
 * When a person corrects what WonderHome understood, each corrected field
 * becomes one row of evidence: what was believed, what the person said, and
 * what kind of mistake that was. Examples:
 *
 *   - "No, I meant Manan" — `memberName`, Asmi → Manan, false_entity_match.
 *   - "Not milk, almond milk" — `item`, milk → almond milk, wrong_item.
 *   - A HomeSend bill whose amount the person fixed — `amount`, wrong_amount.
 *
 * The derivations are pure. `recordCorrectionEvidence` writes them,
 * append-only, through the service role after the turn's or review's own
 * authorization. Recording is best-effort: evidence must never cost the
 * household the correction itself.
 */

export type CorrectionErrorType =
  | "false_entity_match"
  | "wrong_date"
  | "wrong_interpretation"
  | "wrong_amount"
  | "wrong_item"
  | "wrong_classification"
  | "wrong_fact";

export type CorrectionEvidence = {
  field: string;
  modelValue: string | null;
  humanValue: string | null;
  errorType: CorrectionErrorType;
};

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const said = (typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)).trim();
  return said ? said.slice(0, 200) : null;
};
const differs = (a: string | null, b: string | null) => (a ?? "").toLowerCase() !== (b ?? "").toLowerCase();

function itemsOf(parameters: Record<string, unknown>): string | null {
  if (typeof parameters.item === "string" && parameters.item.trim()) return parameters.item.trim();
  if (Array.isArray(parameters.items)) {
    const items = parameters.items.filter((item): item is string => typeof item === "string");
    return items.length > 0 ? items.join(", ") : null;
  }
  return null;
}

function personOf(parameters: Record<string, unknown>, reference: string | null): string | null {
  return text(parameters.memberName) ?? text(parameters.targetReference) ?? reference;
}

/**
 * A HomeTalk correction: the request as it was stored, against the corrected
 * one as it was grounded. The reference is what each named as its target
 * (a person, for a request about one).
 */
export function hometalkCorrectionEvidence(
  subject: CorrectableAction,
  corrected: Pick<HouseholdIntent, "parameters" | "target">,
): CorrectionEvidence[] {
  const before = subject.parameters;
  const after = corrected.parameters;
  const evidence: CorrectionEvidence[] = [];

  const beforeItems = itemsOf(before);
  const afterItems = itemsOf(after);
  if (beforeItems && afterItems && differs(beforeItems, afterItems)) {
    evidence.push({ field: "item", modelValue: beforeItems, humanValue: afterItems, errorType: "wrong_item" });
  }

  const beforeWho = personOf(before, subject.outcomeKey);
  const afterWho = personOf(after, corrected.target.reference ?? null);
  const beforeId = text(before.memberId);
  const afterId = text(after.memberId);
  if ((beforeId && afterId && beforeId !== afterId) || (!beforeItems && beforeWho && afterWho && differs(beforeWho, afterWho))) {
    evidence.push({ field: "memberName", modelValue: beforeWho, humanValue: afterWho, errorType: "false_entity_match" });
  }

  for (const key of ["when", "to"] as const) {
    const was = text(before[key]);
    const now = text(after[key]);
    if (was && now && differs(was, now)) evidence.push({ field: key, modelValue: was, humanValue: now, errorType: "wrong_date" });
  }
  return evidence;
}

/** What HomeSend read, against what the person confirmed on the review form. */
export function homesendCorrectionEvidence(
  read: { kind: string | null; title: string | null; date: string | null; amount: number | null; quantity: number | null },
  confirmed: { kind: string; title: string; date: string | null; amount: number | null; quantity: number | null },
): CorrectionEvidence[] {
  const evidence: CorrectionEvidence[] = [];
  if (read.kind && read.kind !== "unknown" && read.kind !== confirmed.kind) {
    evidence.push({ field: "kind", modelValue: read.kind, humanValue: confirmed.kind, errorType: "wrong_classification" });
  }
  if (differs(text(read.title), text(confirmed.title))) {
    evidence.push({ field: "title", modelValue: text(read.title), humanValue: text(confirmed.title), errorType: "wrong_interpretation" });
  }
  const readDate = read.date?.slice(0, 10) ?? null;
  const confirmedDate = confirmed.date?.slice(0, 10) ?? null;
  if (differs(readDate, confirmedDate)) evidence.push({ field: "date", modelValue: readDate, humanValue: confirmedDate, errorType: "wrong_date" });
  if (confirmed.kind === "bill" && read.amount !== confirmed.amount) {
    evidence.push({ field: "amount", modelValue: text(read.amount), humanValue: text(confirmed.amount), errorType: "wrong_amount" });
  }
  if (confirmed.kind === "grocery_item" && read.quantity !== null && read.quantity !== confirmed.quantity) {
    evidence.push({ field: "quantity", modelValue: text(read.quantity), humanValue: text(confirmed.quantity), errorType: "wrong_amount" });
  }
  return evidence;
}

/** A HomeBrain Review correction: the belief as held, and what the person says is true instead. */
export function homebrainCorrectionEvidence(claim: string, correction: string): CorrectionEvidence[] {
  return differs(text(claim), text(correction)) ? [{ field: "claim", modelValue: text(claim), humanValue: text(correction), errorType: "wrong_fact" }] : [];
}

export async function recordCorrectionEvidence(
  admin: SupabaseClient,
  input: {
    householdId: string;
    surface: "hometalk" | "homesend" | "homebrain";
    sourceType: "conversation_action" | "home_send_item" | "certification_item";
    sourceId: string | null;
    memberId: string | null;
    understandingSource?: "model" | "rules" | null;
    evidence: readonly CorrectionEvidence[];
  },
): Promise<number> {
  if (input.evidence.length === 0) return 0;
  const version = promptVersion();
  const { error } = await admin.from("ai_corrections").insert(
    input.evidence.map((entry) => ({
      household_id: input.householdId,
      surface: input.surface,
      source_type: input.sourceType,
      source_id: input.sourceId,
      error_type: entry.errorType,
      field: entry.field,
      model_value: entry.modelValue,
      human_value: entry.humanValue,
      understanding_source: input.understandingSource ?? null,
      prompt_version: version,
      corrected_by_member_id: input.memberId,
    })),
  );
  if (error) throw new Error(`recordCorrectionEvidence failed: ${error.code ?? "unknown"}`);
  return input.evidence.length;
}
