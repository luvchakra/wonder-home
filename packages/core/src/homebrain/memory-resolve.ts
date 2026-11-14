import type { HouseholdContextItem } from "../context/types";
import { namesSchool, senderKey } from "../homesend/learned";
import type { HomeSendKind } from "../homesend/items";
import type { IntakePerson } from "../homesend/resolve";
import { isMixed, normalizeWords, phraseKey, placeKey, ruleFor, vendorKey, type HouseholdRule } from "./rules";

/**
 * HomeBrain's memory resolver (Nothing stuck in review, phase 3: "know
 * before asking"). Before HomeSend or HomeTalk asks a person who, which
 * school, which payee, which place, what area or which grocery, this fills
 * the gap from the household's own records and the rules it learned.
 *
 * Pure. It reads only the household's context items (members with their
 * schools, past bills and their payees, saved places, Responsibilities,
 * groceries) and its rules (`rules.ts`). It returns a value only when exactly
 * one answer is supported, with the evidence for "Why?" in the household's
 * own words, never a model's, and a confidence. Two answers that fit, a
 * mixed rule, or a person the household no longer has: nothing is filled,
 * and the caller asks as before.
 *
 * It never fills who a health document is for (a wrong guess shows one
 * person's health to another), never an amount, a date or an approval, and
 * never overrides what the content itself said.
 */

export const GAP_FIELDS = ["person", "school", "payee", "category", "place", "area", "item"] as const;
export type GapField = (typeof GAP_FIELDS)[number];

export type ResolveBasis =
  | "school_named"
  | "learned"
  | "only_at_school"
  | "only_school_on_record"
  | "payee_responsible"
  | "payee_on_record"
  | "category_on_record"
  | "place_on_record"
  | "item_on_record";

/** One line of "Why?", and the record or rule it came from. */
export type Evidence = { text: string; sourceId: string };

export type Filled = {
  field: GapField;
  value: { memberId?: string; text: string };
  basis: ResolveBasis;
  evidence: Evidence[];
  /** 0..1: how strongly the household's own records support it. */
  confidence: number;
};

export type GapInput = {
  kind: HomeSendKind;
  /** Which gaps the caller would otherwise ask about. */
  fields: readonly GapField[];
  /** The outside sender, when there is one. */
  sender?: string | null;
  /** The words the item came with (title, summary, source text). Untrusted: only matched, never followed. */
  text?: string | null;
  /** Who it could be for, as `resolveIntakePeople` narrowed them. */
  candidates?: readonly IntakePerson[];
  /** Who it is for, when already settled (to find their school). */
  personId?: string | null;
  /** The payee or shop as read. */
  vendor?: string | null;
  /** The words used for a grocery or a place ("atta", "nani's"). */
  phrase?: string | null;
};

export type HouseholdMemory = { items: readonly HouseholdContextItem[]; rules: readonly HouseholdRule[] };

export type Resolution = {
  filled: Filled[];
  /** Fields a rule would have settled but it was taught two values: ask, and say so. */
  mixed: GapField[];
};

/** At or above this, a filled gap is used instead of a question. */
export const FILL_AT = 0.8;

const CHILD_KINDS: ReadonlySet<HomeSendKind> = new Set(["school_item", "activity_item"]);
/** Kinds whose person a sender rule may fill; health is never one. */
const PERSON_KINDS: ReadonlySet<HomeSendKind> = new Set(["school_item", "activity_item", "event", "bill", "receipt"]);

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether `text` contains `words` as whole words, ignoring case. */
export function namesWords(text: string, words: string): boolean {
  const needle = normalizeWords(words);
  const hay = normalizeWords(text.slice(0, 4000)) ?? "";
  if (!needle || needle.length < 3) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(needle)}($|[^\\p{L}\\p{N}])`, "u").test(hay);
}

function firstName(item: HouseholdContextItem | undefined): string {
  const name = str(item?.attributes.displayName) ?? str(item?.aliases[0]) ?? "them";
  return name.split(/\s+/)[0]!;
}

function schoolsOf(item: HouseholdContextItem | undefined): string[] {
  const names = item?.attributes.schoolNames;
  return Array.isArray(names) ? names.map(str).filter((name): name is string => name !== null && name.length >= 3) : [];
}

function dateWords(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : ` (${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })})`;
}

function taughtBy(rule: HouseholdRule, members: Map<string, HouseholdContextItem>): string {
  const who = rule.learnedByMemberId ? members.get(rule.learnedByMemberId) : undefined;
  const verb = rule.source === "correction" ? "corrected it" : "said so";
  return `${who ? firstName(who) : "Someone in the household"} ${verb}${dateWords(rule.learnedAt)}${rule.times > 1 ? `, ${rule.times} times` : ""}`;
}

/** Stronger with each time a person gave the same value, never past 0.97. */
function learnedConfidence(rule: HouseholdRule): number {
  return Math.min(0.97, 0.88 + 0.03 * (rule.times - 1));
}

function resolvePerson(input: GapInput, memory: HouseholdMemory, members: Map<string, HouseholdContextItem>, mixed: GapField[]): Filled | null {
  if (!PERSON_KINDS.has(input.kind)) return null;
  const childOnly = CHILD_KINDS.has(input.kind);
  const candidates = (input.candidates ?? []).filter((person) => members.has(person.memberId) && (!childOnly || person.memberType === "child"));
  const text = input.text ?? "";
  const fill = (person: IntakePerson, basis: ResolveBasis, evidence: Evidence[], confidence: number): Filled => ({
    field: "person",
    value: { memberId: person.memberId, text: person.displayName },
    basis,
    evidence,
    confidence,
  });

  // 1. The content names the school exactly one candidate child is at.
  if (childOnly) {
    const bySchool = candidates.flatMap((person) => {
      const school = schoolsOf(members.get(person.memberId)).find((name) => namesSchool(text, name));
      return school ? [{ person, school }] : [];
    });
    if (bySchool.length === 1) {
      const { person, school } = bySchool[0]!;
      return fill(person, "school_named", [{ text: `It names ${school}, and ${firstName(members.get(person.memberId))} is the one at ${school} on record.`, sourceId: members.get(person.memberId)!.id }], 0.95);
    }
  }

  // 2. A rule: this sender's items were for this person before.
  const key = senderKey(input.sender);
  const ruleKind = childOnly ? "sender_child" : "sender_person";
  if (isMixed(memory.rules, ruleKind, key)) mixed.push("person");
  const rule = ruleFor(memory.rules, ruleKind, key);
  const person = rule?.valueMemberId ? candidates.find((candidate) => candidate.memberId === rule.valueMemberId) ?? (candidates.length === 0 && members.has(rule.valueMemberId) ? toPerson(members.get(rule.valueMemberId)!) : undefined) : undefined;
  if (rule && person && (!childOnly || person.memberType === "child")) {
    return fill(person, "learned", [{ text: `Items from ${key!.replace(/^sender:/, "")} were for ${person.displayName.split(/\s+/)[0]} before: ${taughtBy(rule, members)}.`, sourceId: `rule:${rule.id}` }], learnedConfidence(rule));
  }

  // 3. A school notice, and exactly one candidate child has a school on record.
  if (input.kind === "school_item" && candidates.length > 0) {
    const atSchool = candidates.filter((candidate) => schoolsOf(members.get(candidate.memberId)).length > 0);
    if (atSchool.length === 1) {
      const only = atSchool[0]!;
      return fill(only, "only_at_school", [{ text: `${only.displayName.split(/\s+/)[0]} is the only child with a school on record.`, sourceId: members.get(only.memberId)!.id }], 0.82);
    }
  }

  // 4. A bill from a payee on record goes to whoever handles that payee's bill.
  if (input.kind === "bill" && input.vendor) {
    const bills = memory.items.filter((item) => item.entityType === "bill" && vendorKey(str(item.attributes.payee)) === vendorKey(input.vendor));
    const handlers = [...new Set(bills.map((item) => item.subjectMemberIds[0]).filter((id): id is string => typeof id === "string" && members.has(id)))];
    if (handlers.length === 1) {
      const handler = members.get(handlers[0]!)!;
      return fill(toPerson(handler), "payee_responsible", [{ text: `${firstName(handler)} handles the ${str(bills[0]!.attributes.title) ?? "bill"} from ${str(bills[0]!.attributes.payee)}.`, sourceId: bills[0]!.id }], 0.85);
    }
  }
  return null;
}

function toPerson(item: HouseholdContextItem): IntakePerson {
  const type = str(item.attributes.memberType);
  return {
    memberId: item.entityId,
    displayName: str(item.attributes.displayName) ?? str(item.aliases[0]) ?? "",
    memberType: type === "child" || type === "helper" ? type : "adult",
  };
}

function resolveSchool(input: GapInput, members: Map<string, HouseholdContextItem>): Filled | null {
  if (!input.personId) return null;
  const member = members.get(input.personId);
  const schools = schoolsOf(member);
  const named = schools.filter((school) => namesSchool(input.text ?? "", school));
  if (named.length === 1) return { field: "school", value: { text: named[0]! }, basis: "school_named", evidence: [{ text: `It names ${named[0]}, ${firstName(member)}'s school on record.`, sourceId: member!.id }], confidence: 0.95 };
  if (schools.length === 1) return { field: "school", value: { text: schools[0]! }, basis: "only_school_on_record", evidence: [{ text: `${firstName(member)}'s only school on record is ${schools[0]}.`, sourceId: member!.id }], confidence: 0.9 };
  return null;
}

function payeesOnRecord(items: readonly HouseholdContextItem[]): Map<string, { name: string; item: HouseholdContextItem }> {
  const payees = new Map<string, { name: string; item: HouseholdContextItem }>();
  for (const item of items) {
    if (item.entityType !== "bill" && item.entityType !== "order") continue;
    const name = str(item.entityType === "bill" ? item.attributes.payee : item.attributes.title);
    const key = vendorKey(name);
    if (name && key && !payees.has(key)) payees.set(key, { name, item });
  }
  return payees;
}

function resolvePayee(input: GapInput, memory: HouseholdMemory): Filled | null {
  const text = input.text ?? "";
  const named = [...payeesOnRecord(memory.items).values()].filter((payee) => namesWords(text, payee.name));
  if (named.length !== 1) return null;
  const { name, item } = named[0]!;
  return { field: "payee", value: { text: name }, basis: "payee_on_record", evidence: [{ text: `It names ${name}, a payee on your ${str(item.attributes.title) ?? "bills"}.`, sourceId: item.id }], confidence: 0.9 };
}

function resolveCategory(input: GapInput, memory: HouseholdMemory, members: Map<string, HouseholdContextItem>, mixed: GapField[]): Filled | null {
  const key = vendorKey(input.vendor);
  if (!key) return null;
  if (isMixed(memory.rules, "vendor_category", key)) mixed.push("category");
  const rule = ruleFor(memory.rules, "vendor_category", key);
  if (rule?.valueText) {
    return { field: "category", value: { text: rule.valueText }, basis: "learned", evidence: [{ text: `${input.vendor} is ${rule.valueText}: ${taughtBy(rule, members)}.`, sourceId: `rule:${rule.id}` }], confidence: learnedConfidence(rule) };
  }
  const kinds = [...new Set(memory.items.filter((item) => item.entityType === "bill" && vendorKey(str(item.attributes.payee)) === key).map((item) => str(item.attributes.kind)).filter((kind): kind is string => kind !== null))];
  if (kinds.length === 1) {
    const bill = memory.items.find((item) => item.entityType === "bill" && vendorKey(str(item.attributes.payee)) === key)!;
    return { field: "category", value: { text: kinds[0]! }, basis: "category_on_record", evidence: [{ text: `Your ${str(bill.attributes.title) ?? "bill"} from ${input.vendor} is ${kinds[0]!.replace(/_/g, " ")}.`, sourceId: bill.id }], confidence: 0.85 };
  }
  return null;
}

function resolvePlace(input: GapInput, memory: HouseholdMemory, members: Map<string, HouseholdContextItem>, mixed: GapField[]): Filled | null {
  const places = memory.items.filter((item) => item.entityType === "place" && (str(item.attributes.status) ?? "saved") === "saved");
  const byName = (name: string) => places.filter((place) => normalizeWords(str(place.attributes.title)) === normalizeWords(name));
  const key = placeKey(input.phrase);
  if (isMixed(memory.rules, "place_alias", key)) mixed.push("place");
  const rule = ruleFor(memory.rules, "place_alias", key);
  if (rule?.valueText) {
    const found = byName(rule.valueText);
    // A place the household no longer has is simply not chosen.
    if (found.length === 1) return { field: "place", value: { text: str(found[0]!.attributes.title)! }, basis: "learned", evidence: [{ text: `"${input.phrase}" is ${rule.valueText}: ${taughtBy(rule, members)}.`, sourceId: `rule:${rule.id}` }], confidence: learnedConfidence(rule) };
  }
  const words = input.phrase ?? input.text ?? "";
  const named = places.filter((place) => {
    const title = str(place.attributes.title);
    return title ? normalizeWords(words) === normalizeWords(title) || namesWords(words, title) : false;
  });
  if (named.length === 1) {
    const title = str(named[0]!.attributes.title)!;
    return { field: "place", value: { text: title }, basis: "place_on_record", evidence: [{ text: `${title} is a place your family saved.`, sourceId: named[0]!.id }], confidence: 0.9 };
  }
  return null;
}

function resolveArea(input: GapInput, memory: HouseholdMemory, members: Map<string, HouseholdContextItem>, mixed: GapField[]): Filled | null {
  const key = senderKey(input.sender);
  if (isMixed(memory.rules, "sender_area", key)) mixed.push("area");
  const rule = ruleFor(memory.rules, "sender_area", key);
  if (!rule?.valueText) return null;
  return { field: "area", value: { text: rule.valueText }, basis: "learned", evidence: [{ text: `Items from ${key!.replace(/^sender:/, "")} were ${rule.valueText.replace(/_/g, " ")} before: ${taughtBy(rule, members)}.`, sourceId: `rule:${rule.id}` }], confidence: learnedConfidence(rule) };
}

function resolveItem(input: GapInput, memory: HouseholdMemory, members: Map<string, HouseholdContextItem>, mixed: GapField[]): Filled | null {
  const groceries = memory.items.filter((item) => item.entityType === "consumable");
  const title = (item: HouseholdContextItem) => str(item.attributes.title) ?? "";
  const key = phraseKey(input.phrase);
  if (isMixed(memory.rules, "phrase_item", key)) mixed.push("item");
  const rule = ruleFor(memory.rules, "phrase_item", key);
  if (rule?.valueText) {
    const found = groceries.filter((item) => normalizeWords(title(item)) === normalizeWords(rule.valueText));
    const text = found.length === 1 ? title(found[0]!) : rule.valueText;
    return { field: "item", value: { text }, basis: "learned", evidence: [{ text: `"${input.phrase}" means ${text}: ${taughtBy(rule, members)}.`, sourceId: `rule:${rule.id}` }], confidence: learnedConfidence(rule) };
  }
  if (!input.phrase) return null;
  const exact = groceries.filter((item) => normalizeWords(title(item)) === normalizeWords(input.phrase));
  if (exact.length === 1) return { field: "item", value: { text: title(exact[0]!) }, basis: "item_on_record", evidence: [{ text: `${title(exact[0]!)} is on your groceries.`, sourceId: exact[0]!.id }], confidence: 0.95 };
  // "atta" → "Atta (wheat flour)": the words are a whole word of exactly one grocery's name.
  const partial = groceries.filter((item) => namesWords(title(item), input.phrase!));
  if (partial.length === 1) return { field: "item", value: { text: title(partial[0]!) }, basis: "item_on_record", evidence: [{ text: `The only grocery on record called "${input.phrase}" is ${title(partial[0]!)}.`, sourceId: partial[0]!.id }], confidence: 0.85 };
  return null;
}

/** Fills every gap the household's memory settles. */
export function resolveGaps(input: GapInput, memory: HouseholdMemory): Resolution {
  const members = new Map(memory.items.filter((item) => item.entityType === "member").map((item) => [item.entityId, item]));
  const mixed: GapField[] = [];
  const filled: Filled[] = [];
  for (const field of new Set(input.fields)) {
    const result =
      field === "person" ? resolvePerson(input, memory, members, mixed)
      : field === "school" ? resolveSchool(input, members)
      : field === "payee" ? resolvePayee(input, memory)
      : field === "category" ? resolveCategory(input, memory, members, mixed)
      : field === "place" ? resolvePlace(input, memory, members, mixed)
      : field === "area" ? resolveArea(input, memory, members, mixed)
      : resolveItem(input, memory, members, mixed);
    if (result) filled.push(result);
  }
  return { filled, mixed: [...new Set(mixed)] };
}

/** The filled value for a field, when it is strong enough to use instead of a question. */
export function usable(resolution: Resolution, field: GapField): Filled | null {
  const found = resolution.filled.find((entry) => entry.field === field);
  return found && found.confidence >= FILL_AT ? found : null;
}

/** "Why?" for a filled gap: the evidence lines, in the household's words. Never a model's. */
export function whyFilled(filled: Filled): string {
  return filled.evidence.map((line) => line.text).join(" ");
}
