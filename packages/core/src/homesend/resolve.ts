import { resolvePerson } from "../context/resolution";
import type { HouseholdContextItem, PersonRef } from "../context/types";
import type { HomeSendKind } from "./items";
import type { IntakeUnderstanding, UnderstandingReference } from "./understanding";

/**
 * Entity resolution for HomeSend (Wave 3 §9): the names in something a
 * household sent, matched to the people in the household through the same
 * Wave 1 resolver HomeBrain and HomeTalk use — "Asmi" → Asmi's member
 * record, confidence 0.95, or, when two people fit, one question:
 * "Who is this for — Asmi or Manan?" Never a guess.
 *
 * The model only ever produced the names as written; everything that turns
 * a name into a person happens here, over the household's own records.
 */

export type IntakePerson = { memberId: string; displayName: string; memberType: PersonRef["memberType"] };

export type SubjectResolution = {
  /** The name the content used for who this is for, if it used one. */
  said: string | null;
  /** The household member it is for, when that is clear. */
  selected: IntakePerson | null;
  /** Who it could be, for the review step's picker. */
  candidates: IntakePerson[];
  /** One focused question, when it is not clear. */
  question: string | null;
};

export type IntakeResolution = {
  references: UnderstandingReference[];
  subject: SubjectResolution;
};

/** Kinds that belong to one specific person, so "who is this for" must be answered. */
const PERSONAL_KINDS: ReadonlySet<HomeSendKind> = new Set(["school_item", "health_document"]);

function toPerson(ref: PersonRef): IntakePerson {
  return { memberId: ref.memberId, displayName: ref.displayName, memberType: ref.memberType };
}

function joinOr(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * Resolves every name the content used, and decides who the item is for.
 * A school item can only be for a child; a health document for the viewer
 * or a child they look after — so candidates are narrowed to who the item
 * could actually be written for before anything is selected.
 */
export function resolveIntakePeople(
  understanding: Pick<IntakeUnderstanding, "kind" | "references" | "entities">,
  items: readonly HouseholdContextItem[],
  options: { viewerMemberId: string },
): IntakeResolution {
  const people = items.filter((item) => item.entityType === "member");
  const children = people.filter((item) => item.attributes.memberType === "child");
  const eligible = (person: IntakePerson): boolean =>
    understanding.kind === "school_item" ? person.memberType === "child" : understanding.kind === "health_document" ? person.memberType !== "helper" : true;

  const references = understanding.references.map((reference) => {
    const resolution = resolvePerson(reference.text, items, { viewerMemberId: options.viewerMemberId });
    const top = resolution.candidates[0];
    return {
      text: reference.text,
      candidates: resolution.candidates.map((candidate) => candidate.entity.displayName),
      confidence: resolution.selected ? (top?.confidence ?? 0) : 0,
    };
  });

  const none: SubjectResolution = { said: null, selected: null, candidates: [], question: null };
  if (!PERSONAL_KINDS.has(understanding.kind)) return { references, subject: none };

  for (const reference of understanding.references) {
    const resolution = resolvePerson(reference.text, items, { viewerMemberId: options.viewerMemberId });
    const candidates = resolution.candidates.map((candidate) => toPerson(candidate.entity)).filter(eligible);
    if (candidates.length === 0) continue;
    const selected = resolution.selected ? toPerson(resolution.selected) : null;
    if (selected && eligible(selected)) return { references, subject: { said: reference.text, selected, candidates, question: null } };
    if (candidates.length >= 2) {
      return { references, subject: { said: reference.text, selected: null, candidates, question: `Who is this for — ${joinOr(candidates.map((person) => person.displayName))}?` } };
    }
    return { references, subject: { said: reference.text, selected: null, candidates, question: `Is this for ${candidates[0]!.displayName}?` } };
  }

  // No name in the content. A school item in a household with one child
  // can only be for that child — that is not a guess. With more than one,
  // the household is asked.
  if (understanding.kind === "school_item") {
    const kids = children.map((item) => ({ memberId: item.entityId, displayName: String(item.attributes.displayName), memberType: "child" as const }));
    if (kids.length === 1) return { references, subject: { said: null, selected: kids[0]!, candidates: kids, question: null } };
    if (kids.length > 1) return { references, subject: { said: null, selected: null, candidates: kids, question: `Who is this for — ${joinOr(kids.map((kid) => kid.displayName))}?` } };
  }
  return { references, subject: none };
}
