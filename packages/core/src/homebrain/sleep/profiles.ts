import { parsePreference } from "../../conversation/memory";
import type { HouseholdContextItem, PrivacyClass } from "../../context/types";
import { dayWords } from "../say";

/**
 * A person at a glance (the cortex's schema): what someone likes, who they
 * are to the family, what they look after and what is next for them — one
 * fact, built on the turn from the items this viewer may already see.
 *
 * Built per turn, never stored: it can hold nothing the person asking could
 * not read item by item, and it is never older than those items. Health and
 * money are never in it; a child's profile carries the child class.
 */

export type ProfileFact = {
  memberId: string;
  statement: string;
  privacyClass: PrivacyClass;
  sourceItemIds: string[];
  /** The same at-a-glance, in parts, for a line a person reads (`familyGlances`). Never allergies: those are health. */
  parts: { likes: string[]; dislikes: string[]; looksAfter: string[]; next: { title: string; date: string }[] };
};

const MAX_THINGS = 8;

const stanceOf = (item: HouseholdContextItem): { positive: boolean; allergic: boolean; object: string } | null => {
  if (item.entityType === "memory") {
    const value = item.attributes.value as Record<string, unknown> | null;
    // A note kept only as a sentence is read from the sentence.
    const parsed = typeof value?.object !== "string" && typeof value?.statement === "string" ? parsePreference(value.statement) : null;
    const object = typeof value?.object === "string" ? value.object : (parsed?.object ?? null);
    const stance = typeof value?.stance === "string" ? value.stance : (parsed?.stance ?? null);
    if (!object || !stance) return null;
    return { positive: ["likes", "prefers", "okay_with"].includes(stance), allergic: stance === "allergic", object };
  }
  if (item.entityType === "food_preference" && typeof item.attributes.title === "string") {
    return { positive: item.attributes.kind === "preference", allergic: item.attributes.kind === "allergy", object: item.attributes.title };
  }
  return null;
};

const listOf = (things: readonly string[]) => {
  const unique = [...new Map(things.map((thing) => [thing.toLowerCase(), thing])).values()];
  const shown = unique.slice(0, MAX_THINGS);
  return `${shown.join(", ")}${unique.length > shown.length ? ` and ${unique.length - shown.length} more` : ""}`;
};

export function profileFacts(items: readonly HouseholdContextItem[], options: { memberIds: readonly string[]; today: string }): ProfileFact[] {
  const members = new Map(items.filter((item) => item.entityType === "member").map((item) => [item.entityId, item]));
  const nameOf = (id: string) => {
    const member = members.get(id);
    const name = typeof member?.attributes.displayName === "string" ? member.attributes.displayName : null;
    return name ? (name.split(/\s+/)[0] ?? name) : null;
  };
  const facts: ProfileFact[] = [];
  for (const memberId of options.memberIds) {
    const name = nameOf(memberId);
    if (!name) continue;
    const about = items.filter((item) => item.subjectMemberIds.includes(memberId) && (item.privacyClass === "general" || item.privacyClass === "child") && item.freshness !== "superseded");
    const used: string[] = [];
    const likes: string[] = [];
    const dislikes: string[] = [];
    const allergies: string[] = [];
    for (const item of about) {
      const stance = stanceOf(item);
      if (!stance || item.attributes.resting === true) continue;
      (stance.allergic ? allergies : stance.positive ? likes : dislikes).push(stance.object);
      used.push(item.id);
    }
    const family: string[] = [];
    for (const item of about.filter((entry) => entry.entityType === "relationship")) {
      const other = item.attributes.memberId === memberId ? (item.attributes.relatedMemberId as string) : (item.attributes.memberId as string);
      const otherName = nameOf(other);
      if (!otherName) continue;
      family.push(item.attributes.memberId === memberId ? `${item.attributes.relation} of ${otherName}` : `${otherName} is their ${item.attributes.relation}`);
      used.push(item.id);
    }
    const looksAfter = about.filter((item) => item.entityType === "responsibility" && item.subjectMemberIds[0] === memberId).map((item) => String(item.attributes.title ?? "")).filter(Boolean);
    used.push(...about.filter((item) => item.entityType === "responsibility" && item.subjectMemberIds[0] === memberId).map((item) => item.id));
    const coming = about
      .filter((item) => (item.entityType === "event" || item.entityType === "school_item") && typeof item.attributes.date === "string" && (item.attributes.date as string) >= options.today)
      .sort((a, b) => String(a.attributes.date).localeCompare(String(b.attributes.date)))
      .slice(0, 2);
    used.push(...coming.map((item) => item.id));

    const parts = [
      likes.length > 0 ? `likes ${listOf(likes)}` : null,
      dislikes.length > 0 ? `doesn't like ${listOf(dislikes)}` : null,
      allergies.length > 0 ? `is allergic to ${listOf(allergies)}` : null,
      family.length > 0 ? `family: ${family.join(", ")}` : null,
      looksAfter.length > 0 ? `looks after ${listOf(looksAfter)}` : null,
      coming.length > 0 ? `next: ${coming.map((item) => `${String(item.attributes.title ?? item.summary.split(/[.;]/)[0])} on ${String(item.attributes.date).slice(0, 10)}`).join("; ")}` : null,
    ].filter((part): part is string => part !== null);
    if (parts.length === 0) continue;
    const child = about.some((item) => used.includes(item.id) && item.privacyClass === "child") || members.get(memberId)?.attributes.memberType === "child";
    facts.push({
      memberId,
      statement: `${name} at a glance: ${parts.join("; ")}`,
      privacyClass: child ? "child" : "general",
      sourceItemIds: [...new Set(used)],
      parts: { likes, dislikes, looksAfter, next: coming.map((item) => ({ title: String(item.attributes.title ?? item.summary.split(/[.;]/)[0]), date: String(item.attributes.date).slice(0, 10) })) },
    });
  }
  return facts;
}

/**
 * Each family member at a glance, as one line a person reads — for "what do
 * you know about the family?" (`conversation/roster.ts`): what they like,
 * what they look after, what is next for them, with days in words. Built
 * from the asker's own items, like `profileFacts`, and like it never health
 * or money: allergies stay out of the line. A member with nothing on record
 * has no line.
 */
export function familyGlances(items: readonly HouseholdContextItem[], options: { memberIds: readonly string[]; today: string }): Map<string, string> {
  const out = new Map<string, string>();
  for (const fact of profileFacts(items, options)) {
    const { likes, dislikes, looksAfter, next } = fact.parts;
    const line = [
      likes.length > 0 ? `likes ${listOf(likes)}` : null,
      dislikes.length > 0 ? `doesn't like ${listOf(dislikes)}` : null,
      looksAfter.length > 0 ? `looks after ${listOf(looksAfter.map((thing) => thing.toLowerCase()))}` : null,
      next.length > 0 ? `next: ${next.map((entry) => `${entry.title} (${dayWords(entry.date)})`).join(", ")}` : null,
    ].filter((part): part is string => part !== null);
    if (line.length > 0) out.set(fact.memberId, line.join("; "));
  }
  return out;
}
