import { inverseOf, isRelationshipKind, relationshipSentences, type Relationship, type RelationshipKind, type RelationshipPerson } from "../identity/relationships";

/**
 * "Who is Asmi's father?", "how is Upasana related to Manan?", "how is the
 * family related?" — answered by rules from every row on Members & roles'
 * Relationships, both ways round (the owner, 2026-10-19), as "who is in the
 * family" (`roster.ts`) and "what does Asmi like" (`likes.ts`) are. Nothing
 * is left out because a model was not shown it, and nothing is said that no
 * row says; what is missing is said to be missing, with where to add it.
 */

export type RelationQuestion =
  | { kind: "of"; name: string; word: string }
  | { kind: "between"; first: string; second: string }
  | { kind: "all" };

/** The words a question can ask by, and the kinds that answer each. */
const ASKED: Record<string, readonly RelationshipKind[]> = {
  father: ["father"],
  dad: ["father"],
  mother: ["mother"],
  mom: ["mother"],
  mum: ["mother"],
  parent: ["father", "mother", "parent"],
  parents: ["father", "mother", "parent"],
  son: ["son"],
  daughter: ["daughter"],
  child: ["son", "daughter", "child"],
  children: ["son", "daughter", "child"],
  kids: ["son", "daughter", "child"],
  husband: ["husband", "spouse", "partner"],
  wife: ["wife", "spouse", "partner"],
  spouse: ["husband", "wife", "spouse", "partner"],
  partner: ["husband", "wife", "spouse", "partner"],
  brother: ["brother"],
  sister: ["sister"],
  sibling: ["brother", "sister", "sibling"],
  siblings: ["brother", "sister", "sibling"],
  grandfather: ["grandfather"],
  grandmother: ["grandmother"],
  grandparents: ["grandfather", "grandmother", "grandparent"],
  grandchildren: ["grandson", "granddaughter", "grandchild"],
  uncle: ["uncle"],
  aunt: ["aunt"],
  cousin: ["cousin"],
  cousins: ["cousin"],
  nephew: ["nephew"],
  niece: ["niece"],
  guardian: ["guardian"],
  guardians: ["guardian"],
};
const ASKED_WORDS = Object.keys(ASKED).join("|");
const NAME = String.raw`([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)?)`;

const OF_PATTERNS: RegExp[] = [
  // "Who is Asmi's father?", "who are Manan's grandparents"
  new RegExp(String.raw`^who(?:'s| is| are)\s+${NAME}(?:'s|s'|’s)\s+(${ASKED_WORDS})$`, "iu"),
  // "Who is the father of Asmi?", "who are the parents of Manan"
  new RegExp(String.raw`^who(?:'s| is| are)\s+(?:the\s+)?(${ASKED_WORDS})\s+of\s+${NAME}$`, "iu"),
  // "Does Asmi have a brother?", "does Manan have any cousins"
  new RegExp(String.raw`^does\s+${NAME}\s+have\s+(?:a|an|any)\s+(${ASKED_WORDS})$`, "iu"),
];
const BETWEEN_PATTERNS: RegExp[] = [
  // "How is Upasana related to Manan?", "what is Kunal to Asmi", "what relation is Kunal to Asmi"
  new RegExp(String.raw`^(?:how is|how's)\s+${NAME}\s+related\s+to\s+${NAME}$`, "iu"),
  new RegExp(String.raw`^what(?:'s| is)\s+${NAME}\s+to\s+${NAME}$`, "iu"),
  new RegExp(String.raw`^what (?:relation|relationship) is\s+${NAME}\s+to\s+${NAME}$`, "iu"),
  // "How are Kunal and Asmi related?", "what is the relationship between Kunal and Asmi"
  new RegExp(String.raw`^how are\s+${NAME}\s+and\s+${NAME}\s+related$`, "iu"),
  new RegExp(String.raw`^what(?:'s| is) the (?:relation|relationship) between\s+${NAME}\s+and\s+${NAME}$`, "iu"),
];
const ALL = /^(?:how is (?:the |my |our )?(?:family|household) related|how are we (?:all )?related|who is related to whom|(?:show|tell|give) me (?:the |our |my )?(?:family tree|family relationships|relationships)|what are (?:the |our |my )?(?:family )?relationships|(?:the |our |my )?family tree)$/i;

function said(utterance: string): string {
  return utterance
    .trim()
    .replace(/[?.!]+$/, "")
    .replace(/^(?:ok(?:ay)?|so|hey|and|also|please)[,.\s]+/i, "")
    .replace(/^(?:can|could) you (?:tell me )?/i, "")
    .replace(/^tell me\s+/i, "")
    .trim();
}

const NOT_NAMES = /^(?:you|i|me|we|us|they|it|this|that|the family|the household|everyone|my|our|your)$/i;

/** A question about how people are related, or null. */
export function readRelationQuestion(utterance: string): RelationQuestion | null {
  const text = said(utterance);
  if (ALL.test(text)) return { kind: "all" };
  for (const pattern of OF_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const [first, second] = [match[1]!, match[2]!];
    // The name is whichever group is not one of the asked words.
    const word = (ASKED[first.toLowerCase()] ? first : second).toLowerCase();
    const name = (ASKED[first.toLowerCase()] ? second : first).trim();
    if (NOT_NAMES.test(name)) return null;
    return { kind: "of", name, word };
  }
  for (const pattern of BETWEEN_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const [first, second] = [match[1]!.trim(), match[2]!.trim()];
    if (NOT_NAMES.test(first) || NOT_NAMES.test(second)) return null;
    return { kind: "between", first, second };
  }
  return null;
}

/** Every row as a statement both ways round: who is what to whom. */
type Statement = { who: string; relation: string; whom: string };

function statements(rows: readonly Relationship[], people: readonly RelationshipPerson[]): Statement[] {
  const out: Statement[] = [];
  for (const row of rows) {
    out.push({ who: row.memberId, relation: row.relation, whom: row.relatedMemberId });
    const related = people.find((person) => person.id === row.relatedMemberId);
    const reverse = related ? inverseOf(row.relation, related) : null;
    if (reverse) out.push({ who: row.relatedMemberId, relation: reverse, whom: row.memberId });
  }
  return out;
}

const english = (relation: string) => (isRelationshipKind(relation) ? relation.replaceAll("_", "-") : relation.trim());

/** The member a name means: full name, first name or nickname; null when none or more than one fit. */
function personNamed<P extends RelationshipPerson & { nickname?: string | null }>(name: string, people: readonly P[]): P | null {
  const asked = name.trim().toLocaleLowerCase();
  const fits = people.filter((person) => {
    const full = person.displayName.toLocaleLowerCase();
    return full === asked || full.split(/\s+/)[0] === asked || person.nickname?.toLocaleLowerCase() === asked;
  });
  return fits.length === 1 ? fits[0]! : null;
}

const WHERE = "An Admin can add it under Manage Household → Members & roles → Relationships.";

/** The reply, from the rows alone. */
export function composeRelations(question: RelationQuestion, people: readonly (RelationshipPerson & { nickname?: string | null })[], rows: readonly Relationship[]): { text: string; memberIds: string[] } {
  const name = (id: string) => people.find((person) => person.id === id)?.displayName ?? "Someone";
  const first = (id: string) => name(id).split(/\s+/)[0]!;
  const all = statements(rows, people);

  if (question.kind === "all") {
    const sentences = relationshipSentences(rows, people);
    if (sentences.length === 0) return { text: `How the family is related isn't on record yet. ${WHERE}`, memberIds: [] };
    return {
      text: ["Here's how the family is related:", sentences.map((entry) => `- ${entry.text.replace(/\.$/, "")}`).join("\n")].join("\n\n"),
      memberIds: [...new Set(rows.flatMap((row) => [row.memberId, row.relatedMemberId]))],
    };
  }

  if (question.kind === "of") {
    const person = personNamed(question.name, people);
    if (!person) return { text: `I don't know who ${question.name} is in your household. Check the name under Family.`, memberIds: [] };
    const kinds = ASKED[question.word] ?? [];
    const found = all.filter((statement) => statement.whom === person.id && kinds.includes(statement.relation as RelationshipKind));
    if (found.length === 0) return { text: `No one is recorded as ${first(person.id)}'s ${question.word} yet. ${WHERE}`, memberIds: [person.id] };
    const lines = found.map((statement) => `${name(statement.who)} is ${first(person.id)}'s ${english(statement.relation)}`);
    return { text: lines.length === 1 ? `${lines[0]}.` : lines.map((line) => `- ${line}`).join("\n"), memberIds: [person.id, ...found.map((statement) => statement.who)] };
  }

  const a = personNamed(question.first, people);
  const b = personNamed(question.second, people);
  if (!a || !b) return { text: `I don't know who ${!a ? question.first : question.second} is in your household. Check the name under Family.`, memberIds: [] };
  const direct = all.find((statement) => statement.who === a.id && statement.whom === b.id);
  const back = all.find((statement) => statement.who === b.id && statement.whom === a.id);
  if (!direct && !back) return { text: `How ${first(a.id)} and ${first(b.id)} are related isn't on record yet. ${WHERE}`, memberIds: [a.id, b.id] };
  const parts = [direct ? `${name(a.id)} is ${first(b.id)}'s ${english(direct.relation)}` : null, back ? `${name(b.id)} is ${first(a.id)}'s ${english(back.relation)}` : null].filter(Boolean);
  return { text: `${parts.join(", and ")}.`, memberIds: [a.id, b.id] };
}
