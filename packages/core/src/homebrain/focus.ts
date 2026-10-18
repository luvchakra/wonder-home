import type { HouseholdContextItem } from "../context/types";
import type { FocusEntity } from "../conversation/references";
import { answeringFacts } from "./answer";
import type { HomeBrainAnswer } from "./turn";

/**
 * What an answer was about, for the next turn's "it" (Wave 4 §8).
 *
 * "When is the Science project due?" — "Tuesday" — "move it to Friday": the
 * "it" is the project the answer was made of. So a turn HomeBrain answered
 * keeps, as its focus, the records its answering facts came from. Only a
 * few: an answer that lists five things is not about any one of them, and
 * "it" after it should be a question, not the first line. People and the
 * household itself are never an "it" — a name is resolved as a name.
 */

const MOST = 3;
const NEVER_IT = new Set(["member", "household", "conflict"]);

export function focusFromAnswer(answer: Pick<HomeBrainAnswer, "text" | "facts" | "reading" | "mode">, items: readonly HouseholdContextItem[], at: string): FocusEntity[] {
  if (!answer.text || answer.mode !== "answer") return [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const records = new Map<string, HouseholdContextItem>();
  for (const fact of answeringFacts(answer.facts, answer.reading)) {
    const item = fact.itemId ? byId.get(fact.itemId) : undefined;
    if (!item || NEVER_IT.has(item.entityType)) continue;
    records.set(item.id, item);
  }
  if (records.size === 0 || records.size > MOST) return [];
  return [...records.values()].map((item) => ({ entityType: item.entityType, entityId: item.entityId, label: labelOf(item), source: "mention", at }));
}

function labelOf(item: HouseholdContextItem): string {
  const { title, name } = item.attributes;
  if (typeof title === "string" && title) return title;
  if (typeof name === "string" && name) return name;
  return item.aliases[0] ?? item.summary;
}
