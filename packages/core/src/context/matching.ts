import { daysBetween, extraTokens, isoDay, similarity, tokens } from "./normalize";
import type { HouseholdContextItem, IncomingFact, MatchResult, MatchVerdict } from "./types";

/**
 * Is this new, or is it something the household already has? (Wave 1 §7)
 *
 * Every fact arriving — a HomeSend photo of a bill, "Asmi's science
 * exhibition is Saturday" said to HomeTalk, a grocery added by hand — is
 * checked against what is already known and given one verdict:
 *
 *   exact_match           the same thing, already recorded
 *   likely_duplicate      almost certainly the same thing again
 *   likely_update         the same thing, with newer details
 *   related_but_different same family of thing, not the same one
 *   contradiction         disagrees with a record updated after it was captured
 *   no_match              nothing like it is known
 *
 * The one rule that is not about similarity: old source content never
 * silently overrides a newer authoritative record. When an incoming fact
 * disagrees with a record that was updated after the source was captured,
 * it is a contradiction to surface, not an update to apply — and even a
 * genuine update is only ever a candidate a person confirms.
 */

/** Words that make a different product, not a different name for the same one. */
const VARIANT_WORDS = new Set([
  "almond", "soy", "soya", "oat", "coconut", "rice", "skimmed", "skim", "toned", "double", "lactose", "low", "fat", "free",
  "brown", "white", "whole", "wheat", "multigrain", "gluten", "organic", "sugar", "diet", "decaf", "baby", "kids",
  "chocolate", "strawberry", "vanilla", "mango", "flavoured", "flavored", "salted", "unsalted", "sweet", "spicy",
  "frozen", "powder", "powdered", "condensed",
]);

/**
 * Different names a household gives the same kind of occasion. Kept small and
 * explicit, like `VARIANT_WORDS`: each line is one thing a school, a parent
 * and a forwarded notice all call by a different name — "PTM", "parent
 * meeting", "school meeting" — not a way to make every two titles alike.
 * Two titles on one line are nearly the same name; the date, the person and
 * the household's own confirmation still decide the rest.
 */
const SAME_THING_NAMES: readonly (readonly string[])[] = [
  ["parent teacher meeting", "parent teacher conference", "parent meeting", "school meeting", "teacher meeting", "ptm", "pta meeting", "pt meeting"],
  ["sport day", "sport meet", "athletic meet"],
  ["annual day", "annual function"],
];

/**
 * Words that name a part of an occasion rather than the occasion itself: the
 * Annual Day rehearsal is not the Annual Day, nor is its fee or its
 * registration. Two titles that differ by one of these are never "another
 * name for the same thing".
 */
const PART_WORDS = new Set(["rehearsal", "practice", "practise", "preparation", "prep", "audition", "trial", "fee", "contribution", "registration", "form", "costume"]);

const partsOf = (value: string) => tokens(value).filter((word) => PART_WORDS.has(word)).sort().join(" ");

function sameThingByName(left: string, right: string): boolean {
  if (partsOf(left) !== partsOf(right)) return false;
  const phrase = (value: string) => ` ${tokens(value).join(" ")} `;
  const a = phrase(left);
  const b = phrase(right);
  return SAME_THING_NAMES.some((names) => {
    const forms = names.map(phrase);
    return forms.some((form) => a.includes(form)) && forms.some((form) => b.includes(form));
  });
}

/** Kinds of thing that recur: two with different dates are two occurrences, not an update. */
const RECURRING_DOMAINS = new Set(["bills", "calendar", "meals", "school"]);
const UPDATE_WINDOW_DAYS = 14;

type Comparison = {
  item: HouseholdContextItem;
  titleSimilarity: number;
  /** Whether the two are known names for the same kind of occasion ("PTM" and "parent-teacher meeting"). */
  sameThing: boolean;
  /** Similarity once variety words are set aside: "almond milk" against "Amul Milk" is still milk. */
  coreSimilarity: number;
  sameSubject: boolean | null;
  variant: boolean;
  dateDelta: number | null;
  amount: "same" | "different" | "unknown";
  payeeMatches: boolean;
};

function titlesOf(item: HouseholdContextItem): string[] {
  const title = typeof item.attributes.title === "string" ? item.attributes.title : null;
  return [title, ...item.aliases].filter((value): value is string => Boolean(value));
}

/**
 * How alike a title is to one of a record's other names. An alias the
 * incoming title merely contains is usually the record's category
 * ("homework", "school event"), not its name: "Science homework" contains
 * "homework" and is still not "Maths homework". So containment only counts
 * one way — the incoming title inside the alias ("Maths" in "Maths
 * homework") — and otherwise it is plain word overlap.
 */
function aliasSimilarity(incoming: string, alias: string): number {
  const mine = new Set(tokens(incoming));
  const theirs = new Set(tokens(alias));
  if (mine.size === 0 || theirs.size === 0) return 0;
  if ([...mine].every((word) => theirs.has(word))) return similarity(incoming, alias);
  let shared = 0;
  for (const word of mine) if (theirs.has(word)) shared += 1;
  return shared / (mine.size + theirs.size - shared);
}

function compare(incoming: IncomingFact, item: HouseholdContextItem, timezone: string): Comparison {
  const titles = titlesOf(item);
  const ownTitle = typeof item.attributes.title === "string" ? item.attributes.title : null;
  const titleSimilarity = Math.max(0, ...(ownTitle ? [similarity(incoming.title, ownTitle)] : []), ...item.aliases.map((alias) => aliasSimilarity(incoming.title, alias)));
  const sameThing = titles.some((title) => sameThingByName(incoming.title, title));
  const primary = typeof item.attributes.title === "string" ? item.attributes.title : (titles[0] ?? "");
  const variant = [...extraTokens(incoming.title, primary), ...extraTokens(primary, incoming.title)].some((word) => VARIANT_WORDS.has(word));
  const core = (title: string) => tokens(title).filter((word) => !VARIANT_WORDS.has(word)).join(" ");
  const coreSimilarity = variant ? Math.max(0, ...titles.map((title) => similarity(core(incoming.title), core(title)))) : titleSimilarity;

  const sameSubject = incoming.subjectMemberId && item.subjectMemberIds.length > 0 ? item.subjectMemberIds.includes(incoming.subjectMemberId) : null;

  const theirDate = typeof item.attributes.date === "string" ? item.attributes.date : null;
  const dateDelta = incoming.date && theirDate ? Math.abs(daysBetween(isoDay(incoming.date, timezone), theirDate)) : null;

  const theirAmount = typeof item.attributes.amountMinor === "number" ? item.attributes.amountMinor : null;
  const amount = incoming.amountMinor != null && theirAmount != null ? (incoming.amountMinor === theirAmount ? "same" : "different") : "unknown";

  const incomingPayee = incoming.attributes?.payee;
  const payeeMatches = typeof incomingPayee === "string" && typeof item.attributes.payee === "string" && similarity(incomingPayee, item.attributes.payee) >= 0.8;

  return { item, titleSimilarity, sameThing, coreSimilarity, sameSubject, variant, dateDelta, amount, payeeMatches };
}

/**
 * Whether the record was written after the source was captured. Only real
 * timestamps count: a row with no time of its own carries the read time, and
 * treating that as "newer" would turn every update into a contradiction. When
 * either time is unknown the answer is no — the verdict is then an update,
 * which still waits for a person's confirmation.
 */
function recordIsNewerThanSource(item: HouseholdContextItem, incoming: IncomingFact): boolean {
  if (!incoming.capturedAt || !item.source.capturedAt) return false;
  const recordAt = Date.parse(item.source.capturedAt);
  const sourceAt = Date.parse(incoming.capturedAt);
  if (Number.isNaN(recordAt) || Number.isNaN(sourceAt)) return false;
  return recordAt > sourceAt;
}

function verdictFor(comparison: Comparison, incoming: IncomingFact): { verdict: MatchVerdict; confidence: number; reasons: string[] } {
  const { item, titleSimilarity, sameThing, coreSimilarity, sameSubject, variant, dateDelta, amount, payeeMatches } = comparison;
  const reasons: string[] = [];
  const effective = payeeMatches || sameThing ? Math.max(titleSimilarity, 0.85) : titleSimilarity;
  if (payeeMatches) reasons.push("the same payee");

  // A different variety of the same thing is worth naming even when the
  // variety word drags the plain name similarity down.
  if (variant && effective < 0.5 && coreSimilarity >= 0.8) {
    return { verdict: "related_but_different", confidence: 0.55, reasons: ["the same kind of thing", "a different variety"] };
  }
  if (effective < 0.5) return { verdict: "no_match", confidence: 0, reasons: [] };
  // "Annual Day rehearsal" is not "Annual Day", however much of the name they share.
  if (typeof item.attributes.title === "string" && partsOf(incoming.title) !== partsOf(item.attributes.title)) {
    return { verdict: "related_but_different", confidence: 0.55, reasons: ["a different part of the same occasion"] };
  }
  if (titleSimilarity >= 0.95) reasons.push("the same name");
  else if (titleSimilarity >= 0.8) reasons.push("nearly the same name");
  else if (sameThing) reasons.push("another name for the same thing");
  else reasons.push("a similar name");

  if (variant) return { verdict: "related_but_different", confidence: 0.6, reasons: [...reasons, "a different variety"] };
  if (sameSubject === false) return { verdict: "related_but_different", confidence: 0.55, reasons: [...reasons, "for a different person"] };
  if (sameSubject) reasons.push("for the same person");
  if (effective < 0.8) return { verdict: "related_but_different", confidence: 0.5 + 0.2 * effective, reasons };

  const sameDay = dateDelta === 0;
  const nearDay = dateDelta !== null && dateDelta <= 1;
  const noDate = dateDelta === null;
  if (sameDay) reasons.push("on the same day");
  if (amount === "same") reasons.push("the same amount");

  const historical = item.freshness === "historical";

  if (effective >= 0.95 && (sameDay || noDate) && amount !== "different") {
    return { verdict: "exact_match", confidence: 0.97, reasons };
  }
  if ((sameDay || nearDay || noDate) && amount !== "different") {
    return { verdict: "likely_duplicate", confidence: 0.85, reasons };
  }
  if (historical) {
    return { verdict: "related_but_different", confidence: 0.6, reasons: [...reasons, "an earlier one, already finished"] };
  }

  const recurring = RECURRING_DOMAINS.has(item.domain);
  if (dateDelta !== null && recurring && dateDelta > UPDATE_WINDOW_DAYS) {
    return { verdict: "related_but_different", confidence: 0.6, reasons: [...reasons, "a different occurrence"] };
  }

  const changed = [dateDelta !== null && dateDelta > 0 ? "a different date" : null, amount === "different" ? "a different amount" : null].filter((value): value is string => Boolean(value));
  if (recordIsNewerThanSource(item, incoming)) {
    return { verdict: "contradiction", confidence: 0.8, reasons: [...reasons, ...changed, "the record was updated after this was captured, so it stands"] };
  }
  return { verdict: "likely_update", confidence: 0.75, reasons: [...reasons, ...changed] };
}

const RANK: Record<MatchVerdict, number> = {
  exact_match: 6,
  likely_duplicate: 5,
  contradiction: 4,
  likely_update: 3,
  related_but_different: 2,
  no_match: 1,
};

/** Every known item this fact resembles, strongest verdict first. `no_match` results are left out. */
export function findPotentialMatches(incoming: IncomingFact, items: readonly HouseholdContextItem[], options: { timezone: string }): MatchResult[] {
  return items
    .filter((item) => item.domain === incoming.domain && item.entityType !== "state" && item.freshness !== "superseded")
    .map((item) => {
      const comparison = compare(incoming, item, options.timezone);
      const decided = verdictFor(comparison, incoming);
      return { verdict: decided.verdict, item, confidence: decided.confidence, reasons: decided.reasons };
    })
    .filter((result) => result.verdict !== "no_match")
    // Equal verdicts are ordered by how alike the names are: "Annual Day"
    // is the Annual Day on file before it is the Annual Day rehearsal.
    .sort((a, b) => RANK[b.verdict] - RANK[a.verdict] || b.confidence - a.confidence || nameSimilarity(incoming, b.item) - nameSimilarity(incoming, a.item));
}

function nameSimilarity(incoming: IncomingFact, item: HouseholdContextItem): number {
  return typeof item.attributes.title === "string" ? similarity(incoming.title, item.attributes.title) : 0;
}

/** The single verdict for an incoming fact: its strongest match, or `no_match`. */
export function matchIncoming(incoming: IncomingFact, items: readonly HouseholdContextItem[], options: { timezone: string }): MatchResult {
  return findPotentialMatches(incoming, items, options)[0] ?? { verdict: "no_match", item: null, confidence: 1, reasons: ["nothing like it is on record"] };
}

/** Whether a verdict should stop a write until a person says it really is new. */
export function needsReconciliation(result: MatchResult): boolean {
  return result.verdict === "exact_match" || result.verdict === "likely_duplicate" || result.verdict === "likely_update" || result.verdict === "contradiction";
}

/** The household-facing sentence for a reconciliation candidate. */
export function describeMatch(result: MatchResult): string {
  if (!result.item) return "Nothing like this is on record yet.";
  const title = typeof result.item.attributes.title === "string" ? result.item.attributes.title : result.item.summary;
  switch (result.verdict) {
    case "exact_match":
      return `This is already on record: ${result.item.summary}`;
    case "likely_duplicate":
      return `This looks like ${title}, which is already on record: ${result.item.summary}`;
    case "likely_update":
      return `This may be newer details for ${title} (${result.reasons.slice(-2).join(", ")}): ${result.item.summary}`;
    case "contradiction":
      return `This disagrees with ${title}, which was updated on record after this was captured: ${result.item.summary}`;
    case "related_but_different":
      return `Similar to ${title}, but not the same thing.`;
    default:
      return "Nothing like this is on record yet.";
  }
}
