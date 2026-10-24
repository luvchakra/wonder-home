import type { IntakeExtraction, RawIntakeExtraction } from "./classify-intake";

/**
 * A second look at what kind of thing the model said an intake is, in code,
 * before anything is shown (the owner, 2026-10-24: a society's blood-test camp
 * flyer, read as "A grocery item" because it listed prices).
 *
 * A grocery_item is a product to buy from a shop. The words a reading carries
 * (title, summary, notes, subject) say when it is something else: a service
 * someone offers (a test, a check-up, a screening, a consultation) or a
 * gathering on a day (a camp, a workshop, a meeting; not "party", since
 * party poppers are groceries). Either is something the household would
 * go to, so it is an event on the family calendar, read at low confidence
 * so a person always confirms it.
 *
 * Only ever moves a reading away from grocery_item: every other kind's
 * evidence is the model's to weigh, and a guess here would be worse.
 */
const NOT_A_PRODUCT = [
  // services, mostly health: what you book or go to, not what you buy
  /\b(?:blood|lab|health|medical|diagnostic|pathology|eye|dental|thyroid|diabetes|sugar)\s+(?:tests?|check(?:-?ups?)?|camps?|screenings?)\b/i,
  /\bcheck-?ups?\b/i,
  /\bscreenings?\b/i,
  /\bdiagnostics?\b/i,
  /\bvaccinat\w*\b/i,
  /\bconsultations?\b/i,
  /\bappointments?\b/i,
  /\b(?:clinic|hospital|pathology lab)\b/i,
  // gatherings on a day
  /\bcamps?\b/i,
  /\b(?:workshop|seminar|webinar|meeting|session|celebration|festival|concert|tournament|rally)s?\b/i,
  /\binvit(?:e|ed|ation)s?\b/i,
];

export function looksLikeServiceOrGathering(text: string): boolean {
  return NOT_A_PRODUCT.some((pattern) => pattern.test(text));
}

export function reviewIntakeKind<T extends RawIntakeExtraction | IntakeExtraction>(raw: T): T {
  if (!raw.readable || raw.kind !== "grocery_item") return raw;
  const said = [raw.title, raw.summary, raw.notes, raw.subject].filter(Boolean).join("\n");
  if (!looksLikeServiceOrGathering(said)) return raw;
  return { ...raw, kind: "event", confidence: "low", quantity: null, unit: null, category: null, records: [] };
}

/** The kinds a review can pre-select: every intake kind but "unknown". */
const REVIEW_KINDS = new Set(["bill", "school_item", "activity_item", "event", "grocery_item", "health_document", "receipt"]);

/**
 * Which category the review opens on, marked Suggested. The stored kind,
 * given the same second look as a fresh reading (so an item read before
 * this check still opens right); for "unknown", an event when its words name
 * a service or a gathering, and otherwise nothing at all — the person picks,
 * and no category is ever called Suggested that nothing suggested.
 */
export function suggestedIntakeKind(
  kind: string | null | undefined,
  reading: { title?: string | null; summary?: string | null; notes?: string | null; subject?: string | null } | null | undefined,
): string | null {
  const said = [reading?.title, reading?.summary, reading?.notes, reading?.subject].filter(Boolean).join("\n");
  if ((kind === "grocery_item" || kind === "unknown" || !kind) && said && looksLikeServiceOrGathering(said)) return "event";
  return kind && REVIEW_KINDS.has(kind) ? kind : null;
}
