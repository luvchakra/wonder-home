import { isReviewable, parsePreference, type MemoryStatus } from "../../conversation/memory";
import { neverFades, salienceOf, textOfMemory } from "./salience";
import { editDistance, normaliseThing, partsOfThing } from "./similarity";

/**
 * A night's sleep, planned (HomeBrain Sleep, the hippocampus replaying the
 * day into what is already known). Pure: given every memory a household
 * keeps and its people, it says what should change, and nothing changes
 * until `run.ts` applies it — each change recorded with what it was before,
 * so it can be undone.
 *
 * What it does, in order:
 * 1. A memory that says nothing is let go ("expired", empty).
 * 2. Every memory's importance is tagged again (salience).
 * 3. A memory about a time that has passed ("this week", "tomorrow") expires.
 * 4. Each memory is read into atoms — one person, one stance, one thing:
 *    "Kunal likes North Indian food; Upasna likes Italian and French food"
 *    is three atoms. A name said slightly differently ("Upasna") is the
 *    family member it plainly means; two who could fit are left alone.
 * 5. The same atom kept twice is merged into the best-kept one.
 * 6. A memory of several atoms is split, and the parts already known are not
 *    written again.
 * 7. The same thing liked and disliked by the same person is a conflict — the
 *    one thing that goes to a person to decide.
 * 8. Things that mean the same ("pink pasta" and "pasta in pink sauce") are
 *    merged when meaning is near-certain, and asked of a model when close.
 * 9. What has not been used in a long while rests; what was used again wakes.
 */

export type SleepMemory = {
  id: string;
  scope: "household" | "member";
  memberId: string | null;
  category: string;
  key: string;
  value: unknown;
  status: Extract<MemoryStatus, "learned" | "confirmed">;
  tier: "active" | "resting" | "expired";
  salience: number;
  validUntil: string | null;
  sourceType: string;
  sourceId: string | null;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  recallCount: number;
  lastRecalledAt: string | null;
};

export type SleepPerson = { id: string; displayName: string; nickname?: string | null; relationship?: string | null; memberType: string };

export type Stance = "likes" | "dislikes" | "allergic" | "okay_with" | "avoids" | "prefers";

export type Atom = { memberId: string | null; subject: string; stance: Stance; object: string; thing: string; parts?: Atom[] };

export type NewMemory = { memberId: string | null; key: string; statement: string; subject: string; stance: Stance; object: string };

export type SleepOperation =
  | { kind: "merged"; keep: string; drop: string[]; statement: string; byModel: boolean }
  | { kind: "split"; drop: string; create: NewMemory[]; known: string[]; statement: string; byModel: boolean }
  | { kind: "reattributed"; id: string; memberId: string; statement: string }
  | { kind: "expired"; id: string; reason: "empty" | "past"; statement: string }
  | { kind: "rested"; id: string; statement: string }
  | { kind: "woke"; id: string }
  | { kind: "conflict"; ids: [string, string]; statement: string }
  | { kind: "salience"; id: string; salience: number }
  | { kind: "valid_until"; id: string; validUntil: string };

export type SleepPlan = {
  operations: SleepOperation[];
  /** Pairs close in meaning, for a model to judge on a later pass (`judged`). */
  borderline: { a: string; b: string; similarity: number }[];
  /** Clauses the rules could not read, for a model to read on a later pass (`readByModel`). */
  unread: { memoryId: string; clause: string }[];
};

export type PlanOptions = {
  /** Today on the household's clock. */
  today: string;
  /** The household-local day an instant falls on. */
  localDate: (iso: string) => string;
  /** Meaning similarity of two memories (cosine of their embeddings), or null when either has none. */
  similarity?: (a: string, b: string) => number | null;
  /** A model's verdicts on borderline pairs, keyed `a|b` (sorted). */
  judged?: ReadonlyMap<string, boolean>;
  /** A model's readings of clauses the rules could not read, keyed by the clause. */
  readByModel?: ReadonlyMap<string, { subject: string; stance: Stance; object: string }[]>;
};

/** Unused for this long, an everyday memory rests. */
export const REST_AFTER_DAYS = 90;
/**
 * Near-identical: merged by rule. Embedding models score merely related
 * things high ("sushi" and "sushi rolls" came out above 0.95 on a real
 * night), so anything short of this is a model's call, never the rule's.
 */
export const SAME_MEANING = 0.985;
/** Close: a model decides. */
export const CLOSE_MEANING = 0.86;

const POSITIVE = new Set<Stance>(["likes", "prefers", "okay_with"]);
const NEGATIVE = new Set<Stance>(["dislikes", "avoids", "allergic"]);
const VERB: Record<Stance, string> = { likes: "likes", dislikes: "doesn't like", allergic: "is allergic to", okay_with: "is okay with", avoids: "avoids", prefers: "prefers" };
const DAY_MS = 86_400_000;

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function statementOf(memory: Pick<SleepMemory, "key" | "value">): string {
  const text = textOfMemory(memory.value).trim() || memory.key.replace(/[._]+/g, " ");
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence.slice(0, -1) : sentence;
}

/** The clauses of a statement: "A likes x; B likes y" → two. */
export function clausesOf(statement: string): string[] {
  return statement
    .split(/\s*;\s*|\.\s+(?=[A-Z])|\s+(?:,\s*)?(?:and|but|while|whereas)\s+(?=[A-Z][a-z]+\s+(?:really\s+|still\s+)?(?:likes?|loves?|prefers?|enjoys?|hates?|dislikes?|doesn'?t|does not|can'?t|is|avoids?)\b)/)
    .map((clause) => clause.trim().replace(/[.!]+$/, ""))
    .filter(Boolean);
}

/** The family member a name means: exactly, by first name, nickname or relationship; or one letter off, when only one member is. */
export function resolvePerson(name: string, people: readonly SleepPerson[]): SleepPerson | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const namesOf = (person: SleepPerson) =>
    [person.displayName, person.displayName.split(/\s+/)[0], person.nickname, person.relationship].filter((entry): entry is string => Boolean(entry)).map((entry) => entry.toLowerCase());
  const exact = people.filter((person) => namesOf(person).includes(wanted));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;
  if (wanted.length < 4) return null;
  const close = people.filter((person) => namesOf(person).some((entry) => entry.length >= 4 && editDistance(entry, wanted) <= 1));
  return close.length === 1 ? close[0]! : null;
}

function atomsOf(memory: SleepMemory, people: readonly SleepPerson[], options: PlanOptions): { atoms: Atom[]; unread: string[] } {
  const clauses = clausesOf(statementOf(memory));
  const atoms: Atom[] = [];
  const unread: string[] = [];
  for (const clause of clauses) {
    const readings: { subject: string; stance: Stance; object: string }[] = [];
    const parsed = parsePreference(clause);
    if (parsed) readings.push({ subject: parsed.subject, stance: parsed.stance as Stance, object: parsed.object });
    else if (options.readByModel?.has(clause)) readings.push(...options.readByModel.get(clause)!);
    else {
      unread.push(clause);
      continue;
    }
    for (const reading of readings) {
      const person = resolvePerson(reading.subject, people);
      // One clause in a member's own memory with a name that is nobody else's: it is theirs.
      const memberId = person?.id ?? (clauses.length === 1 && memory.scope === "member" ? memory.memberId : null);
      const subject = person ? person.displayName.split(/\s+/)[0]! : reading.subject;
      // "pasta and pizza" stays one thing unless both are already known on their own ("mac and cheese" is one dish).
      const parts = partsOfThing(reading.object).map((object) => ({ memberId, subject, stance: reading.stance, object, thing: normaliseThing(object) }));
      atoms.push({ memberId, subject, stance: reading.stance, object: reading.object, thing: normaliseThing(reading.object), ...(parts.length > 0 ? { parts } : {}) });
    }
  }
  return { atoms, unread };
}

const atomKey = (atom: Pick<Atom, "memberId" | "stance" | "thing">) => `${atom.memberId ?? "household"}|${atom.stance}|${atom.thing}`;
const sentenceOf = (atom: Atom) => `${atom.subject} ${VERB[atom.stance]} ${atom.object}`;

/** Which of several memories saying the same thing to keep: a member's own, keyed as one preference, the most recently said. */
function bestOf(memories: readonly SleepMemory[], atom: Atom): SleepMemory {
  return [...memories].sort((a, b) => {
    const score = (memory: SleepMemory) =>
      (memory.memberId === atom.memberId && atom.memberId ? 4 : 0) + (memory.key.startsWith("pref.") ? 2 : 0) + (memory.status === "confirmed" ? 1 : 0);
    return score(b) - score(a) || b.updatedAt.localeCompare(a.updatedAt);
  })[0]!;
}

/** When a statement about a time stops being true ("this week", "tomorrow", "today"), from the day it was said. */
export function validUntilOf(statement: string, saidOn: string): string | null {
  const text = statement.toLowerCase();
  const day = (offset: number) => new Date(Date.parse(`${saidOn}T12:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
  const weekday = new Date(`${saidOn}T12:00:00Z`).getUTCDay();
  const toSunday = (7 - weekday) % 7;
  if (/\b(?:today|tonight|this (?:morning|afternoon|evening))\b/.test(text)) return day(0);
  if (/\btomorrow\b/.test(text)) return day(1);
  if (/\bthis week(?:end)?\b/.test(text)) return day(toSunday);
  if (/\bnext week\b/.test(text)) return day(toSunday + 7);
  if (/\bthis month\b/.test(text)) {
    const [year, month] = saidOn.split("-").map(Number) as [number, number];
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  }
  return null;
}

export function planSleep(memories: readonly SleepMemory[], people: readonly SleepPerson[], options: PlanOptions): SleepPlan {
  const operations: SleepOperation[] = [];
  const borderline: SleepPlan["borderline"] = [];
  const unread: SleepPlan["unread"] = [];
  const consumed = new Set<string>();
  const childIds = new Set(people.filter((person) => person.memberType === "child").map((person) => person.id));
  const live = memories.filter((memory) => memory.tier !== "expired");

  // 1–3: empty, importance, time.
  for (const memory of live) {
    if (!isReviewable(memory)) {
      operations.push({ kind: "expired", id: memory.id, reason: "empty", statement: memory.key.replace(/[._]+/g, " ") });
      consumed.add(memory.id);
      continue;
    }
    const salience = salienceOf(memory, { isChild: memory.memberId !== null && childIds.has(memory.memberId) });
    if (salience !== memory.salience) operations.push({ kind: "salience", id: memory.id, salience });
    const validUntil = memory.validUntil ?? validUntilOf(statementOf(memory), options.localDate(memory.createdAt));
    if (validUntil && !memory.validUntil) operations.push({ kind: "valid_until", id: memory.id, validUntil });
    if (validUntil && validUntil < options.today && !neverFades(salience)) {
      operations.push({ kind: "expired", id: memory.id, reason: "past", statement: statementOf(memory) });
      consumed.add(memory.id);
    }
  }

  // 4: atoms.
  const read = new Map<string, Atom[]>();
  for (const memory of live) {
    if (consumed.has(memory.id)) continue;
    const { atoms, unread: notRead } = atomsOf(memory, people, options);
    for (const clause of notRead) unread.push({ memoryId: memory.id, clause });
    // A memory with a clause nobody could read is left exactly as it is.
    if (notRead.length === 0 && atoms.length > 0) read.set(memory.id, atoms);
  }
  const byId = new Map(live.map((memory) => [memory.id, memory]));

  // A thing made of things already known on their own is those things.
  const simpleKeys = new Set([...read.values()].filter((atoms) => atoms.length === 1).map((atoms) => atomKey(atoms[0]!)));
  for (const [id, atoms] of read) {
    read.set(id, atoms.flatMap((atom) => (atom.parts && atom.parts.every((part) => simpleKeys.has(atomKey(part))) ? atom.parts : [atom])));
  }

  // 5: the same single atom kept more than once.
  const singles = new Map<string, SleepMemory[]>();
  for (const [id, atoms] of read) {
    if (atoms.length !== 1) continue;
    const key = atomKey(atoms[0]!);
    singles.set(key, [...(singles.get(key) ?? []), byId.get(id)!]);
  }
  const known = new Map<string, SleepMemory>();
  for (const [key, group] of singles) {
    const atom = read.get(group[0]!.id)![0]!;
    const keep = bestOf(group, atom);
    known.set(key, keep);
    const drop = group.filter((memory) => memory.id !== keep.id).map((memory) => memory.id);
    if (drop.length > 0) {
      operations.push({ kind: "merged", keep: keep.id, drop, statement: statementOf(keep), byModel: false });
      for (const id of drop) consumed.add(id);
    }
    // Kept as a household note about a family member: it is theirs.
    if (atom.memberId && keep.memberId !== atom.memberId) {
      operations.push({ kind: "reattributed", id: keep.id, memberId: atom.memberId, statement: statementOf(keep) });
    }
  }

  // 6: several atoms in one memory.
  for (const [id, atoms] of read) {
    if (atoms.length < 2 || consumed.has(id)) continue;
    const create: NewMemory[] = [];
    const knownStatements: string[] = [];
    const seen = new Set<string>();
    for (const atom of atoms) {
      const key = atomKey(atom);
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = known.get(key);
      if (existing) {
        knownStatements.push(statementOf(existing));
        continue;
      }
      const statement = sentenceOf(atom);
      const parsed = parsePreference(statement);
      if (!parsed) continue;
      create.push({ memberId: atom.memberId, key: parsed.key, statement, subject: atom.subject, stance: atom.stance, object: atom.object });
    }
    const memory = byId.get(id)!;
    operations.push({ kind: "split", drop: id, create, known: knownStatements, statement: statementOf(memory), byModel: clausesOf(statementOf(memory)).some((clause) => options.readByModel?.has(clause)) });
    consumed.add(id);
  }

  // 7: liked and disliked by the same person.
  const kept = [...known.values()].filter((memory) => !consumed.has(memory.id));
  const atomOf = (memory: SleepMemory) => read.get(memory.id)![0]!;
  const flagged = new Set<string>();
  for (const a of kept) {
    for (const b of kept) {
      if (a.id >= b.id) continue;
      const left = atomOf(a);
      const right = atomOf(b);
      if (left.memberId !== right.memberId || left.thing !== right.thing) continue;
      const opposite = (POSITIVE.has(left.stance) && NEGATIVE.has(right.stance)) || (NEGATIVE.has(left.stance) && POSITIVE.has(right.stance));
      if (!opposite || flagged.has(pairKey(a.id, b.id))) continue;
      flagged.add(pairKey(a.id, b.id));
      operations.push({ kind: "conflict", ids: [a.id, b.id], statement: `${statementOf(a)} — ${statementOf(b)}` });
    }
  }

  // 8: the same thing in other words.
  if (options.similarity) {
    const merged = new Set<string>();
    for (const a of kept) {
      for (const b of kept) {
        if (a.id >= b.id || merged.has(a.id) || merged.has(b.id)) continue;
        const left = atomOf(a);
        const right = atomOf(b);
        if (left.memberId !== right.memberId || left.thing === right.thing) continue;
        const samePolarity = (POSITIVE.has(left.stance) && POSITIVE.has(right.stance)) || (NEGATIVE.has(left.stance) && NEGATIVE.has(right.stance));
        if (!samePolarity) continue;
        const similarity = options.similarity(a.id, b.id);
        if (similarity === null || similarity < CLOSE_MEANING) continue;
        const verdict = options.judged?.get(pairKey(a.id, b.id));
        if (similarity < SAME_MEANING && verdict === undefined) {
          borderline.push({ a: a.id, b: b.id, similarity });
          continue;
        }
        if (verdict === false) continue;
        const [keep, drop] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
        operations.push({ kind: "merged", keep: keep.id, drop: [drop.id], statement: `${statementOf(keep)} (also said as "${statementOf(drop)}")`, byModel: verdict === true });
        merged.add(drop.id);
        consumed.add(drop.id);
      }
    }
  }

  // 9: rest and wake.
  const now = Date.parse(`${options.today}T12:00:00Z`);
  for (const memory of live) {
    if (consumed.has(memory.id)) continue;
    const salience = salienceOf(memory, { isChild: memory.memberId !== null && childIds.has(memory.memberId) });
    if (memory.tier === "resting") {
      if (memory.lastRecalledAt && memory.lastRecalledAt > memory.updatedAt) operations.push({ kind: "woke", id: memory.id });
      continue;
    }
    if (salience > 1 || memory.status !== "confirmed") continue;
    const lastUsed = [memory.lastRecalledAt, memory.updatedAt].filter((entry): entry is string => Boolean(entry)).sort().pop()!;
    if (now - Date.parse(lastUsed) > REST_AFTER_DAYS * DAY_MS) operations.push({ kind: "rested", id: memory.id, statement: statementOf(memory) });
  }

  return { operations, borderline, unread };
}
