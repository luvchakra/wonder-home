import { catThoughts, createThoughtModel, settleThoughts } from "@wonderhome/core/home/cat-thoughts";
import { CAT_VOICES, catFacts } from "@wonderhome/core/home/cat-facts";
import { platformKey } from "@wonderhome/core/ai/model-key";
import type { LanguageCode } from "@wonderhome/core/i18n/locales";
import { HeroCat } from "@wonderhome/core/ui/cozy-corner-illustration";

import { homeRows, localDay } from "../_lib/home-reads";
import type { Session } from "../_lib/session";
import { formatTime } from "../_lib/session";
import { CatThoughtBubble } from "./cat-thought-bubble";

/** The cat's own passing thoughts, for when nothing is on record and no model has written any. */
const BUILT_IN = 8;

/** The bubble waits this long at most, once per server, for a first batch of passing thoughts. */
const FIRST_BATCH_MS = 1_200;

/**
 * Home's cat and what it is thinking (the owner, 2026-10-21: "show a think
 * bubble over the cat in available area, in thought bubble show useful info.
 * it should appear randomly, with seamless animation, it should speak in cat
 * language").
 *
 * The useful info is the household's own record, read through this person's
 * session (`home/cat-facts.ts`): tonight's dinner, what is on the calendar
 * today and tomorrow, how much is on the list to buy — each said the way a cat
 * would ("Meow! Dal tadka for dinner tonight."). When nothing is on record the
 * cat keeps to its passing thoughts, written by the platform's model from no
 * household data (`home/cat-thoughts.ts`) or its built-in lines. The bubble
 * comes and goes at random moments (`CatThoughtBubble`).
 */
export async function HeroCatThought({ session, now }: { session: Session; now: Date }) {
  const { t, preferences } = session.locale;
  const { supabase, membership } = session;
  const householdId = membership.household.id;
  const timezone = membership.household.timezone;
  const language = preferences.language as LanguageCode;
  const today = localDay(timezone, now);
  const dayAfter = new Date(now.getTime() + 48 * 3600 * 1000);
  const key = platformKey();
  const model = key ? createThoughtModel(key.provider, key.key) : null;

  // The same reads Home's agenda uses, once per request; the cat keeps tonight and the next two days.
  const rows = homeRows(supabase, householdId, timezone, now.getTime());
  const [meals, events, toBuy] = await Promise.all([
    rows.meals.then((all) => all.filter((meal) => meal.onDate === today)).catch(() => []),
    rows.events.then((all) => all.filter((event) => event.startsAt.getTime() <= dayAfter.getTime())).catch(() => []),
    (async () => {
      const { count } = await supabase.from("shopping_list_entries").select("id", { count: "exact", head: true }).eq("household_id", householdId).eq("state", "to_buy");
      return count ?? 0;
    })().catch(() => 0),
  ]);
  const tomorrow = localDay(timezone, new Date(now.getTime() + 24 * 3600 * 1000));
  const facts = catFacts({
    meals: meals.map((meal) => ({ name: meal.name, slot: meal.slot, status: meal.status })),
    events: events
      .filter((event) => [today, tomorrow].includes(localDay(timezone, event.startsAt)))
      .map((event) => ({
        title: event.title,
        startsAt: event.startsAt,
        status: event.status,
        allDay: event.allDay,
        time: formatTime(timezone, event.startsAt),
        today: localDay(timezone, event.startsAt) === today,
      })),
    toBuy,
    now,
  });

  const said = facts.map((fact) => {
    const words = t(fact.key, fact.values as Record<string, string | number>);
    return words.charAt(0).toLocaleUpperCase(language) + words.slice(1);
  });
  let passing = catThoughts(language, model);
  if (said.length === 0 && passing.length === 0 && model) {
    await settleThoughts(language, FIRST_BATCH_MS);
    passing = catThoughts(language, model);
  }
  const voices = CAT_VOICES.map((voice) => t(voice, { fact: "{fact}" }));
  // Facts first and most often; a passing thought now and then, or when there is nothing on record.
  const thoughts = said.length > 0 ? passing.slice(0, 2) : passing.length > 0 ? passing : Array.from({ length: BUILT_IN }, (_, index) => t(`today.thought.${index + 1}` as Parameters<typeof t>[0]));
  return <HeroCatFigure facts={said} thoughts={thoughts} voices={voices} />;
}

/**
 * The cat and its bubble, in the room the header has (the owner, 2026-10-21:
 * "show a think bubble over the cat in available area"). On a phone the
 * scene's cat is cropped away, so the cat is drawn whole in its own row under
 * the greeting with the bubble beside it, never over any words. On a wider
 * screen the scene draws the cat, and the bubble finds the cat's head and sits
 * just above it, clear of the date card (`follow`).
 */
export function HeroCatFigure({ facts = [], thoughts = [], voices = [] }: { facts?: string[]; thoughts?: string[]; voices?: string[] }) {
  return (
    <>
      <div aria-hidden className="pointer-events-none relative z-10 -mt-2 flex items-end justify-end gap-1 px-4 pb-3 sm:hidden">
        <CatThoughtBubble facts={facts} thoughts={thoughts} voices={voices} className="mb-6 max-w-[13rem] min-w-0 flex-1" trail="toward-end" />
        <HeroCat className="h-auto w-[6.5rem] shrink-0" />
      </div>
      <CatThoughtBubble facts={facts} thoughts={thoughts} voices={voices} follow trail="start" className="pointer-events-none absolute z-0 hidden w-[13rem] sm:block" />
    </>
  );
}
