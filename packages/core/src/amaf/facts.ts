import { billTypeFor, type BillTypeKey } from "../finance/bill-catalog";
import { isRelationshipKind, type RelationshipKind } from "../identity/relationships";
import { dietClash, dishDietOf, type Diet } from "../meals/diet";
import {
  isDontKnow,
  isoDate,
  readAmount,
  readChoice,
  readClock,
  readDate,
  readList,
  readMonthDay,
  readPhone,
  readTimeRange,
  readWeekdays,
  readYesNo,
  stripLeadIn,
} from "./parse";

/**
 * Ask me about family (AMAF) — what HomeTalk asks, and what each answer fills.
 *
 * The owner, 2026-10-20: "HomeTalk will start asking questions to you about
 * the family to enrich WonderHome's database and HomeBrain's context. It
 * fills different sections of the app with relevant and important
 * information. It should cover all modules… subtle but extremely useful."
 *
 * Every question here is about one fact for one subject — a person, a pet,
 * a bill, a duty, the home — and names the record it fills and the screen
 * that shows it. A question is asked only when:
 * - the fact is missing, or it is old enough to be worth checking again
 *   (`refreshDays`, asked openly, so a different answer is noticed);
 * - the person asking may change that record (Admin-only facts are only
 *   asked of an Admin; a child is never asked);
 * - it was not skipped, unknown or answered recently (`COOLDOWN_DAYS`).
 * The most useful missing fact comes first (`weight`: safety, then what
 * reminders and plans need, then what makes answers warmer), and two
 * questions in a row are never about the same part of the app.
 *
 * Answers are read by rules (`parse.ts`). An answer that is missing a part
 * gets one focused follow-up for that part; an answer the rules cannot read
 * is never forced into a field — a fact with a note form keeps it as the
 * person's own words in HomeBrain, and one without asks again more simply.
 * A reading that disagrees with what is already on record is never written
 * over it: the reply says what is on record and where it came from
 * (`provenance.ts`), and the person decides.
 */

export const AMAF_MODULES = ["family", "school", "food", "bills", "duties", "home", "pets", "helpers", "brain"] as const;
export type AmafModule = (typeof AMAF_MODULES)[number];

export type AmafPerson = {
  id: string;
  name: string;
  memberType: "adult" | "child" | "helper";
};

export type DayHours = { starts: string; ends: string };

/** What WonderHome has, read in one wave by the server; everything the questions are decided from. */
export type AmafSnapshot = {
  today: string;
  speaker: { memberId: string; isAdmin: boolean; memberType: "adult" | "child" | "helper" };
  people: (AmafPerson & {
    dateOfBirth: string | null;
    occupation: string | null;
    workArrangement: string | null;
    workHours: DayHours | null;
    phone: string | null;
    specialOccasion: { label: string; date: string } | null;
    updatedAt: string | null;
  })[];
  /** Relationship rows between two members, either way round. */
  relationships: { memberId: string; relation: string; relatedMemberId: string }[];
  enrolments: { childId: string; schoolName: string; grade: string | null; hours: DayHours | null; updatedAt: string | null }[];
  teachers: { childId: string; role: string; name: string }[];
  activities: { childId: string; name: string }[];
  familyDiet: Diet | null;
  foodPreferences: { id: string; memberId: string | null; kind: string; subject: string; updatedAt: string | null }[];
  bills: { id: string; billType: string | null; name: string }[];
  responsibilities: { outcomeKey: string; title: string; primaryMemberId: string | null; updatedAt: string | null }[];
  address: { text: string; updatedAt: string | null } | null;
  pets: { id: string; name: string; species: string; dateOfBirth: string | null; vetName: string | null; vetContact: string | null; updatedAt: string | null }[];
  /** Helpers with at least one usual working window on record. */
  helperWindows: Record<string, { days: number[]; hours: DayHours | null }>;
  /** Keys of HomeBrain notes already kept (`memories.key`). */
  memoryKeys: readonly string[];
  /** What AMAF already asked, newest first. */
  answered: readonly AmafAnswered[];
};

export const AMAF_OUTCOMES = ["saved", "confirmed", "kept", "changed", "noted", "none", "dont_know", "skipped", "refused"] as const;
export type AmafOutcome = (typeof AMAF_OUTCOMES)[number];

export type AmafAnswered = { factKey: string; subjectId: string | null; outcome: AmafOutcome; at: string };

/** How long an outcome keeps a question from coming back, in days (null: until its refresh). */
export const COOLDOWN_DAYS: Record<AmafOutcome, number | null> = {
  saved: null,
  confirmed: null,
  kept: null,
  changed: null,
  noted: null,
  none: 180,
  dont_know: 45,
  skipped: 14,
  refused: 30,
};

/** The subject a question is about. `id` is the record's id; the household itself has none. */
export type AmafSubject =
  | { kind: "household"; id: null; name: null }
  | { kind: "person"; id: string; name: string }
  | { kind: "pet"; id: string; name: string }
  | { kind: "bill"; id: BillTypeKey; name: BillTypeKey }
  | { kind: "duty"; id: string; name: string };

/** A value a fact reads from an answer — the shapes the writer turns into a domain service call. */
export type AmafValue =
  | { fact: "member.birthday"; date: string }
  | { fact: "member.work"; occupation: string | null; arrangement: WorkArrangement | null; hours: DayHours | null }
  | { fact: "member.phone"; phone: string }
  | { fact: "member.relationship"; relation: RelationshipKind }
  | { fact: "member.anniversary"; label: string; date: string }
  | { fact: "child.school"; schoolName: string; grade: string | null }
  | { fact: "child.school_hours"; hours: DayHours }
  | { fact: "child.class_teacher"; name: string }
  | { fact: "child.activity"; name: string; kind: string; days: number[]; startsAt: string | null; endsAt: string | null }
  | { fact: "household.diet"; diet: Diet }
  | { fact: "household.allergies"; entries: { memberId: string | null; food: string }[] }
  | { fact: "member.food_likes"; subjects: string[] }
  | { fact: "member.food_dislikes"; subjects: string[] }
  | { fact: "bill"; billType: BillTypeKey; payee: string | null; amount: number | null; dueDay: number | null }
  | { fact: "duty.owner"; memberId: string }
  | { fact: "household.address"; text: string }
  | { fact: "household.pets"; pets: { name: string; species: string }[] }
  | { fact: "pet.birthday"; date: string }
  | { fact: "pet.vet"; vetName: string | null; vetContact: string | null }
  | { fact: "helper.schedule"; days: number[]; hours: DayHours }
  | { fact: "note"; text: string };

export const WORK_ARRANGEMENTS = ["office", "home", "hybrid", "not_working"] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];

/** What reading an answer came to. */
export type AmafReading =
  /** A complete value, ready to be checked against the record and written. */
  | { kind: "value"; value: AmafValue }
  /** Part of a value; `slot` names what to ask next, and `partial` is carried to the follow-up. */
  | { kind: "follow_up"; slot: string; partial: Record<string, unknown> }
  /** "No", "nobody", "we don't have one": an answer, and nothing to write. */
  | { kind: "none" }
  /** "I don't know". */
  | { kind: "dont_know" }
  /** Not readable as this fact; asked again once, more simply, or kept as a note. */
  | { kind: "unclear" };

export type ReadContext = {
  people: readonly AmafPerson[];
  speakerId: string;
  subject: AmafSubject;
  /** What an earlier part of the same question already gave. */
  partial: Record<string, unknown>;
  /** Which part a follow-up asked for, if this is a follow-up. */
  slot: string | null;
  today: string;
};

/** Where the fact lives, for the line under the question and the "Saved to …" reply. */
export type AmafSection = { label: "family" | "school" | "meals" | "bills" | "duties" | "places" | "pets" | "helpers" | "homebrain"; href: string };

export type AmafFact = {
  key: string;
  module: AmafModule;
  weight: number;
  /** Ask again after this many days even when known — openly, so a changed answer is noticed. */
  refreshDays?: number;
  /** Only an Admin may change this record. */
  adminOnly?: boolean;
  /** Each subject the question can be about. */
  subjects: (snapshot: AmafSnapshot) => AmafSubject[];
  /** What is on record for that subject, or null when it is missing. */
  stored: (snapshot: AmafSnapshot, subject: AmafSubject) => StoredValue | null;
  read: (answer: string, context: ReadContext) => AmafReading;
  /** Whether an answer says the same as what is on record. */
  same?: (stored: StoredValue, value: AmafValue) => boolean;
  section: (subject: AmafSubject) => AmafSection;
  /** Kept as the person's words in HomeBrain when the rules cannot read it, rather than asked again. */
  noteable?: boolean;
  /** An answer adds to what is on record (another allergy) rather than replacing it. */
  additive?: boolean;
};

/** What is on record, in words to say back and a value to compare with. */
export type StoredValue = { shown: string; value: unknown; updatedAt: string | null; recordId: string | null; screen: AmafSection["label"] };

const personSubject = (person: AmafPerson): AmafSubject => ({ kind: "person", id: person.id, name: person.name });
const people = (snapshot: AmafSnapshot, types: readonly AmafPerson["memberType"][]) => snapshot.people.filter((person) => types.includes(person.memberType));
const personOf = (snapshot: AmafSnapshot, subject: AmafSubject) => (subject.kind === "person" ? (snapshot.people.find((person) => person.id === subject.id) ?? null) : null);
const petOf = (snapshot: AmafSnapshot, subject: AmafSubject) => (subject.kind === "pet" ? (snapshot.pets.find((pet) => pet.id === subject.id) ?? null) : null);
const norm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
const household: AmafSubject = { kind: "household", id: null, name: null };

/** "Delhi Public School" and "delhi public school, RK Puram" are the same school; "DPS" and "Delhi Public School" are not known to be. */
function sameName(a: string, b: string): boolean {
  const left = norm(a).replace(/\b(?:the|school|ji|mr|mrs|ms|miss|dr|sir|madam|maam)\b/g, " ").replace(/\s+/g, " ").trim();
  const right = norm(b).replace(/\b(?:the|school|ji|mr|mrs|ms|miss|dr|sir|madam|maam)\b/g, " ").replace(/\s+/g, " ").trim();
  return left === right || (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left)));
}

function sameHours(a: DayHours | null | undefined, b: DayHours | null | undefined): boolean {
  return Boolean(a && b && a.starts.slice(0, 5) === b.starts.slice(0, 5) && a.ends.slice(0, 5) === b.ends.slice(0, 5));
}

/**
 * Who in the household a few words name: "Manan", "Asmi Sharma", "me",
 * "my husband"? — only names and "me"/"I"/"myself". Two people who fit is
 * no answer; the caller asks.
 */
export function personIn(words: string, everyone: readonly AmafPerson[], speakerId: string): { id: string } | "ambiguous" | null {
  const said = ` ${norm(words)} `;
  if (/ (?:me|i|myself|mine) /.test(said)) return { id: speakerId };
  const hits = everyone.filter((person) => {
    const full = norm(person.name);
    const first = full.split(" ")[0] ?? full;
    return said.includes(` ${full} `) || (first.length >= 2 && said.includes(` ${first} `));
  });
  if (hits.length === 1) return { id: hits[0]!.id };
  return hits.length > 1 ? "ambiguous" : null;
}

const RELATION_WORDS: readonly { value: RelationshipKind; words: readonly string[] }[] = [
  { value: "daughter", words: ["daughter", "beti"] },
  { value: "son", words: ["son", "beta"] },
  { value: "wife", words: ["wife", "patni"] },
  { value: "husband", words: ["husband", "pati"] },
  { value: "partner", words: ["partner"] },
  { value: "mother", words: ["mother", "mom", "mum", "mummy", "maa", "amma"] },
  { value: "father", words: ["father", "dad", "daddy", "papa", "pappa", "appa"] },
  { value: "sister", words: ["sister", "didi"] },
  { value: "brother", words: ["brother", "bhaiya", "bhai"] },
  { value: "grandmother", words: ["grandmother", "grandma", "granny", "dadi", "nani", "aaji"] },
  { value: "grandfather", words: ["grandfather", "grandpa", "dada", "nana", "ajoba"] },
  { value: "grandson", words: ["grandson"] },
  { value: "granddaughter", words: ["granddaughter"] },
  { value: "mother_in_law", words: ["mother in law", "mother-in-law", "saasu", "saas"] },
  { value: "father_in_law", words: ["father in law", "father-in-law", "sasur"] },
  { value: "sister_in_law", words: ["sister in law", "sister-in-law", "bhabhi", "nanad"] },
  { value: "brother_in_law", words: ["brother in law", "brother-in-law", "jija", "devar"] },
  { value: "daughter_in_law", words: ["daughter in law", "daughter-in-law", "bahu"] },
  { value: "son_in_law", words: ["son in law", "son-in-law", "damad"] },
  { value: "uncle", words: ["uncle", "chacha", "mama", "kaka"] },
  { value: "aunt", words: ["aunt", "aunty", "auntie", "chachi", "mami", "bua", "mausi", "kaki"] },
  { value: "cousin", words: ["cousin"] },
  { value: "nephew", words: ["nephew"] },
  { value: "niece", words: ["niece"] },
];

/** "She's my daughter" → daughter. An in-law is matched before the word it contains. */
export function readRelation(text: string): RelationshipKind | null {
  const said = norm(text);
  for (const entry of RELATION_WORDS.filter((option) => option.value.endsWith("_in_law"))) {
    if (entry.words.some((word) => ` ${said} `.includes(` ${norm(word)} `))) return entry.value;
  }
  const plain = RELATION_WORDS.filter((option) => !option.value.endsWith("_in_law"));
  const found = readChoice(said.replace(/\bin law\b/g, ""), plain);
  return found && isRelationshipKind(found) ? found : null;
}

/** "Vegetarian", "pure veg", "we eat eggs", "non-veg" — "non veg" is read before the "veg" inside it. */
export function readDiet(text: string): Diet | null {
  const said = ` ${norm(text)} `;
  if (/ (?:non ?veg\w*|nonveg|we eat (?:meat|chicken|fish)|meat eaters?) /.test(said)) return "non_vegetarian";
  if (/ jain /.test(said)) return "jain";
  if (/ vegan /.test(said)) return "vegan";
  if (/ (?:eggetarian|egg ?atarian|veg(?:etarian)? (?:with|plus|and) eggs?|eggs? (?:but|only)|we eat eggs) /.test(said)) return "eggetarian";
  if (/ (?:veg|vegetarian|pure veg|shakahari) /.test(said)) return "vegetarian";
  return null;
}

const ACTIVITY_KINDS: readonly [RegExp, string][] = [
  [/\b(?:piano|keyboard|guitar|violin|tabla|flute|drums?|music|singing|vocals?|ukulele|sitar)\b/i, "music"],
  [/\b(?:dance|dancing|ballet|kathak|bharatanatyam|hip ?hop|salsa|odissi)\b/i, "dance"],
  [/\b(?:karate|taekwondo|judo|kung ?fu|martial arts?|boxing)\b/i, "martial_arts"],
  [/\b(?:football|soccer|cricket|swimming|tennis|badminton|basketball|skating|athletics|hockey|chess|yoga|gymnastics|cycling|sports?)\b/i, "sport"],
  [/\b(?:art|drawing|painting|sketching|craft|pottery)\b/i, "art"],
  [/\b(?:french|german|spanish|hindi|sanskrit|japanese|mandarin|english|language)\b/i, "language"],
  [/\b(?:tuition|coaching|maths?|science|abacus|vedic|coding|robotics|olympiad|phonics)\b/i, "academic"],
];

export function activityKindOf(name: string): string {
  for (const [pattern, kind] of ACTIVITY_KINDS) if (pattern.test(name)) return kind;
  return "other";
}

const SPECIES: readonly [RegExp, string][] = [
  [/\b(?:dog|puppy|pup|doggo)\b/i, "dog"],
  [/\b(?:cat|kitten|kitty)\b/i, "cat"],
  [/\b(?:bird|parrot|budgie|cockatiel|lovebirds?)\b/i, "bird"],
  [/\b(?:fish|goldfish|aquarium)\b/i, "fish"],
  [/\b(?:rabbit|bunny)\b/i, "rabbit"],
  [/\b(?:turtle|tortoise)\b/i, "turtle"],
  [/\b(?:hamster|guinea pig)\b/i, "hamster"],
];

/** "A dog called Bruno and a cat, Mishti" → two pets. A pet with no name is not one yet. */
export function readPets(text: string): { name: string; species: string }[] {
  const found: { name: string; species: string }[] = [];
  const chunks = text.split(/\s*(?:,|;|\band\b|&)\s*/i);
  let species: string | null = null;
  for (const chunk of chunks) {
    for (const [pattern, kind] of SPECIES) if (pattern.test(chunk)) species = kind;
    const named = chunk.match(/\b(?:called|named|name is|names? are|is)\s+([\p{Lu}][\p{L}'-]+)/u) ?? chunk.match(/^\s*([\p{Lu}][\p{L}'-]+)\s*(?:\(|$|the\b)/u);
    if (named && species && !/^(?:Yes|No|We|A|An|The|Our|My)$/.test(named[1]!)) {
      found.push({ name: named[1]!, species });
      species = null;
    }
  }
  return found;
}

const GRADE = /\b(?:grade|class|std\.?|standard|year|form)\s*([0-9]{1,2}|[ivx]{1,4}|nursery|lkg|ukg|kg|pre ?k|jr ?kg|sr ?kg)\b|\b([0-9]{1,2})(?:st|nd|rd|th)\s*(?:grade|class|std|standard)?\b|\b(nursery|lkg|ukg|jr\.? ?kg|sr\.? ?kg|pre[- ]?k)\b/i;

/** "DPS, grade 4", "She's in 4th at Bishop Cotton", "class V at St. Mary's". */
export function readSchool(text: string): { schoolName: string | null; grade: string | null } {
  const grade = text.match(GRADE);
  const gradeValue = grade ? (grade[1] ?? grade[2] ?? grade[3] ?? "").toUpperCase().replace(/\s+/g, " ") : null;
  const rest = (grade ? text.replace(grade[0], " ") : text)
    .replace(/\b(?:she|he|they)(?:'s|'re|\s+is|\s+are)\s+(?:in|at)\b/gi, " ")
    .replace(/\b(?:goes|go|studies|study|is|are)\s+(?:to|at|in)\b/gi, " ")
    .replace(/\b(?:in|at|of|from)\b/gi, " ")
    .replace(/[,.;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const name = stripLeadIn(rest);
  return { schoolName: name && name.length >= 2 && !/^(?:yes|no|same)$/i.test(name) ? name : null, grade: gradeValue || null };
}

const ALLERGY_LEAD = /\b(?:is|are|'s|has an?|have an?|has|have)?\s*(?:allergic|allergy|allergies)\s*(?:to|of|with)?\b/gi;

/**
 * "Manan is allergic to peanuts and Asmi to milk", "I'm allergic to prawns",
 * "the whole family can't have gluten". Each part is the person it names
 * and the foods after them; a part with foods and no one named belongs to
 * the person the last part named, or to the family when no one was.
 */
export function readAllergies(text: string, everyone: readonly AmafPerson[], speakerId: string): { entries: { memberId: string | null; food: string }[]; ambiguous: boolean } {
  const entries: { memberId: string | null; food: string }[] = [];
  let ambiguous = false;
  const parts = text.split(/\s*(?:;|\.|\band also\b|\bwhile\b|,\s*(?=[\p{Lu}]))\s*/u).filter(Boolean);
  let last: string | null = null;
  for (const raw of parts) {
    // Split "Manan to peanuts and Asmi to milk" where a second name starts.
    const segments = raw.split(new RegExp(String.raw`\s+and\s+(?=(?:${everyone.map((person) => (person.name.split(/\s+/)[0] ?? person.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "zzzz"})\b)`, "i"));
    for (const segment of segments) {
      const who = personIn(segment, everyone, speakerId);
      if (who === "ambiguous") ambiguous = true;
      const memberId: string | null = who && who !== "ambiguous" ? who.id : /\b(?:everyone|everybody|whole family|all of us|family)\b/i.test(segment) ? null : last;
      let foods = segment.replace(ALLERGY_LEAD, " ");
      for (const person of everyone) {
        const first = person.name.split(/\s+/)[0] ?? person.name;
        foods = foods.replace(new RegExp(String.raw`\b(?:${person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\b`, "gi"), " ");
      }
      foods = foods.replace(/\b(?:i'?m|i am|me|my|myself|to|of|the|whole family|everyone|everybody|all of us|family|can'?t have|cannot have|can'?t eat|cannot eat|avoid|avoids|gets?|reaction|severely|mildly|a bit|slightly|and|yes|yeah|no one|nobody|none|no|except|but|apart from|other than|only|she|he|they|is|are|has|have|it'?s|food)\b/gi, " ");
      for (const food of readList(foods)) {
        const clean = food.trim();
        if (clean.length >= 2 && clean.length <= 40) entries.push({ memberId, food: clean.toLowerCase() });
      }
      last = memberId;
    }
  }
  return { entries, ambiguous };
}

/** A list of foods from "she loves paneer, dosa and mango" — the lead-in taken off. */
function readFoods(text: string): string[] {
  const body = text.replace(/^(?:(?:he|she|they|we|i)\s+)?(?:really\s+)?(?:loves?|likes?|enjoys?|adores?|hates?|dislikes?|can'?t stand|won'?t eat|doesn'?t eat|don'?t eat|never eats?|refuses?|avoids?)\s*/i, "").replace(/^(?:anything with|any|mostly|usually)\s+/i, "");
  return readList(body)
    .map((item) => item.toLowerCase().replace(/\b(?:food|foods|dishes)\b$/i, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 40 && !/^(?:yes|no|none|nothing|everything|anything)$/.test(item));
}

const NONE = /^(?:no|nope|none|nobody|no one|nothing|not really|we don'?t|we do not|don'?t have|do not have|no we don'?t|nah|n\/a)\b/i;
const isNone = (text: string) => NONE.test(text.trim());

/** The reading every fact begins with: "I don't know" and an empty answer. */
function common(answer: string): AmafReading | null {
  if (!answer.trim()) return { kind: "unclear" };
  if (isDontKnow(answer)) return { kind: "dont_know" };
  return null;
}

const familySection = (subject: AmafSubject): AmafSection => ({ label: "family", href: "/family" });
const schoolSection = (): AmafSection => ({ label: "school", href: "/school" });
const mealsSection = (): AmafSection => ({ label: "meals", href: "/meals?tab=preferences" });
const brainSection = (): AmafSection => ({ label: "homebrain", href: "/certification" });

function note(text: string): AmafReading {
  const said = text.trim().replace(/\s+/g, " ").slice(0, 280);
  return said ? { kind: "value", value: { fact: "note", text: said } } : { kind: "unclear" };
}

/** A note-only question: the answer is the household's own words, kept in HomeBrain. */
function noteFact(key: string, module: AmafModule, weight: number, scope: "household" | "member", memoryKey: (subject: AmafSubject) => string): AmafFact {
  return {
    key,
    module,
    weight,
    noteable: true,
    subjects: (snapshot) => (scope === "household" ? [household] : people(snapshot, ["adult", "child"]).map(personSubject)),
    stored: (snapshot, subject) => (snapshot.memoryKeys.includes(memoryKey(subject)) ? { shown: "", value: true, updatedAt: null, recordId: null, screen: "homebrain" } : null),
    read: (answer) => common(answer) ?? (isNone(answer) && answer.trim().split(/\s+/).length <= 3 ? { kind: "none" } : note(answer)),
    section: brainSection,
  };
}

/** The HomeBrain note key a note fact keeps its answer under. */
export function amafMemoryKey(factKey: string, subject: AmafSubject): string {
  return subject.kind === "person" ? `member.amaf.${factKey}.${subject.id}` : `household.amaf.${factKey}`;
}

/** The bills worth asking about, most universal first; each is asked only while it is not on record. */
export const AMAF_BILLS: readonly { key: BillTypeKey; weight: number }[] = [
  { key: "electricity", weight: 58 },
  { key: "broadband", weight: 50 },
  { key: "mobile", weight: 46 },
  { key: "rent", weight: 44 },
  { key: "water", weight: 40 },
  { key: "maintenance", weight: 38 },
  { key: "lpg", weight: 36 },
  { key: "piped_gas", weight: 30 },
];

/** The duties worth an owner, in the order a household feels them. */
export const AMAF_DUTIES = ["groceries.stocked", "meals.dinner_ready", "finance.bills_paid", "school.run"] as const;

export const AMAF_FACTS: readonly AmafFact[] = [
  {
    key: "household.allergies",
    module: "food",
    weight: 100,
    refreshDays: 365,
    subjects: () => [household],
    stored: (snapshot) => {
      const allergies = snapshot.foodPreferences.filter((preference) => preference.kind === "allergy" || preference.kind === "medical");
      if (allergies.length === 0) return null;
      const nameOf = (id: string | null) => (id ? (snapshot.people.find((person) => person.id === id)?.name ?? null) : null);
      return {
        shown: allergies.map((allergy) => (nameOf(allergy.memberId) ? `${nameOf(allergy.memberId)}: ${allergy.subject}` : allergy.subject)).join(", "),
        value: allergies.map((allergy) => ({ memberId: allergy.memberId, food: allergy.subject.toLowerCase() })),
        updatedAt: allergies.map((allergy) => allergy.updatedAt ?? "").sort().at(-1) || null,
        recordId: allergies[0]!.id,
        screen: "meals",
      };
    },
    read: (answer, context) => {
      const first = common(answer);
      if (first) return first;
      // "Nobody has a food allergy" is none; "no one except Manan, he's allergic to nuts" is not.
      if (isNone(answer) && !/\b(?:except|but|apart from|other than|only)\b/i.test(answer)) return { kind: "none" };
      const read = readAllergies(answer, context.people, context.speakerId);
      if (read.ambiguous) return { kind: "follow_up", slot: "who", partial: {} };
      return read.entries.length > 0 ? { kind: "value", value: { fact: "household.allergies", entries: read.entries } } : { kind: "unclear" };
    },
    // A new allergy adds to the record; only "nobody" when some are on record is said back.
    additive: true,
    section: mealsSection,
  },
  {
    key: "member.birthday",
    module: "family",
    weight: 90,
    subjects: (snapshot) => people(snapshot, ["adult", "child"]).map(personSubject),
    stored: (snapshot, subject) => {
      const person = personOf(snapshot, subject);
      return person?.dateOfBirth ? { shown: person.dateOfBirth, value: person.dateOfBirth, updatedAt: person.updatedAt, recordId: person.id, screen: "family" } : null;
    },
    read: (answer, context) => {
      const first = common(answer);
      if (first) return first;
      if (context.slot === "year") {
        const year = answer.match(/\b(19\d{2}|20\d{2})\b/);
        const month = Number(context.partial.month);
        const day = Number(context.partial.day);
        if (!year) return { kind: "unclear" };
        const date = isoDate({ year: Number(year[1]), month, day });
        return date && date <= context.today ? { kind: "value", value: { fact: "member.birthday", date } } : { kind: "unclear" };
      }
      const date = readDate(answer);
      if (!date) return { kind: "unclear" };
      if (date.year === null) return { kind: "follow_up", slot: "year", partial: { month: date.month, day: date.day } };
      const iso = isoDate(date)!;
      return iso <= context.today ? { kind: "value", value: { fact: "member.birthday", date: iso } } : { kind: "unclear" };
    },
    same: (stored, value) => value.fact === "member.birthday" && stored.value === value.date,
    section: familySection,
  },
  {
    key: "child.school",
    module: "school",
    weight: 82,
    refreshDays: 180,
    subjects: (snapshot) => people(snapshot, ["child"]).map(personSubject),
    stored: (snapshot, subject) => {
      const enrolment = snapshot.enrolments.find((entry) => entry.childId === subject.id);
      return enrolment
        ? { shown: enrolment.grade ? `${enrolment.schoolName}, ${enrolment.grade}` : enrolment.schoolName, value: { schoolName: enrolment.schoolName, grade: enrolment.grade }, updatedAt: enrolment.updatedAt, recordId: enrolment.childId, screen: "school" }
        : null;
    },
    read: (answer, context) => {
      const first = common(answer);
      if (first) return first;
      if (context.slot === "grade") {
        const read = readSchool(answer);
        const grade = read.grade ?? (answer.trim().match(/^[0-9]{1,2}$/) ? answer.trim() : null);
        return grade ? { kind: "value", value: { fact: "child.school", schoolName: String(context.partial.schoolName), grade } } : { kind: "value", value: { fact: "child.school", schoolName: String(context.partial.schoolName), grade: null } };
      }
      if (/^(?:none|no|not yet|doesn'?t go|does not go|home ?school(?:ed|ing)?)\b/i.test(answer.trim())) return { kind: "none" };
      const read = readSchool(answer);
      if (!read.schoolName) return read.grade ? { kind: "follow_up", slot: "school", partial: { grade: read.grade } } : { kind: "unclear" };
      const grade = read.grade ?? (typeof context.partial.grade === "string" ? context.partial.grade : null);
      if (!grade && context.slot !== "school") return { kind: "follow_up", slot: "grade", partial: { schoolName: read.schoolName } };
      return { kind: "value", value: { fact: "child.school", schoolName: read.schoolName, grade } };
    },
    same: (stored, value) => {
      if (value.fact !== "child.school") return true;
      const was = stored.value as { schoolName: string; grade: string | null };
      return sameName(was.schoolName, value.schoolName) && (!value.grade || !was.grade || norm(was.grade) === norm(value.grade));
    },
    section: schoolSection,
  },
  {
    key: "household.diet",
    module: "food",
    weight: 72,
    refreshDays: 365,
    subjects: () => [household],
    stored: (snapshot) => (snapshot.familyDiet ? { shown: snapshot.familyDiet, value: snapshot.familyDiet, updatedAt: snapshot.foodPreferences.find((preference) => preference.kind === "diet" && preference.memberId === null)?.updatedAt ?? null, recordId: null, screen: "meals" } : null),
    read: (answer) => {
      const first = common(answer);
      if (first) return first;
      const diet = readDiet(answer);
      return diet ? { kind: "value", value: { fact: "household.diet", diet } } : { kind: "unclear" };
    },
    same: (stored, value) => value.fact === "household.diet" && stored.value === value.diet,
    section: mealsSection,
  },
  {
    key: "household.address",
    module: "home",
    weight: 76,
    refreshDays: 365,
    adminOnly: true,
    subjects: () => [household],
    stored: (snapshot) => (snapshot.address ? { shown: snapshot.address.text, value: snapshot.address.text, updatedAt: snapshot.address.updatedAt, recordId: null, screen: "places" } : null),
    read: (answer) => {
      const first = common(answer);
      if (first) return first;
      const text = stripLeadIn(answer).replace(/^(?:we live (?:at|in)|our address is|address is|the address is)\s+/i, "");
      // An address has a few words to it, most of them words: "Pune" alone is a city, and "8 to 2:30" is a time.
      const words = text.split(/[\s,]+/).filter(Boolean);
      const named = words.filter((word) => /\p{L}{3,}/u.test(word) && !/^(?:to|and|till|until|from|between|am|pm)$/i.test(word));
      return words.length >= 3 && named.length >= 2 && !readTimeRange(text) ? { kind: "value", value: { fact: "household.address", text } } : { kind: "unclear" };
    },
    same: (stored, value) => value.fact === "household.address" && (norm(String(stored.value)).includes(norm(value.text)) || norm(value.text).includes(norm(String(stored.value)))),
    section: () => ({ label: "places", href: "/household/address" }),
  },
  {
    key: "child.school_hours",
    module: "school",
    weight: 66,
    refreshDays: 180,
    subjects: (snapshot) => people(snapshot, ["child"]).filter((child) => snapshot.enrolments.some((entry) => entry.childId === child.id)).map(personSubject),
    stored: (snapshot, subject) => {
      const enrolment = snapshot.enrolments.find((entry) => entry.childId === subject.id);
      return enrolment?.hours ? { shown: `${enrolment.hours.starts.slice(0, 5)}–${enrolment.hours.ends.slice(0, 5)}`, value: enrolment.hours, updatedAt: enrolment.updatedAt, recordId: enrolment.childId, screen: "school" } : null;
    },
    read: (answer) => {
      const first = common(answer);
      if (first) return first;
      const hours = readTimeRange(answer);
      return hours ? { kind: "value", value: { fact: "child.school_hours", hours } } : { kind: "unclear" };
    },
    same: (stored, value) => value.fact !== "child.school_hours" || sameHours(stored.value as DayHours, value.hours),
    section: schoolSection,
  },
  {
    key: "helper.schedule",
    module: "helpers",
    weight: 62,
    refreshDays: 120,
    adminOnly: true,
    subjects: (snapshot) => people(snapshot, ["helper"]).map(personSubject),
    stored: (snapshot, subject) => {
      const windows = subject.kind === "person" ? snapshot.helperWindows[subject.id] : undefined;
      return windows && windows.days.length > 0 ? { shown: "", value: windows, updatedAt: null, recordId: subject.id, screen: "helpers" } : null;
    },
    read: (answer, context) => {
      const first = common(answer);
      if (first) return first;
      const days = context.slot === "hours" ? (context.partial.days as number[]) : readWeekdays(answer);
      const hours = readTimeRange(answer) ?? (context.partial.hours as DayHours | undefined) ?? null;
      if (days.length === 0) return hours ? { kind: "follow_up", slot: "days", partial: { hours } } : { kind: "unclear" };
      if (!hours) return { kind: "follow_up", slot: "hours", partial: { days } };
      return { kind: "value", value: { fact: "helper.schedule", days, hours } };
    },
    same: (stored, value) => {
      if (value.fact !== "helper.schedule") return true;
      const was = stored.value as { days: number[]; hours: DayHours | null };
      return was.days.join(",") === value.days.join(",") && (!was.hours || sameHours(was.hours, value.hours));
    },
    section: () => ({ label: "helpers", href: "/househelper" }),
  },
  {
    key: "member.work",
    module: "family",
    weight: 60,
    refreshDays: 180,
    subjects: (snapshot) => people(snapshot, ["adult"]).map(personSubject),
    stored: (snapshot, subject) => {
      const person = personOf(snapshot, subject);
      if (!person || (!person.occupation && !person.workArrangement && !person.workHours)) return null;
      const parts = [person.occupation, person.workHours ? `${person.workHours.starts.slice(0, 5)}–${person.workHours.ends.slice(0, 5)}` : null].filter(Boolean);
      return { shown: parts.join(", "), value: { occupation: person.occupation, arrangement: person.workArrangement, hours: person.workHours }, updatedAt: person.updatedAt, recordId: person.id, screen: "family" };
    },
    read: (answer, context) => {
      const first = common(answer);
      if (first) return first;
      const arrangement = readChoice<WorkArrangement>(answer, [
        { value: "home", words: ["from home", "work from home", "wfh", "remote", "remotely", "at home"] },
        { value: "office", words: ["office", "on site", "onsite", "at the office", "goes in"] },
        { value: "hybrid", words: ["hybrid", "a mix", "mix of both", "some days"] },
        { value: "not_working", words: ["not working", "doesn't work", "does not work", "retired", "homemaker", "housewife", "stay at home", "student"] },
      ]);
      const hours = readTimeRange(answer);
      if (context.slot === "hours") {
        const previous = context.partial as { occupation?: string | null; arrangement?: WorkArrangement | null };
        return { kind: "value", value: { fact: "member.work", occupation: previous.occupation ?? null, arrangement: arrangement ?? previous.arrangement ?? null, hours } };
      }
      const occupationText = answer
        .split(/[,;.]|\b(?:from|between)\s+\d|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|to|till)\b|\b(?:works? )?(?:from home|in (?:an |the )?office|hybrid|remote(?:ly)?)\b/i)[0]!
        .replace(/^(?:(?:he|she|they|i)(?:'s|'m|'re|\s+is|\s+are|\s+am)\s+(?:an?\s+)?|(?:he|she|they|i)\s+works?\s+(?:as\s+(?:an?\s+)?|at\s+|in\s+|for\s+)?|works?\s+(?:as\s+(?:an?\s+)?|at\s+|in\s+|for\s+)?|an?\s+)/i, "")
        .trim();
      const occupation = arrangement === "not_working" ? (occupationText && !/\b(?:not working|doesn'?t work|does not work)\b/i.test(occupationText) ? occupationText : null) : occupationText && !/^\d/.test(occupationText) ? occupationText : null;
      if (!occupation && !arrangement && !hours) return { kind: "unclear" };
      if (!hours && arrangement !== "not_working") return { kind: "follow_up", slot: "hours", partial: { occupation, arrangement } };
      return { kind: "value", value: { fact: "member.work", occupation, arrangement, hours } };
    },
    same: (stored, value) => {
      if (value.fact !== "member.work") return true;
      const was = stored.value as { occupation: string | null; arrangement: string | null; hours: DayHours | null };
      if (value.hours && was.hours && !sameHours(was.hours, value.hours)) return false;
      if (value.arrangement && was.arrangement && value.arrangement !== was.arrangement) return false;
      if (value.occupation && was.occupation && !sameName(was.occupation, value.occupation) && !norm(was.occupation).includes(norm(value.occupation)) && !norm(value.occupation).includes(norm(was.occupation))) return false;
      return true;
    },
    section: familySection,
  },
  ...AMAF_BILLS.map(
    ({ key, weight }): AmafFact => ({
      key: `bill.${key}`,
      module: "bills",
      weight,
      adminOnly: true,
      subjects: () => [{ kind: "bill", id: key, name: key }],
      stored: (snapshot) => {
        const bill = snapshot.bills.find((entry) => entry.billType === key || billTypeFor(entry.name) === key);
        return bill ? { shown: bill.name, value: true, updatedAt: null, recordId: bill.id, screen: "bills" } : null;
      },
      read: (answer, context) => {
        const first = common(answer);
        if (first) return first;
        if (context.slot === "details") {
          const amount = readAmount(answer.replace(/\b(?:on|by)\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\b/gi, " "));
          return { kind: "value", value: { fact: "bill", billType: key, payee: (context.partial.payee as string | null) ?? null, amount, dueDay: readMonthDay(answer) } };
        }
        const yes = readYesNo(answer);
        if (yes === false || (isNone(answer) && answer.trim().split(/\s+/).length <= 4)) return { kind: "none" };
        const dueDay = readMonthDay(answer);
        const amount = readAmount(answer.replace(/\b(?:on|by|due)\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\b/gi, " ").replace(/\b\d{1,2}(?:st|nd|rd|th)\b/gi, " "));
        const payee =
          answer
            .replace(/^(?:yes|yeah|yep|sure|we do|we pay|haan)[,. ]*/i, "")
            .replace(/\b(?:(?:due|payable)\s+)?(?:on|by)?\s*(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b(?:\s+of\s+(?:every|each|the)\s+month)?/gi, " ")
            .replace(/(?:₹|\brs\.?|\binr)?\s*\d[\d,]*(?:\.\d{1,2})?\s*(?:k|thousand|lakh)?\b(?:\s*(?:rupees|rs))?/gi, " ")
            .replace(/\b(?:about|around|roughly|approx(?:imately)?|usually|every month|monthly|a month|per month|due|on|by|the|of|is|it'?s|to|from|with|bill|paid|pay|we|our|it|comes)\b/gi, " ")
            .replace(/(?:st|nd|rd|th)\b/gi, " ")
            .replace(/[,.;]+/g, " ")
            .replace(/\s+/g, " ")
            .trim() || null;
        if (yes === true && !payee && amount === null && dueDay === null) return { kind: "follow_up", slot: "details", partial: {} };
        if (amount === null && dueDay === null) return { kind: "follow_up", slot: "details", partial: { payee } };
        return { kind: "value", value: { fact: "bill", billType: key, payee, amount, dueDay } };
      },
      section: () => ({ label: "bills", href: "/bills" }),
    }),
  ),
  {
    key: "member.relationship",
    module: "family",
    weight: 56,
    adminOnly: true,
    subjects: (snapshot) =>
      people(snapshot, ["adult", "child"])
        .filter((person) => person.id !== snapshot.speaker.memberId)
        .filter((person) => !snapshot.relationships.some((row) => (row.memberId === person.id && row.relatedMemberId === snapshot.speaker.memberId) || (row.relatedMemberId === person.id && row.memberId === snapshot.speaker.memberId)))
        .map(personSubject),
    stored: () => null,
    read: (answer) => {
      const first = common(answer);
      if (first) return first;
      const relation = readRelation(answer);
      return relation ? { kind: "value", value: { fact: "member.relationship", relation } } : { kind: "unclear" };
    },
    section: () => ({ label: "family", href: "/household/members" }),
  },
  {
    key: "member.phone",
    module: "family",
    weight: 52,
    adminOnly: true,
    subjects: (snapshot) => people(snapshot, ["adult", "helper"]).map(personSubject),
    stored: (snapshot, subject) => {
      const person = personOf(snapshot, subject);
      return person?.phone ? { shown: person.phone, value: person.phone, updatedAt: null, recordId: person.id, screen: "family" } : null;
    },
    read: (answer) => {
      const first = common(answer);
      if (first) return first;
      if (/^(?:no|none|doesn'?t have|does not have)\b/i.test(answer.trim())) return { kind: "none" };
      const phone = readPhone(answer);
      return phone ? { kind: "value", value: { fact: "member.phone", phone } } : { kind: "unclear" };
    },
    same: (stored, value) => value.fact !== "member.phone" || String(stored.value).replace(/\D/g, "").slice(-10) === value.phone.replace(/\D/g, "").slice(-10),
    section: familySection,
  },
  {
    key: "child.activity",
    module: "school",
    weight: 50,
    subjects: (snapshot) => people(snapshot, ["child"]).filter((child) => !snapshot.activities.some((activity) => activity.childId === child.id)).map(personSubject),
    stored: () => null,
    read: (answer, context) => {
      const first = common(answer);
      if (first) return first;
      if (context.slot === "when") {
        const days = readWeekdays(answer);
        const range = readTimeRange(answer);
        const single = range ? null : answer.match(/\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
        const startsAt = range?.starts ?? (single ? readClock(single[1]!.replace(/\s+/g, ""), true) : null);
        return { kind: "value", value: { fact: "child.activity", name: String(context.partial.name), kind: String(context.partial.kind), days, startsAt, endsAt: range?.ends ?? null } };
      }
      if (isNone(answer) && answer.trim().split(/\s+/).length <= 4) return { kind: "none" };
      const days = readWeekdays(answer);
      const range = readTimeRange(answer);
      const single = range ? null : answer.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
      const name = answer
        .replace(/^(?:yes|yeah|yep|sure)[,. ]*/i, "")
        .split(/\b(?:on|every|at|from|between)\b|,/i)[0]!
        .replace(/^(?:(?:she|he|they)\s+(?:goes|go|does|do|has|have|learns?|takes?|plays?|attends?)\s+(?:to\s+)?|(?:goes|does|learns|takes|plays|attends)\s+(?:to\s+)?)/i, "")
        .replace(/\b(?:classes|class|lessons?|coaching)\b$/i, (word) => word)
        .trim();
      if (!name || name.length < 2) return { kind: "unclear" };
      const kind = activityKindOf(name);
      const startsAt = range?.starts ?? (single ? readClock(single[1]!.replace(/\s+/g, ""), true) : null);
      if (days.length === 0 && !startsAt) return { kind: "follow_up", slot: "when", partial: { name, kind } };
      return { kind: "value", value: { fact: "child.activity", name: name.charAt(0).toUpperCase() + name.slice(1), kind, days, startsAt, endsAt: range?.ends ?? null } };
    },
    section: schoolSection,
  },
  {
    key: "duty.owner",
    module: "duties",
    weight: 48,
    refreshDays: 180,
    adminOnly: true,
    subjects: (snapshot) =>
      snapshot.responsibilities
        .filter((duty) => (AMAF_DUTIES as readonly string[]).includes(duty.outcomeKey))
        .map((duty): AmafSubject => ({ kind: "duty", id: duty.outcomeKey, name: duty.title })),
    stored: (snapshot, subject) => {
      const duty = snapshot.responsibilities.find((entry) => entry.outcomeKey === subject.id);
      const owner = duty?.primaryMemberId ? snapshot.people.find((person) => person.id === duty.primaryMemberId) : null;
      return owner ? { shown: owner.name, value: owner.id, updatedAt: duty?.updatedAt ?? null, recordId: subject.id, screen: "duties" } : null;
    },
    read: (answer, context) => {
      const first = common(answer);
      if (first) return first;
      const who = personIn(answer, context.people.filter((person) => person.memberType !== "child"), context.speakerId);
      if (who === "ambiguous") return { kind: "follow_up", slot: "who", partial: {} };
      return who ? { kind: "value", value: { fact: "duty.owner", memberId: who.id } } : { kind: "unclear" };
    },
    same: (stored, value) => value.fact !== "duty.owner" || stored.value === value.memberId,
    section: () => ({ label: "duties", href: "/household/responsibilities" }),
  },
  {
    key: "child.class_teacher",
    module: "school",
    weight: 44,
    subjects: (snapshot) => people(snapshot, ["child"]).filter((child) => snapshot.enrolments.some((entry) => entry.childId === child.id)).map(personSubject),
    stored: (snapshot, subject) => {
      const teacher = snapshot.teachers.find((entry) => entry.childId === subject.id && entry.role === "class_teacher");
      return teacher ? { shown: teacher.name, value: teacher.name, updatedAt: null, recordId: subject.id, screen: "school" } : null;
    },
    read: (answer) => {
      const first = common(answer);
      if (first) return first;
      const name = stripLeadIn(answer).replace(/^(?:(?:the )?class teacher is|teacher is)\s+/i, "");
      return name.length >= 2 && name.split(/\s+/).length <= 5 ? { kind: "value", value: { fact: "child.class_teacher", name } } : { kind: "unclear" };
    },
    same: (stored, value) => value.fact !== "child.class_teacher" || sameName(String(stored.value), value.name),
    section: schoolSection,
  },
  {
    key: "pet.vet",
    module: "pets",
    weight: 42,
    refreshDays: 365,
    adminOnly: true,
    subjects: (snapshot) => snapshot.pets.map((pet): AmafSubject => ({ kind: "pet", id: pet.id, name: pet.name })),
    stored: (snapshot, subject) => {
      const pet = petOf(snapshot, subject);
      return pet?.vetName ? { shown: [pet.vetName, pet.vetContact].filter(Boolean).join(", "), value: pet.vetName, updatedAt: pet.updatedAt, recordId: pet.id, screen: "pets" } : null;
    },
    read: (answer) => {
      const first = common(answer);
      if (first) return first;
      if (/^(?:no|none|not yet|we don'?t have)\b/i.test(answer.trim())) return { kind: "none" };
      const phone = readPhone(answer);
      const name = stripLeadIn(answer.replace(/(\+?\d[\d\s()-]{7,}\d)/, " ").replace(/\b(?:and )?(?:the |her |his |their )?(?:number|phone|contact)(?: is)?\b/gi, " ").replace(/[,;]+/g, " ").replace(/\s+/g, " "));
      return name.length >= 2 ? { kind: "value", value: { fact: "pet.vet", vetName: name, vetContact: phone } } : phone ? { kind: "value", value: { fact: "pet.vet", vetName: null, vetContact: phone } } : { kind: "unclear" };
    },
    same: (stored, value) => value.fact !== "pet.vet" || !value.vetName || sameName(String(stored.value), value.vetName),
    section: () => ({ label: "pets", href: "/family" }),
  },
  {
    key: "member.food_likes",
    module: "food",
    weight: 40,
    subjects: (snapshot) => people(snapshot, ["adult", "child"]).filter((person) => !snapshot.foodPreferences.some((preference) => preference.memberId === person.id && preference.kind === "preference")).map(personSubject),
    stored: () => null,
    read: (answer) => {
      const first = common(answer);
      if (first) return first;
      const subjects = readFoods(answer);
      return subjects.length > 0 ? { kind: "value", value: { fact: "member.food_likes", subjects } } : { kind: "unclear" };
    },
    section: mealsSection,
  },
  {
    key: "member.anniversary",
    module: "family",
    weight: 36,
    subjects: (snapshot) => {
      const me = snapshot.people.find((person) => person.id === snapshot.speaker.memberId);
      const married = snapshot.relationships.some((row) => (row.memberId === snapshot.speaker.memberId || row.relatedMemberId === snapshot.speaker.memberId) && ["husband", "wife", "spouse", "partner"].includes(row.relation));
      return me && me.memberType === "adult" && married ? [personSubject(me)] : [];
    },
    stored: (snapshot, subject) => {
      const person = personOf(snapshot, subject);
      return person?.specialOccasion ? { shown: `${person.specialOccasion.label}: ${person.specialOccasion.date}`, value: person.specialOccasion.date, updatedAt: person.updatedAt, recordId: person.id, screen: "family" } : null;
    },
    read: (answer, context) => {
      const first = common(answer);
      if (first) return first;
      if (context.slot === "year") {
        const year = answer.match(/\b(19\d{2}|20\d{2})\b/);
        const date = year ? isoDate({ year: Number(year[1]), month: Number(context.partial.month), day: Number(context.partial.day) }) : null;
        return date ? { kind: "value", value: { fact: "member.anniversary", label: "Wedding anniversary", date } } : { kind: "unclear" };
      }
      if (readYesNo(answer) === false && !readDate(answer)) return { kind: "none" };
      const date = readDate(answer);
      if (!date) return { kind: "unclear" };
      if (date.year === null) return { kind: "follow_up", slot: "year", partial: { month: date.month, day: date.day } };
      return { kind: "value", value: { fact: "member.anniversary", label: "Wedding anniversary", date: isoDate(date)! } };
    },
    section: familySection,
  },
  {
    key: "member.food_dislikes",
    module: "food",
    weight: 34,
    subjects: (snapshot) => people(snapshot, ["adult", "child"]).filter((person) => !snapshot.foodPreferences.some((preference) => preference.memberId === person.id && preference.kind === "dislike")).map(personSubject),
    stored: () => null,
    read: (answer) => {
      const first = common(answer);
      if (first) return first;
      if (/^(?:no|nothing|none|not really|eats everything|everything)\b/i.test(answer.trim())) return { kind: "none" };
      const subjects = readFoods(answer);
      return subjects.length > 0 ? { kind: "value", value: { fact: "member.food_dislikes", subjects } } : { kind: "unclear" };
    },
    section: mealsSection,
  },
  {
    key: "household.pets",
    module: "pets",
    weight: 32,
    adminOnly: true,
    subjects: (snapshot) => (snapshot.pets.length === 0 ? [household] : []),
    stored: () => null,
    read: (answer) => {
      const first = common(answer);
      if (first) return first;
      if (readYesNo(answer) === false || /^(?:no pets|none|we don'?t)\b/i.test(answer.trim())) return { kind: "none" };
      const pets = readPets(answer);
      return pets.length > 0 ? { kind: "value", value: { fact: "household.pets", pets } } : { kind: "unclear" };
    },
    section: () => ({ label: "pets", href: "/family" }),
  },
  {
    key: "pet.birthday",
    module: "pets",
    weight: 24,
    adminOnly: true,
    subjects: (snapshot) => snapshot.pets.map((pet): AmafSubject => ({ kind: "pet", id: pet.id, name: pet.name })),
    stored: (snapshot, subject) => {
      const pet = petOf(snapshot, subject);
      return pet?.dateOfBirth ? { shown: pet.dateOfBirth, value: pet.dateOfBirth, updatedAt: pet.updatedAt, recordId: pet.id, screen: "pets" } : null;
    },
    read: (answer, context) => {
      const first = common(answer);
      if (first) return first;
      const date = readDate(answer);
      if (!date) return { kind: "unclear" };
      const iso = isoDate({ ...date, year: date.year ?? (context.partial.year as number | undefined) ?? null });
      return iso && iso <= context.today ? { kind: "value", value: { fact: "pet.birthday", date: iso } } : date.year === null ? { kind: "follow_up", slot: "year", partial: { month: date.month, day: date.day } } : { kind: "unclear" };
    },
    same: (stored, value) => value.fact !== "pet.birthday" || stored.value === value.date,
    section: () => ({ label: "pets", href: "/family" }),
  },
  noteFact("note.together", "brain", 30, "household", (subject) => amafMemoryKey("note.together", subject)),
  noteFact("note.festivals", "brain", 28, "household", (subject) => amafMemoryKey("note.festivals", subject)),
  noteFact("note.eat_out", "brain", 26, "household", (subject) => amafMemoryKey("note.eat_out", subject)),
  noteFact("note.mornings", "brain", 24, "household", (subject) => amafMemoryKey("note.mornings", subject)),
  noteFact("note.hobbies", "brain", 20, "member", (subject) => amafMemoryKey("note.hobbies", subject)),
];

export function factByKey(key: string): AmafFact | null {
  return AMAF_FACTS.find((fact) => fact.key === key) ?? null;
}

/**
 * Something the answer clashes with elsewhere on record, though it fills a
 * different field: an allergy to a food someone is on record as loving, a
 * like for a food on record as disliked, a family diet that a person's
 * favourite breaks. Said with the answer, never fixed on its own.
 */
export type AmafClash = { kind: "allergy_vs_like" | "like_vs_dislike" | "dislike_vs_like" | "diet_vs_like"; memberId: string | null; subject: string; preferenceId: string; updatedAt: string | null };

export function clashesFor(value: AmafValue, subject: AmafSubject, snapshot: AmafSnapshot): AmafClash[] {
  const has = (food: string, preference: string) => {
    const a = norm(food);
    const b = norm(preference);
    return a === b || ` ${b} `.includes(` ${a} `) || ` ${a} `.includes(` ${b} `);
  };
  const out: AmafClash[] = [];
  if (value.fact === "household.allergies") {
    for (const entry of value.entries) {
      for (const preference of snapshot.foodPreferences.filter((row) => row.kind === "preference" && (entry.memberId === null || row.memberId === entry.memberId))) {
        if (has(entry.food, preference.subject)) out.push({ kind: "allergy_vs_like", memberId: preference.memberId, subject: preference.subject, preferenceId: preference.id, updatedAt: preference.updatedAt });
      }
    }
  }
  if ((value.fact === "member.food_likes" || value.fact === "member.food_dislikes") && subject.kind === "person") {
    const other = value.fact === "member.food_likes" ? "dislike" : "preference";
    for (const food of value.subjects) {
      for (const preference of snapshot.foodPreferences.filter((row) => row.memberId === subject.id && row.kind === other)) {
        if (has(food, preference.subject)) out.push({ kind: value.fact === "member.food_likes" ? "like_vs_dislike" : "dislike_vs_like", memberId: subject.id, subject: preference.subject, preferenceId: preference.id, updatedAt: preference.updatedAt });
      }
    }
  }
  if (value.fact === "household.diet") {
    for (const preference of snapshot.foodPreferences.filter((row) => row.kind === "preference")) {
      if (dietClash(value.diet, { diet: dishDietOf({ ingredients: [preference.subject] }), ingredients: [preference.subject] })) {
        out.push({ kind: "diet_vs_like", memberId: preference.memberId, subject: preference.subject, preferenceId: preference.id, updatedAt: preference.updatedAt });
      }
    }
  }
  return out.slice(0, 3);
}
