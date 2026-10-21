/**
 * HomePlaces: what a place question asks for, read by rules from the
 * person's own words, never by a model.
 *
 * "Suggest some good places for dinner tonight" and "where can we hang out
 * near Anya's school after school ends" are read into a `PlaceRequest`:
 * - what kind of place (somewhere to eat, or somewhere to go);
 * - near what (home, a child's school, or someone's office);
 * - for when (now, a meal time, after school, or after work; today, or the
 *   day said — "tomorrow").
 *
 * The model, when there is one, only decides that the sentence is a place
 * question (`find_places`). Everything that decides which places come back
 * is decided here and in `service.ts`, where it can be tested.
 *
 * A place question is never a dead end (the owner's report, 2026-10-21:
 * "can we go somewhere out tomorrow" was asked "what kind of place?", and
 * the answer "dinner nearby home" got the identical question back):
 * - once a turn is known to be a place question (`asked`), a kind nobody
 *   named is read as going out (`assumed: "kind"`), answered, and said back
 *   with how to narrow it, never asked first;
 * - a turn that follows a place answer is read together with it
 *   (`earlier`): what this turn says wins, and the day, the anchor and the
 *   kind it leaves unsaid are carried from the turn before.
 */

export type PlaceAnchor =
  | { kind: "home" }
  | { kind: "school"; childName: string | null }
  /** Someone's office: the speaker's own unless a name is said ("near Kunal's office"). */
  | { kind: "work"; personName: string | null };

export type PlaceWhen =
  | { kind: "now" }
  /** A window starting at `minute` past midnight on the day asked about (today, unless the request's `dayOffset` says otherwise), in the household's own time. */
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
  /** Days from today the window falls on: 1 for "tomorrow". Absent is today. */
  dayOffset?: number;
  /** What was taken rather than said, and is said back: "kind" when no kind of place was named. */
  assumed?: "kind";
  /** The question HomeTalk already asked about this request ("whose school?"), so it is never asked again. */
  asked?: "which_child";
};

/**
 * How a request is read. `asked`: the turn is already known to be a place
 * question (the model or a pending place question said so), so no asking
 * word is needed. `earlier`: the place request the turn before was about.
 */
export type PlaceReadOptions = { asked?: boolean; earlier?: PlaceRequest | null };

const ASKING =
  /\b(?:suggest|recommend|find (?:us |me )?(?:a |some )?|search for|look(?:ing)? for|show me|where (?:can|could|should|shall) (?:we|i)|where to|(?:can|could|shall|should) (?:we|i) go\b|let'?s go (?:out|somewhere)\b|(?:any|some) (?:good |nice |great )?(?:places?|spots?|restaurants?|cafes?)|(?:good|best|nice|great) (?:places?|spots?|restaurants?|cafes?)|(?:places?|spots?|somewhere) (?:to|for|near|nearby|around)|ideas? for|what(?:'s| is| are) (?:a |some )?(?:good |nice )?(?:places?|spots?))/i;
/**
 * The short way a place is asked for, with no asking word at all: "dinner
 * nearby home", "a park near us". A few words only, never a command
 * ("plan dinner near home" is a plan), and always with where.
 */
const NEARBY = /\b(?:nearby|near (?:to )?(?:home|here|us|me|the house|our (?:home|house|place))|close (?:by|to home)|around here)\b/i;
const COMMAND = /^(?:please\s+)?(?:add|plan|remind|buy|order|put|book|pay|cancel|schedule|move|mark|log|record|remove|set|note|remember)\b/i;
const MEALS: Record<string, { minute: number; forMinutes: number }> = {
  breakfast: { minute: 8 * 60 + 30, forMinutes: 60 },
  brunch: { minute: 11 * 60, forMinutes: 90 },
  lunch: { minute: 13 * 60, forMinutes: 90 },
  snacks: { minute: 17 * 60, forMinutes: 60 },
  dinner: { minute: 19 * 60 + 30, forMinutes: 90 },
};
/** Going out on another day with no time said: late morning, for a few hours. */
const OUTING_DAYTIME = { minute: 11 * 60, forMinutes: 180 };
const EAT = /\b(dinner|lunch|breakfast|brunch|snacks?|eat(?:ing)?|food|restaurants?|cafes?|caf[eé]s?|coffee|dine|dining|meal|takeaway|ice ?cream|desserts?|pizza|biryani|dosa|burgers?|sushi|chinese|italian|south indian|north indian|thai|mexican|vegetarian|vegan|pure veg)\b/i;
const OUTING = /\b(hang ?out|chill|fun|play(?:ground| area)?|parks?|things to do|visit|walk|picnic|museum|activit(?:y|ies)|games?|bowling|trampoline|swim(?:ming)?|zoo|aquarium|library|mall)\b/i;
/**
 * Going out with no kind of place named: "can we go somewhere out", "a day
 * out". A place question all the same; its kind is assumed and said back.
 */
const GENERIC_OUTING = /\b(?:go(?:ing)? out|go(?:ing)? somewhere|somewhere out|out somewhere|outing|day out|somewhere to go|step out)\b/i;
/** "A two-day vacation plan", "a weekend getaway", "somewhere for a short trip": a getaway, not a dinner. */
const GETAWAY = /\b(vacations?|holidays?|getaways?|trips?|staycations?|weekend away|road ?trips?|excursions?|places? to travel|travel plan)\b/i;
const DAYS: Record<string, number> = { one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, couple: 2 };
const CUISINE = /\b(pizza|biryani|dosa|burgers?|sushi|chinese|italian|south indian|north indian|thai|mexican|vegetarian|vegan|pure veg|ice ?cream|desserts?|coffee)\b/i;
const CHILDREN = /\b(kids?|child(?:ren)?|son|daughter|little ones?|family|her|him|them)\b|\b\w+'s school\b|after school/i;

function namesAKind(said: string): boolean {
  return EAT.test(said) || OUTING.test(said) || GENERIC_OUTING.test(said) || GETAWAY.test(said);
}

/** Whether a sentence is asking for places at all: an asking word (or the short "dinner nearby home") and a kind of place. */
export function isPlaceQuestion(utterance: string): boolean {
  const said = utterance.trim();
  if (!namesAKind(said)) return false;
  if (ASKING.test(said)) return true;
  return NEARBY.test(said) && !COMMAND.test(said) && said.split(/\s+/).length <= 6;
}

/**
 * Whether a short reply carries anything a place request is made of — a
 * kind, a day or time, where, or one of `names` (the children a "whose
 * school?" offered) — so it can be read as the answer to a place question
 * HomeTalk just asked. "Thanks" carries nothing and is never a new search.
 */
export function carriesPlaceDetail(utterance: string, names: readonly string[] = []): boolean {
  const said = utterance.trim();
  const lower = said.toLowerCase();
  if (namesAKind(said)) return true;
  if (NEARBY.test(said) || /\b(?:near|around|close to)\b/i.test(said)) return true;
  if (dayOffsetFrom(lower) !== null || whenFrom(lower, null) !== null) return true;
  const words = new Set(lower.split(/[^\p{L}'-]+/u).filter(Boolean));
  return names.some((name) => words.has(name.toLocaleLowerCase().split(/\s+/)[0] ?? ""));
}

/** How many days a getaway is for: "two-day", "3 day", "a weekend" (2), "a couple of days"; 2 when nothing is said. */
function tripDays(lower: string): number {
  const number = /\b(\d{1,2}|one|two|three|four|five|six|seven|couple(?: of)?)[- ](?:days?|nights?)\b/.exec(lower)?.[1];
  if (number) return Math.min(Math.max(Number(number) || DAYS[number.replace(/ of$/, "")] || 2, 1), 14);
  if (/\bweek-?long\b|\ba week\b/.test(lower)) return 7;
  return 2;
}

export function readPlaceRequest(utterance: string, options: PlaceReadOptions = {}): PlaceRequest | null {
  const said = utterance.trim();
  if (!options.asked && !isPlaceQuestion(said)) return null;
  const lower = said.toLowerCase();
  // Only a request of the same kind is carried: a getaway is days away, not a dinner.
  const earlier = options.earlier && options.earlier.purpose !== "getaway" ? options.earlier : null;

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

  // Where: what this turn says, else the turn before's, else home.
  const saidAnchor = anchorFrom(said);
  const anchor: PlaceAnchor = saidAnchor ?? earlier?.anchor ?? { kind: "home" };
  // A "whose school?" already asked stays asked while the anchor is the one it was asked about.
  const asked = !saidAnchor && earlier?.asked ? earlier.asked : undefined;

  // When: a day said ("tomorrow"), a time said ("dinner", "at 8"), else the turn before's.
  const saidDay = dayOffsetFrom(lower);
  const meal = /\b(breakfast|brunch|lunch|dinner|snacks?)\b/i.exec(said)?.[1]?.toLowerCase().replace(/s$/, "") ?? null;
  const saidWhen = whenFrom(lower, meal);
  // A time said before carries to a new day ("dinner tonight", then "tomorrow instead" is dinner tomorrow).
  const when = saidWhen ?? (earlier && earlier.when.kind !== "now" && earlier.when.kind !== "trip" ? earlier.when : null);
  const dayOffset = saidDay ?? earlier?.dayOffset ?? 0;
  const radiusMeters = anchor.kind === "school" || anchor.kind === "work" ? 4_000 : 6_000;

  const eat = EAT.exec(said);
  const outing = OUTING.exec(said);

  // No kind named this turn ("near Anya's school", "tomorrow instead"): the
  // turn before's, when that one named it.
  if (!eat && !outing && !GENERIC_OUTING.test(said) && earlier && earlier.assumed !== "kind") {
    const { asked: _asked, dayOffset: _day, ...kept } = earlier;
    void _asked;
    void _day;
    return settle(
      { ...kept, anchor, radiusMeters, forChildren: earlier.forChildren || CHILDREN.test(said) || anchor.kind === "school", ...(asked ? { asked } : {}) },
      when,
      dayOffset,
    );
  }

  // "Hang out ... and grab an ice cream" is still an outing; "dinner" is eating.
  const purpose: PlaceRequest["purpose"] = eat && (!outing || /\b(dinner|lunch|breakfast|brunch|eat|restaurant)\b/i.test(said)) ? "eat" : "outing";
  const forChildren = CHILDREN.test(said) || anchor.kind === "school";
  const cuisine = CUISINE.exec(said)?.[1]?.toLowerCase() ?? null;

  let query: string;
  let label: string;
  let assumed: PlaceRequest["assumed"];
  if (purpose === "eat") {
    const what = cuisine === "coffee" ? "cafe" : cuisine && /ice ?cream|dessert/.test(cuisine) ? "dessert place" : `${cuisine ? `${cuisine} ` : ""}restaurant`;
    query = `${forChildren ? "family friendly " : ""}${what}${meal && meal !== "snack" ? ` for ${meal}` : ""}`;
    label = meal ?? (cuisine ? `${cuisine}` : "somewhere to eat");
  } else if (outing) {
    query = forChildren ? "park or play area for kids" : `${outing[1]!.toLowerCase()} places`;
    label = forChildren ? "somewhere to hang out with the children" : "somewhere to hang out";
  } else {
    // Going out with no kind of place named ("can we go somewhere out
    // tomorrow"): the places a family goes out to, said back as assumed.
    query = forChildren ? "park or play area for kids" : "family outing places";
    label = "going out";
    assumed = "kind";
  }

  return settle({ purpose, query, label, forChildren, anchor, when: { kind: "now" }, radiusMeters, ...(assumed ? { assumed } : {}), ...(asked ? { asked } : {}) }, when, dayOffset);
}

/**
 * The window, settled. Today with no time said is now. Another day with no
 * time said is that day's daytime — lunch time to eat, late morning to go
 * out — and the day itself is kept on the request (`dayOffset`).
 */
function settle(request: PlaceRequest, when: PlaceWhen | null, dayOffset: number): PlaceRequest {
  if (dayOffset <= 0) return { ...request, when: when ?? { kind: "now" } };
  const daytime = request.purpose === "eat" ? MEALS.lunch! : OUTING_DAYTIME;
  const later: PlaceWhen = when && when.kind !== "now" ? when : { kind: "today", minute: daytime.minute, forMinutes: daytime.forMinutes, label: clock(daytime.minute) };
  return { ...request, when: later, dayOffset };
}

/** "Tomorrow" is 1, "day after tomorrow" 2, "today"/"tonight" 0; null when no day is said. */
function dayOffsetFrom(lower: string): number | null {
  if (/\bday after tomorrow\b/.test(lower)) return 2;
  if (/\btomorrow\b|\btmrw\b|\btmr\b/.test(lower)) return 1;
  if (/\btoday\b|\btonight\b|\bthis (?:evening|afternoon|morning)\b/.test(lower)) return 0;
  return null;
}

const WORK = /\b(?:near|around|by|close to)\s+(?:to\s+)?(?:(\p{Lu}[\p{L}'-]*?)(?:'s|s')|my|our|the|his|her|their)?\s*(?:office|work(?:place)?)\b/iu;

/** Where the words say, or null when they say nothing of where. "Near home" and a bare "nearby" are home. */
function anchorFrom(said: string): PlaceAnchor | null {
  // "Near my office", "around Kunal's office", "close to work".
  const work = WORK.exec(said);
  if (work) return { kind: "work", personName: work[1] ?? null };
  const school = /\bnear (?:to )?(?:(\p{Lu}[\p{L}'-]*?)(?:'s|s')|her|his|their|the|our|my|the kids'?|the children's)?\s*school\b/iu.exec(said);
  if (school || /\bafter school\b/i.test(said) && !/\bnear (?:home|the house|us|our (?:home|house))\b/i.test(said)) {
    const name = school?.[1] ?? /\b(\p{Lu}[\p{L}-]+)(?:'s|s') school\b/u.exec(said)?.[1] ?? null;
    return { kind: "school", childName: name };
  }
  if (NEARBY.test(said) || /\b(?:near|around|close to)\s+(?:to\s+)?(?:home|the house|our (?:home|house|place))\b/i.test(said)) return { kind: "home" };
  return null;
}

/** The time the words say, or null when they say none. */
function whenFrom(lower: string, meal: string | null): PlaceWhen | null {
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
  return null;
}

/**
 * The place request a stored HomeTalk reply was about (its metadata's
 * `placeRequest`), read back for the next turn. Our own record, but read
 * defensively: anything malformed is no earlier request at all.
 */
export function placeRequestFrom(metadata: unknown): PlaceRequest | null {
  const raw = (metadata as { placeRequest?: unknown } | null)?.placeRequest as Partial<PlaceRequest> | undefined;
  if (!raw || typeof raw !== "object") return null;
  if (raw.purpose !== "eat" && raw.purpose !== "outing" && raw.purpose !== "getaway") return null;
  if (typeof raw.query !== "string" || typeof raw.label !== "string" || typeof raw.radiusMeters !== "number") return null;
  const anchor = raw.anchor as PlaceAnchor | undefined;
  if (!anchor || (anchor.kind !== "home" && anchor.kind !== "school" && anchor.kind !== "work")) return null;
  const when = raw.when as PlaceWhen | undefined;
  if (!when || !["now", "today", "after_school", "after_work", "trip"].includes(when.kind)) return null;
  return {
    purpose: raw.purpose,
    query: raw.query.slice(0, 120),
    label: raw.label.slice(0, 80),
    forChildren: raw.forChildren === true,
    anchor,
    when,
    radiusMeters: raw.radiusMeters,
    ...(typeof raw.placeType === "string" ? { placeType: raw.placeType } : {}),
    ...(typeof raw.dayOffset === "number" && raw.dayOffset > 0 && raw.dayOffset <= 7 ? { dayOffset: raw.dayOffset } : {}),
    ...(raw.assumed === "kind" ? { assumed: "kind" as const } : {}),
    ...(raw.asked === "which_child" ? { asked: "which_child" as const } : {}),
  };
}

/**
 * A HomeTalk turn's place request: the words read as a place question (the
 * turn is one — the model, the rules or a pending place question said so),
 * together with the request the turn before was about. A "whose school?"
 * answered with a bare name ("Anya") becomes that child's school.
 */
export function placeRequestForTurn(input: {
  utterance: string;
  /** What the understanding passed on as the request, when it differs from the words. */
  said?: unknown;
  earlier?: PlaceRequest | null;
  children?: readonly { name: string }[];
}): PlaceRequest {
  const words = typeof input.said === "string" && input.said.trim() ? input.said : input.utterance;
  const request = readPlaceRequest(words, { asked: true, earlier: input.earlier ?? null })!;
  if (request.anchor.kind === "school" && request.anchor.childName === null && input.children?.length) {
    const lower = new Set(input.utterance.toLocaleLowerCase().split(/[^\p{L}'-]+/u).filter(Boolean));
    const named = input.children.filter((child) => lower.has(child.name.toLocaleLowerCase().split(/\s+/)[0] ?? ""));
    if (named.length === 1) {
      const { asked: _asked, ...rest } = request;
      void _asked;
      return { ...rest, anchor: { kind: "school", childName: named[0]!.name.split(/\s+/)[0]! } };
    }
  }
  return request;
}

/** "7:30 pm", "1 pm": how a time is said back. */
export function clock(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const mins = minute % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${mins ? `:${String(mins).padStart(2, "0")}` : ""} ${hour < 12 ? "am" : "pm"}`;
}
