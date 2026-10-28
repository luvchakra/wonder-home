import { formatDate } from "../context/format";
import type { ContextDomain, HouseholdContextItem } from "../context/types";
import { linkTo } from "../conversation/reply-format";

/**
 * A fact as a person reads it, for an answer HomeBrain assembles itself
 * (`answer.ts`'s `composeFromFacts`).
 *
 * A fact's statement is written for a model: complete, literal, with the
 * day as `2026-10-01` and the agenda's next step as its code
 * (`suggested: pay_bill`). A model rewrites it. When no model's answer could
 * be stood behind, the household reads the facts themselves — and the owner
 * (2026-10-21) read "Electricity — … (due 2026-10-01); suggested: pay_bill"
 * with nothing to tap. Here each fact becomes a line in the reply format
 * (`conversation/reply-format.ts`): the thing named in **bold**, the day in
 * the words every other reply uses ("Thu 1 Oct"), no internal code, and a
 * link to the screen where it is seen or done.
 *
 * Nothing here adds a fact: the line says what the statement says, in other
 * words, and the link is chosen from where the record lives.
 */

/** The screen a part of the home is kept on, or null where none fits. */
const DOMAIN_PLACE: Partial<Record<ContextDomain | "conflict" | "profile", string>> = {
  household: "/family",
  people: "/family",
  pets: "/household/home",
  pet_care: "/household/home",
  home: "/household/home",
  laundry: "/household/home",
  responsibilities: "/household/responsibilities",
  outcomes: "/household/responsibilities",
  preferences: "/certification",
  calendar: "/calendar",
  absences: "/family",
  school: "/school",
  groceries: "/groceries",
  orders: "/groceries",
  meals: "/meals",
  bills: "/bills",
  health: "/health",
  notifications: "/notifications",
  homesend: "/home-send",
  integrations: "/settings/connections",
  places: "/places",
  attention: "/",
  conflict: "/calendar",
  profile: "/family",
};

/** Where an agenda row (a `HomeAssessment`'s subject key: `bill.…`, `asset.…`) is handled. */
const SUBJECT_PLACE: readonly [RegExp, string][] = [
  [/^(?:bill|obligation|anomaly|payment|finance)\b/i, "/bills"],
  [/^(?:asset|service|home|laundry|pet|issue|routine)\b/i, "/household/home"],
  [/^(?:school|school_message|homework|deadline)\b/i, "/school"],
  [/^(?:order|consumable|grocery|stock)\b/i, "/groceries"],
  [/^meal\b/i, "/meals"],
  [/^(?:event|gift|conflict)\b/i, "/calendar"],
  [/^(?:appointment|checkup|health|vital)\b/i, "/health"],
];

export function placeForSubject(subjectKey: string): string {
  return SUBJECT_PLACE.find(([pattern]) => pattern.test(subjectKey))?.[1] ?? "/";
}

/** The screen a fact belongs to: its own record's, else its part of the home's. */
export function placeOf(domain: string, item?: HouseholdContextItem | null): string | null {
  if (item?.domain === "attention" && item.entityType === "attention") return placeForSubject(item.entityId);
  if (item?.domain === "preferences" && item.entityType === "food_preference") return "/meals";
  return DOMAIN_PLACE[domain as ContextDomain] ?? null;
}

/** "Thu 1 Oct" for a day — the words every reply uses — whatever zone the server runs in. */
export function dayWords(iso: string): string {
  return formatDate(new Date(`${iso.slice(0, 10)}T12:00:00Z`), "UTC");
}

/**
 * Every ISO day in a reply said as a day: "2026-10-01" (or a timestamp on it)
 * becomes "Thu 1 Oct". A day inside a link's path or query is left alone.
 * Applied to a model's validated answer too: the facts it was given carry ISO
 * days, and a person never reads one.
 */
export function isoDaysInWords(text: string): string {
  return text.replace(/(?<![=/\w-])(\d{4}-\d{2}-\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?(?![\w-])/g, (_match, day: string) => dayWords(day));
}

/**
 * A statement in a person's words: every ISO day said as a day, the
 * agenda's action codes gone, "the person asking" said as "you".
 */
export function personFacing(statement: string): string {
  return isoDaysInWords(statement.replace(/;\s*suggested:\s*[a-z][a-z0-9_]*/gi, ""))
    .replace(/\(the person asking\)/g, "(you)")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

/** One line of a deterministic answer: the fact in a person's words, and where to see it. */
export function sayFact(fact: { statement: string; domain: string; say?: string; place?: string | null }): string {
  const words = (fact.say ?? personFacing(fact.statement)).replace(/[.\s]+$/, "");
  const place = fact.place === undefined ? placeOf(fact.domain) : fact.place;
  return place ? `${words} → ${linkTo(place)}` : `${words}.`;
}

/**
 * The person-facing words for a record, where its statement would read
 * oddly to a person. Only agenda rows today: their statement leads with
 * "Needs attention:" and carries the next step's code; the line leads with
 * the thing's name.
 */
export function sayItem(item: HouseholdContextItem): string | undefined {
  if (item.domain !== "attention" || item.entityType !== "attention") return undefined;
  const title = typeof item.attributes.title === "string" ? item.attributes.title : null;
  const reason = typeof item.attributes.reason === "string" ? item.attributes.reason.trim().replace(/\.$/, "") : null;
  if (!title || !reason) return undefined;
  const dueOn = typeof item.attributes.dueOn === "string" ? item.attributes.dueOn : null;
  const urgent = item.attributes.riskLevel === "high" ? " (urgent)" : "";
  return `**${title}**${urgent} — ${personFacing(reason)}${dueOn ? ` (due ${dayWords(dueOn)})` : ""}`;
}
