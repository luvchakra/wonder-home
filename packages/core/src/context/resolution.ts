import { isUsable } from "./freshness";
import { isoDay, nameSimilarity, normalizeText, similarity, tokens, weekdayIndex } from "./normalize";
import type { HouseholdContextItem, PersonRef, PetRef, Resolution, ResolutionCandidate } from "./types";

/**
 * Who and what a household means (Wave 1 §6).
 *
 * One resolver for every surface — HomeTalk, HomeSend and HomeBrain all ask
 * here, so "Dad", "the helper" or "that bill" means the same thing wherever
 * it is said. Every answer is a set of candidates with a confidence, the
 * items that support it and the reasons in words, and the decision follows
 * four fixed rules:
 *
 *  - one strong candidate → resolved;
 *  - several plausible candidates → ask which;
 *  - only a weak candidate → leave it unresolved and ask ("did you mean…");
 *  - a consequential target is never selected below `CONSEQUENTIAL_AT`,
 *    however clear the margin.
 */

export const RESOLVE_AT = 0.75;
export const CONSEQUENTIAL_AT = 0.9;
export const PLAUSIBLE_AT = 0.5;
const MARGIN = 0.15;

export function decide<T>(
  candidates: ResolutionCandidate<T>[],
  options: { consequential?: boolean; noun: string; label: (entity: T) => string },
): Resolution<T> {
  const ranked = candidates.filter((candidate) => candidate.confidence > 0).sort((a, b) => b.confidence - a.confidence);
  const [top, second] = ranked;
  const threshold = options.consequential ? CONSEQUENTIAL_AT : RESOLVE_AT;

  if (top && top.confidence >= threshold && (!second || top.confidence - second.confidence >= MARGIN)) {
    return { candidates: ranked, selected: top.entity, ambiguous: false, question: null };
  }

  const plausible = ranked.filter((candidate) => candidate.confidence >= PLAUSIBLE_AT);
  if (plausible.length >= 2) {
    const names = plausible.slice(0, 4).map((candidate) => options.label(candidate.entity));
    return { candidates: ranked, selected: null, ambiguous: true, question: `Which ${options.noun} did you mean — ${joinOr(names)}?` };
  }

  if (top) {
    return { candidates: ranked, selected: null, ambiguous: false, question: `Did you mean ${options.label(top.entity)}?` };
  }
  return { candidates: [], selected: null, ambiguous: false, question: `I do not know which ${options.noun} you mean.` };
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** The household's words for a relationship, each to one canonical relation. */
const RELATION_WORDS: Record<string, readonly string[]> = {
  father: ["father", "dad", "daddy", "papa", "pa", "pappa", "pop", "abba", "appa", "baba"],
  mother: ["mother", "mum", "mom", "mummy", "mommy", "mama", "ma", "amma", "mumma"],
  son: ["son"],
  daughter: ["daughter"],
  grandmother: ["grandmother", "grandma", "granny", "nani", "dadi", "nana ji"],
  grandfather: ["grandfather", "grandpa", "grandad", "granddad", "nana", "dada", "dadu"],
  wife: ["wife"],
  husband: ["husband"],
  brother: ["brother", "bhai", "bhaiya"],
  sister: ["sister", "didi", "behen"],
  uncle: ["uncle", "chacha", "mama ji"],
  aunt: ["aunt", "aunty", "auntie", "chachi", "mami"],
};

const HELPER_WORDS = ["helper", "househelper", "house helper", "maid", "help", "bai", "cook", "driver", "nanny", "cleaner", "domestic help"];
const OLDER_WORDS = ["older one", "elder one", "eldest", "oldest", "big one", "elder", "older"];
const YOUNGER_WORDS = ["younger one", "youngest", "little one", "baby", "younger", "small one"];
const CHILD_WORDS = ["kid", "child", "the kid", "the child"];
const SELF_WORDS = ["me", "myself", "i", "self"];

export function canonicalRelation(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = normalizeText(value).replace(/^(?:my|our|the)\s+/, "");
  for (const [relation, spoken] of Object.entries(RELATION_WORDS)) {
    if (spoken.includes(clean)) return relation;
  }
  return null;
}

function cleanReference(reference: string): string {
  return normalizeText(reference)
    .replace(/^(?:my|our|the|your)\s+/, "")
    .trim();
}

function personOf(item: HouseholdContextItem): PersonRef {
  const memberType = item.attributes.memberType as PersonRef["memberType"];
  return { kind: memberType === "helper" ? "helper" : "family", memberId: item.entityId, displayName: String(item.attributes.displayName), memberType };
}

/** "Asmi", "asmi's", "Dad", "my daughter", "the older one", "the helper", "me". */
export function resolvePerson(
  reference: string,
  items: readonly HouseholdContextItem[],
  options: { viewerMemberId: string; consequential?: boolean },
): Resolution<PersonRef> {
  const people = items.filter((item) => item.entityType === "member");
  const said = cleanReference(reference);
  const candidates: ResolutionCandidate<PersonRef>[] = [];
  const push = (item: HouseholdContextItem, confidence: number, reason: string) => {
    const existing = candidates.find((candidate) => candidate.entity.memberId === item.entityId);
    if (existing) {
      if (confidence > existing.confidence) existing.confidence = confidence;
      existing.reasons.push(reason);
      return;
    }
    candidates.push({ entity: personOf(item), confidence, evidenceIds: [item.id], reasons: [reason] });
  };

  if (SELF_WORDS.includes(said)) {
    const self = people.find((item) => item.entityId === options.viewerMemberId);
    if (self) push(self, 0.99, "the person speaking");
    return decide(candidates, { ...options, noun: "person", label: (entity) => entity.displayName });
  }

  // Names first: a person's own name is the strongest signal there is.
  for (const item of people) {
    const display = String(item.attributes.displayName ?? "");
    const first = display.split(/\s+/)[0] ?? display;
    const nickname = typeof item.attributes.nickname === "string" ? item.attributes.nickname : null;
    if (normalizeText(display) === said) push(item, 0.98, "full name");
    else if (normalizeText(first) === said) push(item, 0.95, "first name");
    else if (nickname && normalizeText(nickname) === said) push(item, 0.95, "what the family calls them");
    else {
      const close = Math.max(nameSimilarity(first, said), nickname ? nameSimilarity(nickname, said) : 0);
      if (close > 0) push(item, Math.min(0.72, close * 0.85), "a name that is close, but not the same");
    }
  }

  // Relationship words: "Dad", "my daughter", "Nani".
  const relation = canonicalRelation(said);
  if (relation) {
    for (const item of people) {
      if (canonicalRelation(item.attributes.relationship as string | null) === relation) push(item, 0.9, `recorded as ${relation}`);
    }
    if (!candidates.length && (relation === "son" || relation === "daughter")) {
      // No relationship recorded: any child could be meant, and guessing a
      // child's gender from a name is exactly the guess this refuses to make.
      for (const item of people.filter((entry) => entry.attributes.memberType === "child")) push(item, 0.55, "a child, but no relationship is recorded");
    }
  }

  // "The older one", "the youngest", "the kid".
  const children = people.filter((item) => item.attributes.memberType === "child");
  const older = OLDER_WORDS.includes(said);
  const younger = YOUNGER_WORDS.includes(said);
  if (older || younger || CHILD_WORDS.includes(said)) {
    if (children.length === 1) push(children[0]!, 0.85, "the only child");
    else if (older || younger) {
      const dated = children.filter((item) => typeof item.attributes.dateOfBirth === "string");
      if (dated.length === children.length && dated.length > 1) {
        const sorted = [...dated].sort((a, b) => String(a.attributes.dateOfBirth).localeCompare(String(b.attributes.dateOfBirth)));
        const pick = older ? sorted[0]! : sorted[sorted.length - 1]!;
        push(pick, 0.88, older ? "the eldest child by date of birth" : "the youngest child by date of birth");
        for (const other of sorted.filter((item) => item !== pick)) push(other, 0.3, "another child");
      } else {
        for (const item of children) push(item, 0.55, "a child, but not every child has a date of birth recorded");
      }
    } else {
      for (const item of children) push(item, 0.55, "one of the children");
    }
  }

  // "The helper": only ever a househelper, never a family member.
  if (HELPER_WORDS.includes(said)) {
    const helpers = people.filter((item) => item.attributes.memberType === "helper");
    for (const item of helpers) {
      const occupation = normalizeText(String(item.attributes.occupation ?? ""));
      if (occupation && occupation.includes(said)) push(item, 0.93, `works as ${occupation}`);
      else push(item, helpers.length === 1 ? 0.9 : 0.6, helpers.length === 1 ? "the household's helper" : "one of the household's helpers");
    }
  }

  return decide(candidates, { ...options, noun: "person", label: (entity) => entity.displayName });
}

// ---------------------------------------------------------------------------
// Pets
// ---------------------------------------------------------------------------

/** "Bruno", "Bruno's", "the dog", "our doggy", "the pet". */
export function resolvePet(reference: string, items: readonly HouseholdContextItem[], options: { consequential?: boolean } = {}): Resolution<PetRef> {
  const pets = items.filter((item) => item.entityType === "pet");
  const said = cleanReference(reference);
  const candidates: ResolutionCandidate<PetRef>[] = [];
  const petOf = (item: HouseholdContextItem): PetRef => ({ kind: "pet", petId: item.entityId, name: String(item.attributes.name), species: String(item.attributes.species) });

  for (const item of pets) {
    const petName = String(item.attributes.name);
    if (normalizeText(petName) === said) {
      candidates.push({ entity: petOf(item), confidence: 0.97, evidenceIds: [item.id], reasons: ["the pet's name"] });
      continue;
    }
    const close = nameSimilarity(petName, said);
    if (close > 0) {
      candidates.push({ entity: petOf(item), confidence: Math.min(0.72, close * 0.85), evidenceIds: [item.id], reasons: ["a name that is close, but not the same"] });
      continue;
    }
    const speciesWords = item.aliases.filter((alias) => normalizeText(alias) !== normalizeText(petName)).map(normalizeText);
    if (speciesWords.includes(said) || speciesWords.includes(said.replace(/s$/, ""))) {
      const sameSpecies = pets.filter((other) => other.attributes.species === item.attributes.species).length;
      candidates.push({ entity: petOf(item), confidence: sameSpecies === 1 ? 0.9 : 0.6, evidenceIds: [item.id], reasons: [sameSpecies === 1 ? `the household's only ${item.attributes.species}` : `one of the household's ${item.attributes.species}s`] });
    } else if (said === "pet") {
      candidates.push({ entity: petOf(item), confidence: pets.length === 1 ? 0.85 : 0.55, evidenceIds: [item.id], reasons: [pets.length === 1 ? "the household's only pet" : "one of the household's pets"] });
    }
  }

  return decide(candidates, { ...options, noun: "pet", label: (entity) => entity.name });
}

// ---------------------------------------------------------------------------
// Things: "that bill", "the science project", "the same milk", "Friday's appointment"
// ---------------------------------------------------------------------------

/** The nouns a household uses for each kind of thing, and the items they mean. */
const NOUN_TYPES: readonly { words: readonly string[]; types: readonly string[]; kind?: string; noun: string }[] = [
  { words: ["bill", "bills", "payment", "invoice", "fee", "fees", "emi", "rent"], types: ["bill"], noun: "bill" },
  { words: ["appointment", "appointments"], types: ["health_appointment", "event"], noun: "appointment" },
  { words: ["checkup", "check up", "check-up"], types: ["health_checkup"], noun: "checkup" },
  { words: ["project"], types: ["school_item"], kind: "project", noun: "project" },
  { words: ["homework"], types: ["school_item"], kind: "homework", noun: "homework" },
  { words: ["worksheet"], types: ["school_item"], kind: "worksheet", noun: "worksheet" },
  { words: ["exam", "test", "quiz"], types: ["school_item"], kind: "exam", noun: "exam" },
  { words: ["assignment", "schoolwork", "school work"], types: ["school_item"], noun: "school work" },
  { words: ["event", "party", "match", "class", "lesson", "exhibition", "function"], types: ["event"], noun: "event" },
  { words: ["meal", "dinner", "lunch", "breakfast", "snack"], types: ["meal"], noun: "meal" },
  { words: ["order", "delivery"], types: ["order"], noun: "order" },
  { words: ["request", "repair", "service"], types: ["service_request"], noun: "service request" },
  { words: ["notice", "notification", "reminder"], types: ["notification"], noun: "notice" },
  { words: ["issue", "note", "symptom"], types: ["health_issue"], noun: "health note" },
];

const ANAPHORA = ["that", "this", "it", "same", "those", "the same", "the last one", "last one", "the one"];

export type ReferenceContext = {
  timezone: string;
  now: Date;
  /** HomeTalk's pending proposal, when one is waiting for a yes. */
  pending?: { actionType: string; outcomeKey?: string | null; parameters?: Record<string, unknown> } | null;
  /** Items mentioned recently in this conversation, most recent first. */
  recentItemIds?: readonly string[];
  /** Restrict to these entity types — `resolveEntity`'s domain filter. */
  entityTypes?: readonly string[];
  consequential?: boolean;
};

type ParsedReference = {
  anaphoric: boolean;
  noun: (typeof NOUN_TYPES)[number] | null;
  weekday: number | null;
  day: string | null;
  descriptor: string;
};

function parseReference(reference: string, context: ReferenceContext): ParsedReference {
  const text = normalizeText(reference);
  const words = text.split(" ").filter(Boolean);
  const anaphoric = ANAPHORA.some((word) => text === word || text.startsWith(`${word} `) || text.includes(` ${word} `) || text.endsWith(` ${word}`));

  let weekday: number | null = null;
  let day: string | null = null;
  const kept: string[] = [];
  let noun: ParsedReference["noun"] = null;

  for (const word of words) {
    const index = weekdayIndex(word);
    if (index !== null) {
      weekday = index;
      continue;
    }
    if (word === "today" || word === "tonight") {
      day = isoDay(context.now, context.timezone);
      continue;
    }
    if (word === "tomorrow") {
      day = isoDay(new Date(context.now.getTime() + 86_400_000), context.timezone);
      continue;
    }
    if (word === "yesterday") {
      day = isoDay(new Date(context.now.getTime() - 86_400_000), context.timezone);
      continue;
    }
    const matched = NOUN_TYPES.find((entry) => entry.words.includes(word));
    if (matched && !noun) {
      noun = matched;
      continue;
    }
    if (["that", "this", "it", "same", "those", "one", "last", "the", "my", "our", "do", "pay", "s"].includes(word)) continue;
    kept.push(word);
  }

  return { anaphoric, noun, weekday, day, descriptor: kept.join(" ") };
}

function describeItem(item: HouseholdContextItem): string {
  const title = typeof item.attributes.title === "string" ? item.attributes.title : item.aliases[0] ?? item.entityType;
  const payee = typeof item.attributes.payee === "string" && item.attributes.payee !== title ? ` (${item.attributes.payee})` : "";
  const date = typeof item.attributes.date === "string" ? `, ${item.attributes.date}` : "";
  return `${title}${payee}${date}`;
}

/** A thing the household referred to, among what this member may see. */
export function resolveReference(reference: string, items: readonly HouseholdContextItem[], context: ReferenceContext): Resolution<HouseholdContextItem> {
  const parsed = parseReference(reference, context);
  const recent = context.recentItemIds ?? [];
  const pendingText = context.pending
    ? [context.pending.outcomeKey?.replace(/[._]+/g, " "), ...Object.values(context.pending.parameters ?? {}).filter((value): value is string => typeof value === "string")].filter(Boolean).join(" ")
    : "";

  // "Do that" / "that one", with nothing else to go on: the proposal just made, or the last thing mentioned.
  if (!parsed.noun && !parsed.descriptor && parsed.anaphoric && parsed.weekday === null && !parsed.day) {
    const candidates: ResolutionCandidate<HouseholdContextItem>[] = [];
    const waiting = items.find((item) => item.entityType === "proposal" && item.attributes.status === "proposed");
    if (waiting) candidates.push({ entity: waiting, confidence: 0.9, evidenceIds: [waiting.id], reasons: ["the proposal waiting for a yes"] });
    else {
      const last = recent.map((id) => items.find((item) => item.id === id)).find(Boolean);
      if (last) candidates.push({ entity: last, confidence: 0.78, evidenceIds: [last.id], reasons: ["the last thing mentioned"] });
    }
    return decide(candidates, { consequential: context.consequential, noun: "thing", label: describeItem });
  }

  const allowed = context.entityTypes ? new Set(context.entityTypes) : null;
  const pool = items.filter((item) => isUsable(item) && (!allowed || allowed.has(item.entityType)) && item.entityType !== "state" && item.entityType !== "attention");
  const typed = parsed.noun ? pool.filter((item) => parsed.noun!.types.includes(item.entityType)) : pool;

  const candidates: ResolutionCandidate<HouseholdContextItem>[] = [];
  for (const item of typed) {
    const reasons: string[] = [];
    let score: number;

    if (parsed.descriptor) {
      const names = [typeof item.attributes.title === "string" ? item.attributes.title : null, typeof item.attributes.subject === "string" ? item.attributes.subject : null, ...item.aliases].filter((value): value is string => Boolean(value));
      const best = Math.max(0, ...names.map((name) => similarity(parsed.descriptor, name)));
      if (best === 0) {
        if (!parsed.noun) continue;
        score = 0.15;
      } else {
        score = 0.4 + 0.5 * best;
        reasons.push(best >= 0.95 ? `named "${parsed.descriptor}"` : `close to "${parsed.descriptor}"`);
      }
    } else {
      score = 0.5;
      reasons.push(`a ${parsed.noun?.noun ?? "thing"} on record`);
    }

    if (parsed.noun?.kind) {
      if (item.attributes.kind === parsed.noun.kind) score += 0.05;
      else if (item.entityType === "school_item") score -= 0.2;
    }
    if (parsed.noun?.noun === "appointment" && item.entityType === "event" && item.attributes.kind !== "appointment") score -= 0.3;

    const date = typeof item.attributes.date === "string" ? item.attributes.date : null;
    if (parsed.weekday !== null) {
      const dayMatches = date !== null && new Date(`${date}T12:00:00Z`).getUTCDay() === parsed.weekday;
      if (dayMatches) {
        score += 0.35;
        reasons.push("on that day");
      } else score -= 0.3;
    }
    if (parsed.day) {
      if (date === parsed.day) {
        score += 0.35;
        reasons.push("on that day");
      } else score -= 0.3;
    }

    if (pendingText && similarity(pendingText, describeItem(item)) >= 0.5) {
      score += 0.4;
      reasons.push("the one just proposed");
    }
    const mentioned = recent.indexOf(item.id);
    if (mentioned >= 0) {
      score += parsed.anaphoric ? 0.3 / (mentioned + 1) : 0.1 / (mentioned + 1);
      reasons.push("mentioned just now");
    }
    if (item.tier <= 2 && item.freshness === "current") score += 0.02;

    candidates.push({ entity: item, confidence: Math.max(0, Math.min(0.99, score)), evidenceIds: [item.id], reasons });
  }

  // "That bill" with exactly one bill on record is that bill.
  const plausible = candidates.filter((candidate) => candidate.confidence >= 0.3);
  if (plausible.length === 1 && parsed.noun) {
    plausible[0]!.confidence = Math.max(plausible[0]!.confidence, 0.82);
    plausible[0]!.reasons.push(`the only ${parsed.noun.noun} that fits`);
  }
  // "The same milk": among several, the one bought most recently.
  if (parsed.anaphoric && candidates.length > 1) {
    const bought = candidates.filter((candidate) => typeof candidate.entity.attributes.lastPurchasedOn === "string");
    const latest = bought.sort((a, b) => String(b.entity.attributes.lastPurchasedOn).localeCompare(String(a.entity.attributes.lastPurchasedOn)))[0];
    if (latest) {
      latest.confidence = Math.min(0.99, latest.confidence + 0.2);
      latest.reasons.push("the one bought most recently");
    }
  }

  return decide(candidates, { consequential: context.consequential, noun: parsed.noun?.noun ?? "one", label: describeItem });
}

/** `resolveReference`, restricted to one kind of thing. */
export function resolveEntity(
  reference: string,
  items: readonly HouseholdContextItem[],
  context: ReferenceContext & { entityTypes: readonly string[] },
): Resolution<HouseholdContextItem> {
  return resolveReference(reference, items, context);
}

/** Words in a question that name a person, pet or thing in this household. */
export function mentionedItems(question: string, items: readonly HouseholdContextItem[]): HouseholdContextItem[] {
  const said = new Set(tokens(question));
  const text = ` ${normalizeText(question)} `;
  return items.filter((item) =>
    item.aliases.some((alias) => {
      const clean = normalizeText(alias);
      if (clean.length < 3) return false;
      if (clean.includes(" ")) return text.includes(` ${clean} `);
      return said.has(clean) || said.has(clean.replace(/s$/, "")) || text.includes(` ${clean} `);
    }),
  );
}

function joinOr(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}
