/**
 * "What does Upasana like in food?" — answered from what the household told
 * WonderHome, by rules (the owner, 2026-10-18).
 *
 * HomeTalk said "Remembered: Upasana likes Italian food", and minutes later
 * that it had no record of her food preferences. The belief was stored; the
 * answer was left to whichever facts a model was shown, and a summary of the
 * home did not include it. So, like "who is in the family" (`roster.ts`), a
 * question about someone's likes is read here and answered from every
 * record about that person: what HomeTalk was told (`memories`) and the food
 * preferences on the Meals screen (`food_preferences`). Nothing is left out
 * because a model was not shown it, and nothing is said that is not on record.
 */

/** Whose likes: one person by name, or `null` for the whole family ("what does the family like?", "who likes what?"). */
export type LikesQuestion = { name: string | null; food: boolean };

export type LikesPerson = { id: string; displayName: string; nickname?: string | null };

export type LikesRecord =
  /** Something HomeTalk was told and kept, with whether anyone has confirmed it. */
  | { kind: "memory"; memberId: string | null; statement: string; confirmed: boolean }
  /** A food preference from the Meals screen. */
  | { kind: "food"; memberId: string | null; preference: "preference" | "dislike" | "allergy" | "medical" | "ethical"; subject: string };

const NAME = String.raw`([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)?)`;
const FOOD = /\b(food|eat|eating|dish|dishes|cuisine|meals?|tastes?)\b/i;

const PATTERNS: RegExp[] = [
  // "What Upasana likes (to eat)", "what Asmi doesn't like" — after "tell me" was taken off
  new RegExp(String.raw`^what (?!(?:are|is|do|does|did|all|about)\b)${NAME} (?:really )?(?:likes|loves|enjoys|prefers|dislikes|hates|doesn't like|does not like)\b`, "iu"),
  // "What do you know / remember about Asmi's food preferences?", "what have I told you about Manan's likes"
  new RegExp(String.raw`^what (?:do you (?:know|remember|have(?: on record)?)|have (?:i|we) told you|is on record) about ${NAME}(?:'s|s') (?:food )?(?:likes|dislikes|preferences|tastes?|favou?rites?|likes and dislikes)\b`, "iu"),
  // "What does Upasana like (to eat / in food)?", "what does Asmi not like", "what does Manan dislike"
  new RegExp(String.raw`^what (?:all )?(?:food |foods |dishes |things )?(?:does|do) ${NAME} (?:really )?(?:like|love|enjoy|prefer|dislike|hate|not like|don't like|doesn't like)\b`, "iu"),
  // "What are Upasana's likes / food preferences / tastes / favourites"
  new RegExp(String.raw`^what (?:are|is) ${NAME}(?:'s|s') (?:food )?(?:likes|dislikes|preferences|tastes?|favou?rites?|favou?rite food|likes and dislikes)\b`, "iu"),
  // "Tell me what Upasana likes", "tell me about Upasana's food preferences"
  new RegExp(String.raw`^tell me (?:what|about) ${NAME}(?:'s|s')? (?:likes|food preferences|preferences|tastes?|favou?rites?)\b`, "iu"),
];

/**
 * The family as a whole, where a name would be: "what does the family like",
 * "what do the kids like to eat", "what are everyone's food preferences".
 * The owner's report (2026-10-19): asked "what do you know about the
 * preferences in food and family?", the assistant said it had no such
 * record while HomeBrain Review listed fourteen. A question about everyone
 * is answered from everyone's records, the same way one person's is.
 */
const GROUP = /^(?:we|us|they|people|kids|children|everyone|everybody|(?:the |our |my )?(?:family|household|kids|children|whole family|family members))$/i;
/** "What do you like?" asks the assistant about itself; there is nothing on record to answer with. */
const NOT_A_PERSON = /^(?:you|i|me)$/i;

const FAMILY_PATTERNS: RegExp[] = [
  // "What does the family / everyone like (to eat)?", "what do we like", "what the kids like"
  /^what (?:all )?(?:food |foods |dishes |things )?(?:(?:does|do) )?(?:the |our |my )?(?:family|household|everyone|everybody|kids|children|people|we|they)(?: (?:here|at home))? (?:really )?(?:likes?|loves?|enjoys?|prefers?|dislikes?|hates?|not like|don't like|doesn't like)\b/i,
  // "What are our / everyone's / the family's (food) preferences?", "what are the food preferences"
  /^what (?:are|is) (?:(?:the |our |my )?(?:family(?:'s)? |household(?:'s)? |kids' |children's )?|everyone's |everybody's |our |all the )?(?:food |eating )?(?:likes|dislikes|preferences|tastes?|favou?rites?|likes and dislikes)\b/i,
  // "What do you know about the preferences in food and family?", "what do you remember about our food preferences", "what have I told you about what people like"
  /^what (?:do you (?:know|remember|have(?: on record)?)|have (?:i|we) told you|is on record|do you have) (?:about|regarding|on)\b(?=.*\b(?:preferences?|likes|dislikes|tastes?|favou?rites?|likes? to eat)\b)/i,
  // "Who likes what (to eat)?"
  /^who (?:likes|loves|prefers|eats|dislikes|hates) what\b/i,
  // "What food preferences do you have on record?", "which preferences are there"
  /^(?:what|which) (?:food |eating )?(?:preferences|likes|dislikes) (?:do you (?:have|know)|are there|are|is there|do we have|have you got)(?: on record)?\b/i,
  // "List everyone's food preferences", "tell me the family's likes and dislikes", "show me all the preferences"
  /^(?:list|tell me|show me|give me) (?:all |every |everyone's |everybody's )?(?:(?:the |our |my )?(?:family's |household's )?)?(?:food |eating )?(?:preferences|likes|dislikes|tastes?|favou?rites?|likes and dislikes)\b/i,
];

/** A question about what someone — or everyone — likes, and whether it is about food; or null. */
export function readLikesQuestion(utterance: string): LikesQuestion | null {
  const said = utterance
    .trim()
    .replace(/^(?:ok(?:ay)?|so|hey|and|also|please)[,.\s]+/i, "")
    .replace(/^(?:can|could) you (?:tell me )?/i, "");
  for (const pattern of PATTERNS) {
    const match = pattern.exec(said);
    if (!match) continue;
    // A two-word name never ends in the verb: "Asmi not" is Asmi.
    const name = match[1]!.replace(/\s+(?:not|really|like|likes|love|loves|enjoy|enjoys|prefer|prefers|dislike|hate|doesn't|does)$/i, "").trim();
    if (NOT_A_PERSON.test(name)) return null;
    if (GROUP.test(name)) return { name: null, food: FOOD.test(said) };
    return { name, food: FOOD.test(said) };
  }
  for (const pattern of FAMILY_PATTERNS) {
    if (pattern.test(said)) return { name: null, food: FOOD.test(said) };
  }
  return null;
}

/**
 * The records a likes answer is made of, from what HomeTalk was told
 * (`memories`, the preference ones) and the Meals screen's food preferences.
 * One mapping for the conversation route and the evaluation runner.
 */
export function likesRecordsFrom(
  memories: readonly { memberId: string | null; category: string; key: string; value: unknown; status: string }[],
  preferences: readonly { memberId: string | null; kind: string; subject: string }[],
): LikesRecord[] {
  return [
    ...memories
      .filter((memory) => memory.category === "preference" || memory.key.startsWith("pref."))
      .flatMap((memory) => {
        const statement = (memory.value as { statement?: unknown } | null)?.statement;
        return typeof statement === "string" && statement.trim()
          ? [{ kind: "memory" as const, memberId: memory.memberId, statement: statement.trim(), confirmed: memory.status === "confirmed" }]
          : [];
      }),
    ...preferences.map((row) => ({ kind: "food" as const, memberId: row.memberId, preference: row.kind as Exclude<LikesRecord, { kind: "memory" }>["preference"], subject: row.subject })),
  ];
}

/** The household member a name means: full name, first name or nickname; null when none or more than one fit. */
export function personNamed(name: string, people: readonly LikesPerson[]): LikesPerson | null {
  const said = name.trim().toLocaleLowerCase();
  const fits = people.filter((person) => {
    const full = person.displayName.toLocaleLowerCase();
    return full === said || full.split(/\s+/)[0] === said || person.nickname?.toLocaleLowerCase() === said;
  });
  return fits.length === 1 ? fits[0]! : null;
}

const FOOD_WORDS: Record<Exclude<LikesRecord, { kind: "memory" }>["preference"], string> = {
  preference: "Likes",
  dislike: "Doesn't like",
  allergy: "Allergic to",
  medical: "Avoids for health reasons:",
  ethical: "Doesn't eat, by choice:",
};

/** Every record about one person, as lines: the Meals screen's preferences, and what HomeTalk was told that names them. */
function linesFor(person: LikesPerson, records: readonly LikesRecord[]): { lines: string[]; health: boolean } {
  const first = person.displayName.split(/\s+/)[0] ?? person.displayName;
  const names = [person.displayName, first, person.nickname].filter((value): value is string => Boolean(value)).map((value) => value.toLocaleLowerCase());
  const mentions = (statement: string) => names.some((value) => new RegExp(String.raw`(?:^|[^\p{L}])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^\p{L}])`, "iu").test(statement));

  const lines: string[] = [];
  const seen = new Set<string>();
  let health = false;
  for (const record of records) {
    if (record.kind === "food") {
      if (record.memberId !== person.id) continue;
      const line = `${FOOD_WORDS[record.preference]} ${record.subject}`;
      if (record.preference === "allergy" || record.preference === "medical") health = true;
      if (!seen.has(line.toLowerCase())) {
        seen.add(line.toLowerCase());
        lines.push(line);
      }
      continue;
    }
    if (record.memberId !== person.id && !mentions(record.statement)) continue;
    // A statement about two people is said for the one asked about.
    const parts = record.statement.split(/;\s*|\.\s+/).map((part) => part.trim()).filter(Boolean);
    const about = parts.filter((part) => mentions(part));
    const chosen = about.length > 0 ? about : record.memberId === person.id ? parts : [];
    for (const part of chosen) {
      const line = `${part.replace(/\.$/, "")}${record.confirmed ? "" : " (you told me; not registered yet)"}`;
      if (!seen.has(part.toLowerCase())) {
        seen.add(part.toLowerCase());
        lines.push(line);
      }
    }
  }
  return { lines, health };
}

const CLOSING = "You can correct any of this under HomeBrain, or tell me what's changed.";

/**
 * The reply, from the records alone. A thing HomeTalk was told and nobody
 * confirmed yet says so; a statement about the person kept under someone
 * else ("Kunal likes North Indian food; Upasana likes Italian food") counts
 * when it names them.
 */
export function composeLikes(question: LikesQuestion, person: LikesPerson, records: readonly LikesRecord[]): { text: string; count: number; health: boolean } {
  const first = person.displayName.split(/\s+/)[0] ?? person.displayName;
  const { lines, health } = linesFor(person, records);

  if (lines.length === 0) {
    return {
      text: `Nothing about what ${first} likes${question.food ? " to eat" : ""} is on record yet. Tell me — "${first} likes Italian food" — and I'll remember it, or add it under Meals → Preferences.`,
      count: 0,
      health,
    };
  }
  return {
    text: [`Here's what's on record about ${first}:`, lines.map((line) => `- ${line}`).join("\n"), CLOSING].join("\n\n"),
    count: lines.length,
    health,
  };
}

/**
 * Everyone's likes, person by person in the household's own order, then what
 * was said about the household as a whole with nobody named. Nothing is left
 * out because a model was not shown it, and nothing is said that is not on
 * record. `memberIds` are the people with something on record, for the
 * caller's own privacy classes (a child's line is a child's).
 */
export function composeFamilyLikes(question: LikesQuestion, people: readonly LikesPerson[], records: readonly LikesRecord[]): { text: string; count: number; health: boolean; memberIds: string[] } {
  const sections: string[] = [];
  const memberIds: string[] = [];
  let count = 0;
  let health = false;
  const mentioned = (statement: string) => people.some((person) => linesFor(person, [{ kind: "memory", memberId: null, statement, confirmed: true }]).lines.length > 0);
  for (const person of people) {
    const told = linesFor(person, records);
    if (told.lines.length === 0) continue;
    sections.push(`**${person.displayName}**\n${told.lines.map((line) => `- ${line}`).join("\n")}`);
    memberIds.push(person.id);
    count += told.lines.length;
    health ||= told.health;
  }
  // The household's own: a preference with no member, and a statement naming nobody on the list.
  const household: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (record.memberId !== null) continue;
    const line =
      record.kind === "food"
        ? `${FOOD_WORDS[record.preference]} ${record.subject}`
        : mentioned(record.statement)
          ? null
          : `${record.statement.replace(/\.$/, "")}${record.confirmed ? "" : " (you told me; not registered yet)"}`;
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    household.push(line);
    if (record.kind === "food" && (record.preference === "allergy" || record.preference === "medical")) health = true;
  }
  if (household.length > 0) {
    sections.push(`**The household**\n${household.map((line) => `- ${line}`).join("\n")}`);
    count += household.length;
  }

  const what = `what the family likes${question.food ? " to eat" : ""}`;
  if (count === 0) {
    const example = people.find((person) => person.id)?.displayName.split(/\s+/)[0] ?? "Asmi";
    return { text: `Nothing about ${what} is on record yet. Tell me — "${example} likes Italian food" — and I'll remember it, or add it under Meals → Preferences.`, count: 0, health, memberIds };
  }
  return { text: [`Here's what's on record about ${what}:`, ...sections, CLOSING].join("\n\n"), count, health, memberIds };
}
