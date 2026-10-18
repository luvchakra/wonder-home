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

export type LikesQuestion = { name: string; food: boolean };

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
  new RegExp(String.raw`^what ${NAME} (?:really )?(?:likes|loves|enjoys|prefers|dislikes|hates|doesn't like|does not like)\b`, "iu"),
  // "What does Upasana like (to eat / in food)?", "what does Asmi not like", "what does Manan dislike"
  new RegExp(String.raw`^what (?:all )?(?:food |foods |dishes |things )?(?:does|do) ${NAME} (?:really )?(?:like|love|enjoy|prefer|dislike|hate|not like|don't like|doesn't like)\b`, "iu"),
  // "What are Upasana's likes / food preferences / tastes / favourites"
  new RegExp(String.raw`^what (?:are|is) ${NAME}(?:'s|s') (?:food )?(?:likes|dislikes|preferences|tastes?|favou?rites?|favou?rite food|likes and dislikes)\b`, "iu"),
  // "Tell me what Upasana likes", "tell me about Upasana's food preferences"
  new RegExp(String.raw`^tell me (?:what|about) ${NAME}(?:'s|s')? (?:likes|food preferences|preferences|tastes?|favou?rites?)\b`, "iu"),
];

/** A question about what someone likes, and whether it is about food — or null. */
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
    if (/^(?:you|we|i|they|people|kids|children|everyone|the family|the kids)$/i.test(name)) return null;
    return { name, food: FOOD.test(said) };
  }
  return null;
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

/**
 * The reply, from the records alone. A thing HomeTalk was told and nobody
 * confirmed yet says so; a statement about the person kept under someone
 * else ("Kunal likes North Indian food; Upasana likes Italian food") counts
 * when it names them.
 */
export function composeLikes(question: LikesQuestion, person: LikesPerson, records: readonly LikesRecord[]): { text: string; count: number; health: boolean } {
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
      const line = `${part.replace(/\.$/, "")}${record.confirmed ? "" : " (you told me; not confirmed yet)"}`;
      if (!seen.has(part.toLowerCase())) {
        seen.add(part.toLowerCase());
        lines.push(line);
      }
    }
  }

  if (lines.length === 0) {
    return {
      text: `Nothing about what ${first} likes${question.food ? " to eat" : ""} is on record yet. Tell me — "${first} likes Italian food" — and I'll remember it, or add it under Meals → Preferences.`,
      count: 0,
      health,
    };
  }
  return {
    text: [`Here's what's on record about ${first}:`, lines.map((line) => `- ${line}`).join("\n"), "You can correct any of this under HomeBrain, or tell me what's changed."].join("\n\n"),
    count: lines.length,
    health,
  };
}
