import { catThoughts, createThoughtModel, settleThoughts } from "@wonderhome/core/home/cat-thoughts";
import { CAT_VOICES, catFacts } from "@wonderhome/core/home/cat-facts";
import { platformKey } from "@wonderhome/core/ai/model-key";
import { listEvents } from "@wonderhome/core/family/repository";
import type { LanguageCode } from "@wonderhome/core/i18n/locales";
import { listMeals } from "@wonderhome/core/meals/repository";
import { HeroCat } from "@wonderhome/core/ui/cozy-corner-illustration";

import type { Session } from "../_lib/session";
import { formatTime } from "../_lib/session";
import { CatThoughtBubble } from "./cat-thought-bubble";

/** The cat's own passing thoughts, for when nothing is on record and no model has written any. */
const BUILT_IN = 8;

/** The bubble waits this long at most, once per server, for a first batch of passing thoughts. */
const FIRST_BATCH_MS = 1_200;

/** A local day, YYYY-MM-DD, on the household's clock. */
function localDay(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
}

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

  const [meals, events, toBuy] = await Promise.all([
    listMeals(supabase, householdId, { from: today, to: today }).catch(() => []),
    listEvents(supabase, householdId, { from: new Date(now.getTime() - 12 * 3600 * 1000), to: dayAfter }).catch(() => []),
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
 * The cat and its bubble. On a phone the scene's cat is cropped away, so it is
 * drawn whole in the corner with the bubble above it; on a wider screen the
 * scene draws the cat, and the bubble floats over its head, clear of the
 * greeting and the date card.
 */
export function HeroCatFigure({ facts = [], thoughts = [], voices = [] }: { facts?: string[]; thoughts?: string[]; voices?: string[] }) {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute end-2 bottom-2 z-0 flex w-[10rem] flex-col items-end sm:hidden">
        <div className="relative mb-1 me-5 min-h-[4.5rem] w-full">
          <CatThoughtBubble facts={facts} thoughts={thoughts} voices={voices} className="absolute end-0 bottom-0 max-w-[10rem]" />
        </div>
        <HeroCat className="h-auto w-[7.5rem]" />
      </div>
      <div aria-hidden className="pointer-events-none absolute start-[36%] top-5 z-0 hidden w-[13rem] sm:block">
        <CatThoughtBubble facts={facts} thoughts={thoughts} voices={voices} className="max-w-[13rem]" trail="start" />
      </div>
    </>
  );
}
