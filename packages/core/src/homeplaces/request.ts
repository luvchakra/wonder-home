/**
 * HomePlaces: what a place question asks for, read by rules from the
 * person's own words, never by a model.
 *
 * "Suggest some good places for dinner tonight" and "where can we hang out
 * near Anya's school after school ends" are read into a `PlaceRequest`:
 * - what kind of place (somewhere to eat, or somewhere to go);
 * - near what (home, a child's school, or someone's office);
 * - for when (now, a meal time today, after school, or after work).
 *
 * The model, when there is one, only decides that the sentence is a place
 * question (`find_places`). Everything that decides which places come back
 * is decided here and in `service.ts`, where it can be tested.
 */

export type PlaceAnchor =
  | { kind: "home" }
  | { kind: "school"; childName: string | null }
  /** Someone's office: the speaker's own unless a name is said ("near Kunal's office"). */
  | { kind: "work"; personName: string | null };

export type PlaceWhen =
  | { kind: "now" }
  /** A window starting today at `minute` past midnight, in the household's own time. */
  | { kind: "today"; minute: number; forMinutes: number; label: string }
  | { kind: "after_school"; forMinutes: number }
  /** After the speaker's working day, by the office hours they keep. */
  | { kind: "after_work"; forMinutes: number }
  /** A getaway of a few days: no opening hours to check, somewhere worth the drive. */
  | { kind: "trip"; days: number };

export type PlaceRequest = {
  purpose: "eat" | "outing" | "getaway";
  /** The words sent to the place search: "family friendly restaurant for dinner". */
  query: string;
  /** How the request is said back: "dinner", "somewhere to hang out". */
  label: string;
  forChildren: boolean;
  anchor: PlaceAnchor;
  when: PlaceWhen;
  radiusMeters: number;
  /** A place type the search keeps to, when the words alone draw the wrong kind (a getaway's "tourist_attraction"). */
  placeType?: string;
};

const ASKING =
  /\b(?:suggest|recommend|find (?:us |me )?(?:a |some )?|search for|look(?:ing)? for|show me|where (?:can|could|should|shall) (?:we|i)|where to|(?:any|some) (?:good |nice |great )?(?:places?|spots?|restaurants?|cafes?)|(?:good|best|nice|great) (?:places?|spots?|restaurants?|cafes?)|(?:places?|spots?|somewhere) (?:to|for|near|nearby|around)|ideas? for|what(?:'s| is| are) (?:a |some )?(?:good |nice )?(?:places?|spots?))/i;
const MEALS: Record<string, { minute: number; forMinutes: number }> = {
  breakfast: { minute: 8 * 60 + 30, forMinutes: 60 },
  brunch: { minute: 11 * 60, forMinutes: 90 },
  lunch: { minute: 13 * 60, forMinutes: 90 },
  snacks: { minute: 17 * 60, forMinutes: 60 },
  dinner: { minute: 19 * 60 + 30, forMinutes: 90 },
};
const EAT = /\b(dinner|lunch|breakfast|brunch|snacks?|eat(?:ing)?|food|restaurants?|cafes?|caf[eé]s?|coffee|dine|dining|meal|takeaway|ice ?cream|desserts?|pizza|biryani|dosa|burgers?|sushi|chinese|italian|south indian|north indian|thai|mexican|vegetarian|vegan|pure veg)\b/i;
const OUTING = /\b(hang ?out|chill|outing|go out|day out|fun|play(?:ground| area)?|parks?|things to do|visit|walk|picnic|museum|activit(?:y|ies)|games?|bowling|trampoline|swim(?:ming)?|zoo|aquarium|library|mall)\b/i;
/** "A two-day vacation plan", "a weekend getaway", "somewhere for a short trip": a getaway, not a dinner. */
const GETAWAY = /\b(vacations?|holidays?|getaways?|trips?|staycations?|weekend away|road ?trips?|excursions?|places? to travel|travel plan)\b/i;
const DAYS: Record<string, number> = { one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, couple: 2 };
const CUISINE = /\b(pizza|biryani|dosa|burgers?|sushi|chinese|italian|south indian|north indian|thai|mexican|vegetarian|vegan|pure veg|ice ?cream|desserts?|coffee)\b/i;
const CHILDREN = /\b(kids?|child(?:ren)?|son|daughter|little ones?|family|her|him|them)\b|\b\w+'s school\b|after school/i;

/** Whether a sentence is asking for places at all: an asking word and a kind of place. */
export function isPlaceQuestion(utterance: string): boolean {
  return ASKING.test(utterance) && (EAT.test(utterance) || OUTING.test(utterance) || GETAWAY.test(utterance));
}

/** How many days a getaway is for: "two-day", "3 day", "a weekend" (2), "a couple of days"; 2 when nothing is said. */
function tripDays(lower: string): number {
  const number = /\b(\d{1,2}|one|two|three|four|five|six|seven|couple(?: of)?)[- ](?:days?|nights?)\b/.exec(lower)?.[1];
  if (number) return Math.min(Math.max(Number(number) || DAYS[number.replace(/ of$/, "")] || 2, 1), 14);
  if (/\bweek-?long\b|\ba week\b/.test(lower)) return 7;
  return 2;
}

export function readPlaceRequest(utterance: string): PlaceRequest | null {
  const said = utterance.trim();
  if (!isPlaceQuestion(said)) return null;
  const lower = said.toLowerCase();

  // A getaway is its own kind of question, even if food comes up on the way.
  if (GETAWAY.test(said) && !/\b(dinner|lunch|breakfast|brunch|restaurant)\b/i.test(said)) {
    const days = tripDays(lower);
    const forChildren = CHILDREN.test(said);
    return {
      purpose: "getaway",
      // Asked of the place search as attractions, which is what a trip is to:
      // "getaway destinations" alone brings back travel agencies.
      // "Hill station weekend getaway" drew Mahabaleshwar, Matheran and
      // Bhandardara from Pune when tried; vaguer words drew resorts and agencies.
      // A long weekend (three or four days, 14-035) is still a weekend away:
      // "holiday destination" drew one travel agency for it when tried live.
      query: `${forChildren ? "family friendly " : ""}${days <= 4 ? "hill station weekend getaway" : "holiday destination"}`,
      placeType: "tourist_attraction",
      label: `a ${days}-day getaway`,
      forChildren,
      anchor: { kind: "home" },
      when: { kind: "trip", days },
      // A day or two away: a few hours' drive. The search itself is biased within 50 km.
      radiusMeters: days <= 1 ? 80_000 : 200_000,
    };
  }

  const eat = EAT.exec(said);
  const outing = OUTING.exec(said);
  // "Hang out ... and grab an ice cream" is still an outing; "dinner" is eating.
  const purpose: PlaceRequest["purpose"] = eat && (!outing || /\b(dinner|lunch|breakfast|brunch|eat|restaurant)\b/i.test(said)) ? "eat" : "outing";
  const anchor = anchorFrom(said);
  const forChildren = CHILDREN.test(said) || anchor.kind === "school";
  const meal = /\b(breakfast|brunch|lunch|dinner|snacks?)\b/i.exec(said)?.[1]?.toLowerCase().replace(/s$/, "") ?? null;
  const cuisine = CUISINE.exec(said)?.[1]?.toLowerCase() ?? null;

  let query: string;
  let label: string;
  if (purpose === "eat") {
    const what = cuisine === "coffee" ? "cafe" : cuisine && /ice ?cream|dessert/.test(cuisine) ? "dessert place" : `${cuisine ? `${cuisine} ` : ""}restaurant`;
    query = `${forChildren ? "family friendly " : ""}${what}${meal && meal !== "snack" ? ` for ${meal}` : ""}`;
    label = meal ?? (cuisine ? `${cuisine}` : "somewhere to eat");
  } else {
    query = forChildren ? "park or play area for kids" : (outing?.[1] ? `${outing[1].toLowerCase()} places` : "places to hang out");
    label = forChildren ? "somewhere to hang out with the children" : "somewhere to hang out";
  }

  return {
    purpose,
    query,
    label,
    forChildren,
    anchor,
    when: whenFrom(lower, meal),
    radiusMeters: anchor.kind === "school" || anchor.kind === "work" ? 4_000 : 6_000,
  };
}

const WORK = /\b(?:near|around|by|close to)\s+(?:to\s+)?(?:(\p{Lu}[\p{L}'-]*?)(?:'s|s')|my|our|the|his|her|their)?\s*(?:office|work(?:place)?)\b/iu;

function anchorFrom(said: string): PlaceAnchor {
  // "Near my office", "around Kunal's office", "close to work".
  const work = WORK.exec(said);
  if (work) return { kind: "work", personName: work[1] ?? null };
  const school = /\bnear (?:to )?(?:(\p{Lu}[\p{L}'-]*?)(?:'s|s')|her|his|their|the|our|my|the kids'?|the children's)?\s*school\b/iu.exec(said);
  if (school || /\bafter school\b/i.test(said) && !/\bnear (?:home|the house|us|our (?:home|house))\b/i.test(said)) {
    const name = school?.[1] ?? /\b(\p{Lu}[\p{L}-]+)(?:'s|s') school\b/u.exec(said)?.[1] ?? null;
    return { kind: "school", childName: name };
  }
  return { kind: "home" };
}

function whenFrom(lower: string, meal: string | null): PlaceWhen {
  if (/\bafter school\b|\bschool (?:ends|gets out|is over)\b/.test(lower)) return { kind: "after_school", forMinutes: 120 };
  if (/\bafter (?:work|office)\b|\bwhen (?:i|we) (?:finish|get off|leave) (?:work|the office)\b|\b(?:work|office) (?:ends|is over|gets over)\b/.test(lower)) return { kind: "after_work", forMinutes: 120 };
  if (/\b(?:right )?now\b|\bopen now\b|\bat the moment\b/.test(lower)) return { kind: "now" };
  const at = /\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(lower);
  if (at) {
    let hour = Number(at[1]);
    const minute = Number(at[2] ?? 0);
    const half = at[3];
    if (half === "pm" && hour < 12) hour += 12;
    if (half === "am" && hour === 12) hour = 0;
    // "at 7" for dinner is the evening, never seven in the morning.
    if (!half && hour < 12 && (meal === "dinner" || /\btonight|evening\b/.test(lower))) hour += 12;
    if (hour <= 23 && minute <= 59) return { kind: "today", minute: hour * 60 + minute, forMinutes: 90, label: clock(hour * 60 + minute) };
  }
  if (meal && MEALS[meal]) return { kind: "today", ...MEALS[meal]!, label: clock(MEALS[meal]!.minute) };
  if (/\btonight\b|\bthis evening\b/.test(lower)) return { kind: "today", minute: 19 * 60, forMinutes: 120, label: clock(19 * 60) };
  return { kind: "now" };
}

/** "7:30 pm", "1 pm": how a time is said back. */
export function clock(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const mins = minute % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${mins ? `:${String(mins).padStart(2, "0")}` : ""} ${hour < 12 ? "am" : "pm"}`;
}
