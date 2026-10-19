import { parsePreference } from "../../conversation/memory";
import type { HouseholdContextItem } from "../../context/types";
import { normaliseThing } from "./similarity";

/**
 * Associations (REM): what one record has to do with another across the
 * home. "Asmi likes pasta" and "Friday's dinner is pasta" sit in two modules
 * and no single record says they belong together; tonight's sleep says so,
 * as a link the household graph follows on later turns.
 *
 * Links are drawn by rules from the records, and a model may propose more;
 * a proposal stands only when both ends are real records and the kind is
 * one of these. A link adds a path to follow, never a fact: an answer still
 * rests on the records at both ends.
 */

export const LINK_KINDS = ["likes_what_is_planned", "same_thing", "part_of", "related"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export type HomeBrainLink = { from: string; to: string; kind: LinkKind; reason: string; strength: number; byModel: boolean };

type Preference = { item: HouseholdContextItem; memberId: string | null; positive: boolean; object: string; words: string[] };

/** Words too general to tie two records together. */
const GENERIC = new Set(["food", "dish", "meal", "thing", "stuff", "dinner", "lunch", "breakfast", "snack", "drink"]);

function preferenceOf(item: HouseholdContextItem): Preference | null {
  if (item.entityType === "memory") {
    const value = item.attributes.value as Record<string, unknown> | null;
    // A note kept before it was read into parts is read from its own sentence.
    const parsed = typeof value?.object !== "string" && typeof value?.statement === "string" ? parsePreference(value.statement) : null;
    const object = typeof value?.object === "string" ? value.object : (parsed?.object ?? null);
    const stance = typeof value?.stance === "string" ? value.stance : (parsed?.stance ?? null);
    if (!object || !stance) return null;
    return { item, memberId: item.subjectMemberIds[0] ?? null, positive: ["likes", "prefers", "okay_with"].includes(stance), object, words: wordsOf(object) };
  }
  if (item.entityType === "food_preference") {
    const object = typeof item.attributes.title === "string" ? item.attributes.title : null;
    if (!object) return null;
    return { item, memberId: (item.attributes.memberId as string | null) ?? null, positive: item.attributes.kind === "preference", object, words: wordsOf(object) };
  }
  return null;
}

function wordsOf(text: string): string[] {
  return normaliseThing(text).split(".").filter((word) => word.length > 2 && !GENERIC.has(word));
}

const titleOf = (item: HouseholdContextItem) => (typeof item.attributes.title === "string" ? item.attributes.title : "");

/** The rules' links over the whole store. Pure and deterministic. */
export function ruleLinks(items: readonly HouseholdContextItem[]): HomeBrainLink[] {
  const preferences = items.map(preferenceOf).filter((entry): entry is Preference => entry !== null && entry.words.length > 0);
  const targets = items.filter((item) => ["meal", "event", "consumable"].includes(item.entityType) && titleOf(item));
  const links: HomeBrainLink[] = [];
  const seen = new Set<string>();
  const add = (link: HomeBrainLink) => {
    const key = `${link.from}|${link.to}`;
    if (seen.has(key) || link.from === link.to) return;
    seen.add(key);
    links.push(link);
  };

  for (const preference of preferences) {
    const who = preference.item.summary.split(/\s+(?:likes|doesn't|does|is|avoids|prefers|loves)\b/)[0] ?? "Someone";
    for (const target of targets) {
      const title = new Set(wordsOf(titleOf(target)));
      if (!preference.words.every((word) => title.has(word))) continue;
      const what = target.entityType === "meal" ? `${titleOf(target)} is planned${typeof target.attributes.date === "string" ? ` for ${target.attributes.date}` : ""}` : target.entityType === "event" ? `"${titleOf(target)}" is on the calendar` : `${titleOf(target)} is kept at home`;
      add({
        from: preference.item.id,
        to: target.id,
        kind: preference.positive && target.entityType !== "consumable" ? "likes_what_is_planned" : "related",
        reason: `${who} ${preference.positive ? "likes" : "doesn't like"} ${preference.object}; ${what}`.slice(0, 200),
        strength: preference.positive ? 0.6 : 0.7,
        byModel: false,
      });
    }
  }

  // The same thing said in HomeTalk and on the Meals screen.
  for (const a of preferences) {
    for (const b of preferences) {
      if (a.item.id >= b.item.id || a.item.entityType === b.item.entityType || a.memberId !== b.memberId || a.positive !== b.positive) continue;
      if (normaliseThing(a.object) !== normaliseThing(b.object)) continue;
      add({ from: a.item.id, to: b.item.id, kind: "same_thing", reason: `Both say the same about ${a.object}`, strength: 0.8, byModel: false });
    }
  }
  return links;
}

/** A model's proposed link, kept only when both ends are records it was shown and the kind is known. */
export function validModelLinks(
  proposals: readonly { from: string; to: string; kind: string; reason: string }[],
  shown: ReadonlyMap<string, HouseholdContextItem>,
): HomeBrainLink[] {
  const links: HomeBrainLink[] = [];
  const seen = new Set<string>();
  for (const proposal of proposals) {
    const from = shown.get(proposal.from);
    const to = shown.get(proposal.to);
    if (!from || !to || from.id === to.id || from.domain === to.domain) continue;
    if (!(LINK_KINDS as readonly string[]).includes(proposal.kind)) continue;
    const reason = proposal.reason.trim().replace(/\s+/g, " ");
    if (!reason) continue;
    const key = `${from.id}|${to.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ from: from.id, to: to.id, kind: proposal.kind as LinkKind, reason: reason.slice(0, 200), strength: 0.45, byModel: true });
  }
  return links.slice(0, 15);
}

/** Puts the night's links on the store's items, so the graph built on a turn can follow them — only between items that viewer can see. */
export function attachLinks(items: HouseholdContextItem[], links: readonly { from: string; to: string; kind: LinkKind; reason: string }[]): HouseholdContextItem[] {
  if (links.length === 0) return items;
  const byFrom = new Map<string, { to: string; kind: LinkKind; reason: string }[]>();
  for (const link of links) byFrom.set(link.from, [...(byFrom.get(link.from) ?? []), { to: link.to, kind: link.kind, reason: link.reason }]);
  return items.map((item) => (byFrom.has(item.id) ? { ...item, attributes: { ...item.attributes, associations: byFrom.get(item.id) } } : item));
}
