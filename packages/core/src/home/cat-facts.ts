/**
 * What the Home cat mentions in its thought bubble (the owner, 2026-10-21:
 * "in thought bubble show useful info … it should speak in cat language").
 *
 * Every line is a fact from the household's own records, read through the
 * viewer's own session, so a person only ever hears about what they may see:
 * tonight's dinner, the next thing on the calendar today or tomorrow, how many
 * things are on the list to buy. Rules pick and word them (catalog keys and
 * values, never free text), and the screen wraps each one in a cat's "Meow!"
 * or "Purr…" in the reader's language. Nothing is invented; with nothing on
 * record there are no facts and the cat keeps to its passing thoughts.
 */

export type CatFact =
  | { key: "today.cat.dinner"; values: { meal: string } }
  | { key: "today.cat.eventToday"; values: { title: string; time: string } }
  | { key: "today.cat.eventTomorrow"; values: { title: string } }
  | { key: "today.cat.toBuy"; values: { count: number } };

export type CatFactInput = {
  /** Today's meals, in the household's day. */
  meals: readonly { name: string; slot: string; status: string }[];
  /** Events from now to the end of tomorrow, soonest first, with their local start already worded. */
  events: readonly { title: string; startsAt: Date; status: string; allDay?: boolean; time: string; today: boolean }[];
  /** Things on the list to buy. */
  toBuy: number;
  now: Date;
};

export function catFacts(input: CatFactInput): CatFact[] {
  const facts: CatFact[] = [];
  const dinner = input.meals.find((meal) => meal.slot === "dinner" && meal.status !== "skipped" && meal.status !== "eaten");
  if (dinner) facts.push({ key: "today.cat.dinner", values: { meal: dinner.name } });
  const ahead = input.events.filter((event) => event.status !== "cancelled" && event.status !== "happened" && (event.allDay || event.startsAt.getTime() >= input.now.getTime()));
  const today = ahead.find((event) => event.today);
  if (today) facts.push({ key: "today.cat.eventToday", values: { title: today.title, time: today.time } });
  const tomorrow = ahead.find((event) => !event.today);
  if (tomorrow) facts.push({ key: "today.cat.eventTomorrow", values: { title: tomorrow.title } });
  if (input.toBuy > 0) facts.push({ key: "today.cat.toBuy", values: { count: input.toBuy } });
  return facts;
}

/** The cat's ways of saying a thing; `{fact}` is the fact in the reader's language. */
export const CAT_VOICES = ["today.cat.voice.1", "today.cat.voice.2", "today.cat.voice.3", "today.cat.voice.4"] as const;
