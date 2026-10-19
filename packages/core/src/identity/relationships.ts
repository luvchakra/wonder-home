import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";

/**
 * How the family is related (the owner, 2026-10-19): rows an Admin writes on
 * Members & roles, each "Kunal is father of Asmi" — a person, a relation, a
 * person, all picked from lists.
 *
 * - **One row per pair.** Kunal and Asmi are related one way; the other way
 *   round ("Asmi is daughter of Kunal") is said for them, never stored twice
 *   (`inverseOf`, worded from the other person's gender where it is known).
 * - **A relation is picked, or the household's own** (rule 20): the kinds
 *   below are translated; anything else is kept as typed and shown as typed.
 * - **Checked before it is kept** (`checkRelationship`): nobody is their own
 *   relation, a pair is related once, and a parent, grandparent, uncle or
 *   aunt is never younger than the person they are that to.
 * - **Offered, never assumed** (`suggestRelationships`): a child's guardians
 *   as their parents and children as siblings are suggestions an Admin adds
 *   with a tap; WonderHome writes none of them on its own.
 *
 * Family only: a househelper is not anyone's relation here.
 */

export const RELATIONSHIP_KINDS = [
  "father",
  "mother",
  "parent",
  "son",
  "daughter",
  "child",
  "husband",
  "wife",
  "spouse",
  "partner",
  "brother",
  "sister",
  "sibling",
  "grandfather",
  "grandmother",
  "grandparent",
  "grandson",
  "granddaughter",
  "grandchild",
  "uncle",
  "aunt",
  "nephew",
  "niece",
  "cousin",
  "father_in_law",
  "mother_in_law",
  "son_in_law",
  "daughter_in_law",
  "brother_in_law",
  "sister_in_law",
  "guardian",
  "ward",
] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export const RELATION_MAX_LENGTH = 40;

export function isRelationshipKind(value: string): value is RelationshipKind {
  return (RELATIONSHIP_KINDS as readonly string[]).includes(value);
}

export type Relationship = {
  id: string;
  /** The person the sentence starts with: "**Kunal** is father of Asmi". */
  memberId: string;
  /** A kind from the list, or the household's own words. */
  relation: string;
  /** The person it ends with: "Kunal is father of **Asmi**". */
  relatedMemberId: string;
};

export type RelationshipPerson = {
  id: string;
  displayName: string;
  memberType: "adult" | "child" | "helper";
  gender: string | null;
  dateOfBirth: string | null;
  status?: string;
};

type Sex = "female" | "male" | null;

/** Read from the open-text gender a household keeps: only a plain female or male word counts; anything else is unsaid. */
export function sexOf(gender: string | null | undefined): Sex {
  const said = gender?.trim().toLowerCase();
  if (!said) return null;
  if (/^(?:female|f|girl|woman|lady)$/.test(said)) return "female";
  if (/^(?:male|m|boy|man)$/.test(said)) return "male";
  return null;
}

/** Each kind's family, for the other way round and for the age check. */
type Group = "parent" | "child" | "spouse" | "partner" | "sibling" | "grandparent" | "grandchild" | "uncle" | "nephew" | "cousin" | "parent_in_law" | "child_in_law" | "sibling_in_law" | "guardian" | "ward";

const GROUP: Record<RelationshipKind, Group> = {
  father: "parent",
  mother: "parent",
  parent: "parent",
  son: "child",
  daughter: "child",
  child: "child",
  husband: "spouse",
  wife: "spouse",
  spouse: "spouse",
  partner: "partner",
  brother: "sibling",
  sister: "sibling",
  sibling: "sibling",
  grandfather: "grandparent",
  grandmother: "grandparent",
  grandparent: "grandparent",
  grandson: "grandchild",
  granddaughter: "grandchild",
  grandchild: "grandchild",
  uncle: "uncle",
  aunt: "uncle",
  nephew: "nephew",
  niece: "nephew",
  cousin: "cousin",
  father_in_law: "parent_in_law",
  mother_in_law: "parent_in_law",
  son_in_law: "child_in_law",
  daughter_in_law: "child_in_law",
  brother_in_law: "sibling_in_law",
  sister_in_law: "sibling_in_law",
  guardian: "guardian",
  ward: "ward",
};

/** A group's word for a person of a given sex: [female, male, either]. */
const WORDS: Record<Group, readonly [RelationshipKind, RelationshipKind, RelationshipKind]> = {
  parent: ["mother", "father", "parent"],
  child: ["daughter", "son", "child"],
  spouse: ["wife", "husband", "spouse"],
  partner: ["partner", "partner", "partner"],
  sibling: ["sister", "brother", "sibling"],
  grandparent: ["grandmother", "grandfather", "grandparent"],
  grandchild: ["granddaughter", "grandson", "grandchild"],
  // "Pibling" is nobody's word: an uncle or aunt of unsaid sex stays as the household picked.
  uncle: ["aunt", "uncle", "uncle"],
  nephew: ["niece", "nephew", "nephew"],
  cousin: ["cousin", "cousin", "cousin"],
  parent_in_law: ["mother_in_law", "father_in_law", "father_in_law"],
  child_in_law: ["daughter_in_law", "son_in_law", "son_in_law"],
  sibling_in_law: ["sister_in_law", "brother_in_law", "brother_in_law"],
  guardian: ["guardian", "guardian", "guardian"],
  ward: ["ward", "ward", "ward"],
};

const OPPOSITE: Record<Group, Group> = {
  parent: "child",
  child: "parent",
  spouse: "spouse",
  partner: "partner",
  sibling: "sibling",
  grandparent: "grandchild",
  grandchild: "grandparent",
  uncle: "nephew",
  nephew: "uncle",
  cousin: "cousin",
  parent_in_law: "child_in_law",
  child_in_law: "parent_in_law",
  sibling_in_law: "sibling_in_law",
  guardian: "ward",
  ward: "guardian",
};

/** Groups whose words have no neutral form: the other way round is said only when the person's sex is known. */
const NEEDS_SEX: ReadonlySet<Group> = new Set(["uncle", "nephew", "parent_in_law", "child_in_law", "sibling_in_law"]);

function wordFor(group: Group, sex: Sex): RelationshipKind | null {
  if (sex === null && NEEDS_SEX.has(group)) return null;
  const [female, male, either] = WORDS[group];
  return sex === "female" ? female : sex === "male" ? male : either;
}

/**
 * The same row the other way round: "Kunal is father of Asmi" → Asmi is
 * Kunal's daughter (or child, when Asmi's gender is not on record). Null for
 * the household's own words, which WonderHome does not try to reverse.
 */
export function inverseOf(relation: string, related: { gender: string | null }): RelationshipKind | null {
  if (!isRelationshipKind(relation)) return null;
  return wordFor(OPPOSITE[GROUP[relation]], sexOf(related.gender));
}

/** The kind that suits a person's sex within a relation's group ("parent" for a man is "father"), for suggestions. */
export function kindFor(group: "parent" | "sibling", person: { gender: string | null }): RelationshipKind {
  return wordFor(group, sexOf(person.gender)) ?? (group === "parent" ? "parent" : "sibling");
}

/** Kinds the first person must be the elder in. */
const ELDER: ReadonlySet<Group> = new Set(["parent", "grandparent", "parent_in_law"]);
/** Kinds the first person must be the younger in. */
const YOUNGER: ReadonlySet<Group> = new Set(["child", "grandchild", "child_in_law"]);

export type RelationshipProblem =
  | { code: "same_person" }
  | { code: "not_family"; memberId: string }
  | { code: "already_related"; existing: Relationship }
  | { code: "age"; elder: string; younger: string }
  | { code: "relation_missing" }
  | { code: "relation_too_long" };

/**
 * Whether a row can be kept, against everyone and every row already on
 * record. `id` is the row being changed, which never conflicts with itself.
 */
export function checkRelationship(
  row: { id?: string | null; memberId: string; relation: string; relatedMemberId: string },
  people: readonly RelationshipPerson[],
  existing: readonly Relationship[],
): RelationshipProblem | null {
  const relation = row.relation.trim();
  if (!relation) return { code: "relation_missing" };
  if (relation.length > RELATION_MAX_LENGTH) return { code: "relation_too_long" };
  if (row.memberId === row.relatedMemberId) return { code: "same_person" };
  for (const id of [row.memberId, row.relatedMemberId]) {
    const person = people.find((entry) => entry.id === id);
    if (!person || person.memberType === "helper" || (person.status && person.status === "inactive")) return { code: "not_family", memberId: id };
  }
  const clash = existing.find(
    (other) =>
      other.id !== row.id &&
      ((other.memberId === row.memberId && other.relatedMemberId === row.relatedMemberId) || (other.memberId === row.relatedMemberId && other.relatedMemberId === row.memberId)),
  );
  if (clash) return { code: "already_related", existing: clash };
  if (isRelationshipKind(relation)) {
    const group = GROUP[relation];
    const who = people.find((entry) => entry.id === row.memberId)!;
    const whom = people.find((entry) => entry.id === row.relatedMemberId)!;
    if (who.dateOfBirth && whom.dateOfBirth && who.dateOfBirth !== whom.dateOfBirth) {
      const whoIsOlder = who.dateOfBirth < whom.dateOfBirth;
      // The refusal names who is really the elder: "Asmi is mother of Upasana" is refused because Asmi is younger than Upasana.
      if (ELDER.has(group) && !whoIsOlder) return { code: "age", elder: whom.id, younger: who.id };
      if (YOUNGER.has(group) && whoIsOlder) return { code: "age", elder: who.id, younger: whom.id };
    }
  }
  return null;
}

export type RelationshipSuggestion = { memberId: string; relation: RelationshipKind; relatedMemberId: string; because: "guardian" | "children" };

/**
 * Rows the household probably means, from what is already on record, for an
 * Admin to add with one tap: each child's guardians as their parent (the
 * word from the guardian's gender), and each two children as siblings, the
 * elder first. A pair already related in either direction is never offered.
 */
export function suggestRelationships(
  people: readonly RelationshipPerson[],
  existing: readonly Relationship[],
  guardians: readonly { guardianMemberId: string; childMemberId: string }[],
  limit = 6,
): RelationshipSuggestion[] {
  const family = people.filter((person) => person.memberType !== "helper" && person.status !== "inactive");
  const byId = new Map(family.map((person) => [person.id, person]));
  const related = new Set(existing.flatMap((row) => [`${row.memberId}|${row.relatedMemberId}`, `${row.relatedMemberId}|${row.memberId}`]));
  const out: RelationshipSuggestion[] = [];
  const offer = (suggestion: RelationshipSuggestion) => {
    const key = `${suggestion.memberId}|${suggestion.relatedMemberId}`;
    if (related.has(key)) return;
    related.add(key);
    related.add(`${suggestion.relatedMemberId}|${suggestion.memberId}`);
    out.push(suggestion);
  };
  for (const link of guardians) {
    const guardian = byId.get(link.guardianMemberId);
    const child = byId.get(link.childMemberId);
    if (!guardian || !child || guardian.id === child.id || guardian.memberType !== "adult") continue;
    offer({ memberId: guardian.id, relation: kindFor("parent", guardian), relatedMemberId: child.id, because: "guardian" });
  }
  const children = family.filter((person) => person.memberType === "child").sort((a, b) => (a.dateOfBirth ?? "9999").localeCompare(b.dateOfBirth ?? "9999"));
  for (let i = 0; i < children.length; i += 1) {
    for (let j = i + 1; j < children.length; j += 1) {
      offer({ memberId: children[i]!.id, relation: kindFor("sibling", children[i]!), relatedMemberId: children[j]!.id, because: "children" });
    }
  }
  return out.slice(0, limit);
}

/** How a relation reads in a sentence: a kind through the reader's words, the household's own as typed. */
export type RelationWords = (relation: string) => string;

/**
 * What one person is to the rest of the family, from every row they are in:
 * "Father of Asmi", and from "Upasana is wife of Kunal", "Husband of
 * Upasana". The Family details' line; nothing is said that no row says.
 */
export function relationsOf(
  memberId: string,
  rows: readonly Relationship[],
  people: readonly RelationshipPerson[],
): { relation: string; otherId: string }[] {
  const out: { relation: string; otherId: string }[] = [];
  for (const row of rows) {
    if (row.memberId === memberId) out.push({ relation: row.relation, otherId: row.relatedMemberId });
    else if (row.relatedMemberId === memberId) {
      const me = people.find((person) => person.id === memberId);
      const reverse = me ? inverseOf(row.relation, me) : null;
      if (reverse) out.push({ relation: reverse, otherId: row.memberId });
    }
  }
  return out;
}

/** English sentences for HomeBrain's facts and the roster: "Kunal is Asmi's father." plus the other way round when it can be said. */
export function relationshipSentences(rows: readonly Relationship[], people: readonly RelationshipPerson[]): { row: Relationship; text: string }[] {
  const name = (id: string) => people.find((person) => person.id === id)?.displayName ?? null;
  const english = (relation: string) => (isRelationshipKind(relation) ? relation.replaceAll("_", "-") : relation.trim());
  const out: { row: Relationship; text: string }[] = [];
  for (const row of rows) {
    const who = name(row.memberId);
    const whom = name(row.relatedMemberId);
    if (!who || !whom) continue;
    const related = people.find((person) => person.id === row.relatedMemberId)!;
    const reverse = inverseOf(row.relation, related);
    out.push({ row, text: `${who} is ${whom}'s ${english(row.relation)}${reverse ? `, and ${whom} is ${who}'s ${english(reverse)}` : ""}.` });
  }
  return out;
}

// --- reading and writing --------------------------------------------------

type Row = Record<string, unknown>;

function toRelationship(row: Row): Relationship {
  return { id: row.id as string, memberId: row.member_id as string, relation: row.relation as string, relatedMemberId: row.related_member_id as string };
}

/** Every relationship in the household, oldest first. Empty where the table does not exist yet. */
export async function listRelationships(supabase: SupabaseClient, householdId: string): Promise<Relationship[]> {
  const { data, error } = await supabase
    .from("member_relationships")
    .select("id, member_id, relation, related_member_id")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(`listRelationships failed: ${error.code ?? "unknown"}`);
  }
  return ((data as Row[] | null) ?? []).map(toRelationship);
}

/** Who looks after which child (`member_guardians`), for suggestions. Empty on any failure: a suggestion is never worth a broken page. */
export async function listGuardianLinks(supabase: SupabaseClient, householdId: string): Promise<{ guardianMemberId: string; childMemberId: string }[]> {
  const { data, error } = await supabase.from("member_guardians").select("guardian_member_id, child_member_id").eq("household_id", householdId).limit(200);
  if (error) return [];
  return ((data as Row[] | null) ?? []).map((row) => ({ guardianMemberId: row.guardian_member_id as string, childMemberId: row.child_member_id as string }));
}

export type SaveRelationshipInput ={ householdId: string; id?: string | null; memberId: string; relation: string; relatedMemberId: string; actorMemberId: string };

/** Adds a row, or changes one; the database also holds one row per pair and both people to the household. */
async function saveRelationshipImpl(supabase: SupabaseClient, input: SaveRelationshipInput): Promise<string> {
  const row = { member_id: input.memberId, relation: input.relation.trim(), related_member_id: input.relatedMemberId };
  const write = input.id
    ? supabase.from("member_relationships").update(row).eq("id", input.id).eq("household_id", input.householdId).select("id")
    : supabase.from("member_relationships").insert({ ...row, household_id: input.householdId, created_by_member_id: input.actorMemberId }).select("id");
  const { data, error } = await write;
  if (error) {
    if (error.code === "23505") throw ApiError.badRequest("These two are already related. Change that row instead.");
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can change how the family is related.");
    if (error.code === "23514" || error.code === "23503") throw ApiError.badRequest("Pick two different people from the family.");
    throw new Error(`saveRelationship failed: ${error.code ?? "unknown"}`);
  }
  const saved = (data as Row[] | null)?.[0];
  // RLS filters an update it will not allow rather than refusing it.
  if (!saved) throw ApiError.forbidden("Only an Admin can change how the family is related.");
  return saved.id as string;
}

/** Takes a row away. Nothing else points at a relationship, so nothing else's history changes. */
async function removeRelationshipImpl(supabase: SupabaseClient, input: { householdId: string; id: string }): Promise<void> {
  const { data, error } = await supabase.from("member_relationships").delete().eq("id", input.id).eq("household_id", input.householdId).select("id");
  if (error) throw error.code === "42501" ? ApiError.forbidden("Only an Admin can change how the family is related.") : new Error(`removeRelationship failed: ${error.code ?? "unknown"}`);
  if (!data || data.length === 0) throw ApiError.forbidden("Only an Admin can change how the family is related.");
}

export const saveRelationship = invalidatesContext(saveRelationshipImpl, (_s, input) => input.householdId);
export const removeRelationship = invalidatesContext(removeRelationshipImpl, (_s, input) => input.householdId);
