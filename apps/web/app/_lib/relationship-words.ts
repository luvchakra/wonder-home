import {
  inverseOf,
  isRelationshipKind,
  RELATIONSHIP_KINDS,
  relationsOf,
  type Relationship,
  type RelationshipPerson,
  type RelationshipProblem,
  type RelationshipSuggestion,
} from "@wonderhome/core/identity/relationships";
import type { Translate } from "@wonderhome/core/i18n/translate";

import type { RelationshipRowView, RelationshipSuggestionView, RelationshipWords } from "../family/relationships";

/** A relation in the reader's words: one of the app's kinds translated, the household's own as typed. */
export function relationLabel(t: Translate, relation: string): string {
  return isRelationshipKind(relation) ? t(`relationships.kind.${relation}`) : relation;
}

const PROBLEM_CODES: (RelationshipProblem["code"] | "forbidden")[] = ["same_person", "not_family", "already_related", "age", "relation_missing", "relation_too_long", "forbidden"];

export function relationshipWords(t: Translate): RelationshipWords {
  return {
    title: t("relationships.title"),
    lede: t("relationships.lede"),
    empty: t("relationships.empty"),
    adminOnly: t("relationships.adminOnly"),
    add: t("relationships.add"),
    sheetAdd: t("relationships.sheetAdd"),
    sheetEdit: t("relationships.sheetEdit"),
    sheetLede: t("relationships.sheetLede"),
    who: t("relationships.who"),
    relation: t("relationships.relation"),
    whom: t("relationships.whom"),
    is: t("relationships.is"),
    of: t("relationships.of"),
    save: t("relationships.save"),
    saving: t("common.saving"),
    edit: t("relationships.edit", { sentence: "{sentence}" }),
    remove: t("relationships.remove", { sentence: "{sentence}" }),
    addNew: t("relationships.addNew"),
    chooseExisting: t("relationships.chooseExisting"),
    newRelation: t("relationships.newRelation"),
    suggestedTitle: t("relationships.suggestedTitle"),
    suggestedLede: t("relationships.suggestedLede"),
    addSuggested: t("relationships.addSuggested"),
    kinds: [...RELATIONSHIP_KINDS],
    kindLabels: Object.fromEntries(RELATIONSHIP_KINDS.map((kind) => [kind, t(`relationships.kind.${kind}`)])),
    problems: Object.fromEntries(PROBLEM_CODES.map((code) => [code, t(`relationships.problem.${code}`, { who: "{who}", whom: "{whom}" })])),
  };
}

const nameOf = (people: readonly RelationshipPerson[], id: string) => people.find((person) => person.id === id)?.displayName ?? null;

/** Each row as "Kunal is father of Asmi", with the other way round beneath it when it can be said. */
export function describeRelationships(t: Translate, rows: readonly Relationship[], people: readonly RelationshipPerson[]): RelationshipRowView[] {
  const out: RelationshipRowView[] = [];
  for (const row of rows) {
    const who = nameOf(people, row.memberId);
    const whom = nameOf(people, row.relatedMemberId);
    if (!who || !whom) continue;
    const related = people.find((person) => person.id === row.relatedMemberId)!;
    const reverse = inverseOf(row.relation, related);
    out.push({
      ...row,
      sentence: t("relationships.row", { who, relation: relationLabel(t, row.relation), whom }),
      reverse: reverse ? t("relationships.reverse", { whom, who, relation: relationLabel(t, reverse) }) : null,
    });
  }
  return out;
}

export function describeSuggestions(t: Translate, suggestions: readonly RelationshipSuggestion[], people: readonly RelationshipPerson[]): RelationshipSuggestionView[] {
  return suggestions.flatMap((suggestion) => {
    const who = nameOf(people, suggestion.memberId);
    const whom = nameOf(people, suggestion.relatedMemberId);
    return who && whom ? [{ ...suggestion, sentence: t("relationships.row", { who, relation: relationLabel(t, suggestion.relation), whom }) }] : [];
  });
}

/** What one person is to the family, for their details in Family: "Father of Asmi · Husband of Upasana". Null when no row names them. */
export function relationsLine(t: Translate, memberId: string, rows: readonly Relationship[], people: readonly RelationshipPerson[]): string | null {
  const phrases = relationsOf(memberId, rows, people).flatMap(({ relation, otherId }) => {
    const whom = nameOf(people, otherId);
    return whom ? [t("relationships.phrase", { relation: relationLabel(t, relation), whom })] : [];
  });
  if (phrases.length === 0) return null;
  return phrases.map((phrase) => phrase.charAt(0).toLocaleUpperCase() + phrase.slice(1)).join(" · ");
}
