import type { EventCategory } from "../calendar/projection";
import type { EventKind } from "../family/schedule";
import { billType, billTypeFor, type BillRecurrence, type BillTypeKey } from "../finance/bill-catalog";
import type { ObligationKind } from "../finance/payments";
import { normalizeUnit } from "../commerce/units";

/**
 * What a confirmed HomeSend item becomes in WonderHome's own structure (the
 * owner, 2026-10-25: Add must create the same record a person adding it by
 * hand would, aligned to the entity already there). Each shape here is the
 * input of the domain's own service — the one its screen uses — filled the
 * way that screen fills it, so an item from HomeSend is indistinguishable
 * from one typed in: an event has its kind, category and place; a bill its
 * type and how often it comes; a grocery its counted unit and its amount to
 * buy, on the list.
 *
 * Pure: reads only what the reviewed item says. The writes that use these
 * shapes are in the app (`home-send-writes.ts`), through each domain's
 * service, so undo stays that service's own remove.
 */

/** Words that say what kind of day an event is, first match wins; the category is where the calendar files it. */
const EVENT_WORDS: [RegExp, EventKind, EventCategory][] = [
  [/\bbirthday\b|\bb'?day\b/i, "birthday", "family"],
  [/\b(wedding|anniversary|engagement|reception|naming ceremony|housewarming|griha ?pravesh|puja|pooja|diwali|holi|eid|christmas|festival)\b/i, "special_occasion", "family"],
  [/\b(trip|travel|flight|train|vacation|holiday to|tour)\b/i, "travel", "family"],
  [/\b(doctor|dr\.|clinic|hospital|dentist|dental|check-?ups?|screening|vaccinat\w*|blood test|lab test|health camp|eye camp|diagnostic\w*|consultation|physio\w*)\b/i, "appointment", "health"],
  [/\b(school|ptm|parent[- ]teacher|annual day|sports day|class teacher)\b/i, "school_event", "school"],
  [/\b(picnic|movie|outing|zoo|museum|park visit|concert|show|match)\b/i, "outing", "family"],
  [/\b(society|agm|residents|committee|association|maintenance meeting|plumber|electrician|repair|service visit|pest control)\b/i, "gathering", "household"],
];

export type EventShape = { kind: EventKind; category: EventCategory };

/** The calendar's kind and category for an event, from its title and notes. Anything else is a gathering for the family. */
export function eventShape(said: { title: string; notes?: string | null }): EventShape {
  const words = [said.title, said.notes].filter(Boolean).join("\n");
  const hit = EVENT_WORDS.find(([pattern]) => pattern.test(words));
  return hit ? { kind: hit[1], category: hit[2] } : { kind: "gathering", category: "family" };
}

export type BillShape = { kind: ObligationKind; billType: BillTypeKey | null; recurrence: BillRecurrence | null };

/**
 * A bill's type and how often it comes, as the Bills screen's picker would
 * set them: the type its name or payee plainly is, and that type's usual
 * cadence. The kind the person picked in the review wins over the type's.
 */
export function billShape(said: { title: string; payee?: string | null; kind?: ObligationKind | null }): BillShape {
  const key = billTypeFor([said.title, said.payee].filter(Boolean).join(" "));
  const type = billType(key);
  return { kind: said.kind ?? type?.kind ?? "other", billType: key, recurrence: type?.recurrence ?? null };
}

export type GroceryShape = { name: string; unit: string; toBuy: number };

/**
 * A grocery as Groceries' own Add files it: a counted unit it knows ("pcs"
 * when none was given or it could not be read) and the amount to buy, at
 * least one, so it lands on To buy rather than only being tracked.
 */
export function groceryShape(said: { title: string; quantity?: number | string | null; unit?: string | null }): GroceryShape {
  const quantity = Number(said.quantity);
  return {
    name: said.title.trim(),
    unit: (said.unit && normalizeUnit(said.unit)) || "pcs",
    toBuy: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
  };
}
