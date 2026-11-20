import type { HouseholdContextItem } from "../context/types";
import { inferSubject, type InferredSubject, type LearnedDefault } from "../homesend/learned";
import type { HomeSendKind } from "../homesend/items";
import type { SubjectResolution } from "../homesend/resolve";
import { childrenAtSchool, resolveGaps, usable, whyFilled, type SenderHistory } from "./memory-resolve";
import type { IntakePerson } from "../homesend/resolve";
import type { HouseholdRule } from "./rules";

/**
 * "Who is this for?" before HomeSend asks it (14-069): first the 14-066
 * inference (`inferSubject`), then HomeBrain's memory resolver over every
 * rule the household taught (a sender's person, not only a sender's child).
 * A name the content used, an unknown person, a health document, or two
 * answers that fit: unchanged, and the household is asked as before.
 * Returns the subject, and "Why?" from evidence when memory filled it.
 *
 * Since 2026-11-20 the resolver also reads the class, the teacher, the
 * child's timetable and this sender's earlier notices (`history`). A school
 * notice still not placed with one child is recorded for every child at the
 * one school it can be placed at (`everyone`, two or more), Checking, instead
 * of asking; the first of them is `selected`.
 */
export function fillSubject(
  kind: HomeSendKind,
  subject: SubjectResolution,
  context: {
    items: readonly HouseholdContextItem[];
    rules: readonly HouseholdRule[];
    sender: string | null | undefined;
    text: string;
    /** The sender is on "Who may file health records for others" (the owner, 2026-11-20). */
    healthFiler?: boolean;
    /** What this sender's earlier items became (`homesend/sender-history.ts`). */
    history?: SenderHistory | null;
  },
): InferredSubject & { why?: string; everyone?: IntakePerson[] } {
  // A health document: only for an allowed sender, from the one member its own words name (never a rule); else unchanged.
  if (kind === "health_document") {
    if (!context.healthFiler || subject.selected || subject.unknown) return subject;
    const resolution = resolveGaps({ kind, fields: ["person"], text: context.text, candidates: subject.candidates, healthFiler: true }, { items: context.items, rules: [] });
    const filled = usable(resolution, "person");
    if (!filled?.value.memberId) return subject;
    const item = context.items.find((entry) => entry.entityType === "member" && entry.entityId === filled.value.memberId);
    const memberType = item?.attributes.memberType === "child" ? "child" : "adult";
    const person = subject.candidates.find((candidate) => candidate.memberId === filled.value.memberId) ?? { memberId: filled.value.memberId, displayName: filled.value.text, memberType };
    return { said: subject.said, selected: person, candidates: subject.candidates.length > 0 ? subject.candidates : [person], question: null, basis: "learned", why: whyFilled(filled) };
  }
  const learned: LearnedDefault[] = context.rules
    .filter((rule) => rule.kind === "sender_child" && rule.valueMemberId)
    .map((rule) => ({ id: rule.id, kind: "sender_child", key: rule.key, valueMemberId: rule.valueMemberId!, learnedByMemberId: rule.learnedByMemberId, learnedFromItemId: rule.learnedFromItemId, learnedAt: rule.learnedAt, mixed: rule.mixed }));
  const inferred = inferSubject(kind, subject, { items: context.items, learned, sender: context.sender, text: context.text });
  if (inferred.selected || inferred.unknown || inferred.said !== null || !inferred.question) return inferred;
  const memory = { items: context.items, rules: context.rules };
  const resolution = resolveGaps({ kind, fields: ["person"], sender: context.sender ?? null, text: context.text, candidates: inferred.candidates, history: context.history ?? null }, memory);
  const filled = usable(resolution, "person");
  const person = filled ? inferred.candidates.find((candidate) => candidate.memberId === filled.value.memberId) : undefined;
  if (!filled || !person) {
    // A rule taught two children is a real "which one?": asked, never spread across both.
    if (resolution.mixed.includes("person")) return inferred;
    const all = childrenAtSchool({ kind, text: context.text, candidates: inferred.candidates, history: context.history ?? null }, memory);
    if (!all) return inferred;
    return { said: null, selected: all.people[0]!, candidates: inferred.candidates, question: null, basis: "learned", why: all.evidence.map((line) => line.text).join(" "), everyone: all.people };
  }
  return { said: null, selected: person, candidates: inferred.candidates, question: null, basis: "learned", why: whyFilled(filled) };
}
