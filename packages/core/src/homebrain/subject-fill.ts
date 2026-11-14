import type { HouseholdContextItem } from "../context/types";
import { inferSubject, type InferredSubject, type LearnedDefault } from "../homesend/learned";
import type { HomeSendKind } from "../homesend/items";
import type { SubjectResolution } from "../homesend/resolve";
import { resolveGaps, usable, whyFilled } from "./memory-resolve";
import type { HouseholdRule } from "./rules";

/**
 * "Who is this for?" before HomeSend asks it (14-069): first the 14-066
 * inference (`inferSubject`), then HomeBrain's memory resolver over every
 * rule the household taught (a sender's person, not only a sender's child).
 * A name the content used, an unknown person, a health document, or two
 * answers that fit: unchanged, and the household is asked as before.
 * Returns the subject, and "Why?" from evidence when memory filled it.
 */
export function fillSubject(
  kind: HomeSendKind,
  subject: SubjectResolution,
  context: { items: readonly HouseholdContextItem[]; rules: readonly HouseholdRule[]; sender: string | null | undefined; text: string },
): InferredSubject & { why?: string } {
  const learned: LearnedDefault[] = context.rules
    .filter((rule) => rule.kind === "sender_child" && rule.valueMemberId)
    .map((rule) => ({ id: rule.id, kind: "sender_child", key: rule.key, valueMemberId: rule.valueMemberId!, learnedByMemberId: rule.learnedByMemberId, learnedFromItemId: rule.learnedFromItemId, learnedAt: rule.learnedAt, mixed: rule.mixed }));
  const inferred = inferSubject(kind, subject, { items: context.items, learned, sender: context.sender, text: context.text });
  if (inferred.selected || inferred.unknown || inferred.said !== null || !inferred.question) return inferred;
  const resolution = resolveGaps({ kind, fields: ["person"], sender: context.sender ?? null, text: context.text, candidates: inferred.candidates }, { items: context.items, rules: context.rules });
  const filled = usable(resolution, "person");
  const person = filled ? inferred.candidates.find((candidate) => candidate.memberId === filled.value.memberId) : undefined;
  if (!filled || !person) return inferred;
  return { said: null, selected: person, candidates: inferred.candidates, question: null, basis: "learned", why: whyFilled(filled) };
}
