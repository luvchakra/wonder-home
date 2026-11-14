import type { PendingClarification } from "../conversation/clarify";
import type { HouseholdIntent } from "../conversation/intent";
import { normalizeWords, phraseKey, ruleFor, type HouseholdRule } from "./rules";

/**
 * HomeTalk's grocery words and the household's phrase rules (14-069): "add
 * atta" with "Atta (wheat flour)" and "Atta (multigrain)" on record asks once
 * "Should I use …?"; the pick is remembered as `phrase:atta → Atta (wheat
 * flour)`, so next time the same words go straight to that item. Pure.
 */

type Candidate = { entityType: string; label: string };

function candidatesOf(pending: Pick<PendingClarification, "parameters">): Candidate[] {
  const list = pending.parameters.candidates;
  return Array.isArray(list) ? (list as Candidate[]).filter((entry) => entry && entry.entityType === "consumable" && typeof entry.label === "string") : [];
}

function itemsOf(parameters: Record<string, unknown>): string[] {
  if (typeof parameters.item === "string") return [parameters.item];
  return Array.isArray(parameters.items) ? (parameters.items as unknown[]).filter((item): item is string => typeof item === "string") : [];
}

/** The words a person used and the grocery they picked when HomeTalk asked "Should I use …?"; null when nothing was picked from those choices. */
export function groceryPickLesson(pending: PendingClarification | null | undefined, answered: Pick<HouseholdIntent, "parameters"> | null | undefined): { phrase: string; item: string } | null {
  if (!pending || !answered || pending.parameters.awaiting !== "item") return null;
  const options = candidatesOf(pending);
  if (options.length < 2) return null;
  const asked = itemsOf(pending.parameters);
  const picked = itemsOf(answered.parameters);
  if (asked.length !== 1 || picked.length !== 1) return null;
  const item = options.find((option) => normalizeWords(picked[0])?.endsWith(normalizeWords(option.label) ?? "\u0000"));
  if (!item) return null;
  // The words before any amount ("2 kg atta" → "atta").
  const phrase = asked[0]!.replace(/^\s*[\d.,]+\s*[a-zA-Z]{0,6}\s+/, "").trim();
  return normalizeWords(phrase) && normalizeWords(phrase) !== normalizeWords(item.label) ? { phrase, item: item.label } : null;
}

/** The one grocery a phrase rule names among the choices, when the household taught it; null otherwise. */
export function groceryFromRule<T extends { name: string }>(phrase: string, choices: readonly T[], rules: readonly HouseholdRule[]): T | null {
  const rule = ruleFor(rules, "phrase_item", phraseKey(phrase));
  if (!rule?.valueText) return null;
  const found = choices.filter((choice) => normalizeWords(choice.name) === normalizeWords(rule.valueText));
  return found.length === 1 ? found[0]! : null;
}
