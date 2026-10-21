import { catThoughts, createThoughtModel, pickThought, settleThoughts } from "@wonderhome/core/home/cat-thoughts";
import { platformKey } from "@wonderhome/core/ai/model-key";
import type { LanguageCode } from "@wonderhome/core/i18n/locales";
import { HeroCat } from "@wonderhome/core/ui/cozy-corner-illustration";

import type { Session } from "../_lib/session";

/** The cat's own lines, for when no model has written any yet. */
const BUILT_IN = 8;

/** The bubble waits this long at most, once per server, for a first batch. */
const FIRST_BATCH_MS = 1_200;

/**
 * Home's cat, whole, with what it is thinking (the owner, 2026-10-21: "show
 * the max possible portion of cat, it should be moving a bit … use ai to create
 * something new on every page load"). Phones only: on a wider screen the cozy
 * corner draws the cat whole in its own scene. The thought is decoration — a
 * cat's whimsy, never something a person needs — written by the platform's
 * model from no household data (`home/cat-thoughts.ts`), a different one each
 * load, and one of the built-in lines while there are none.
 */
export async function HeroCatThought({ session }: { session: Session }) {
  const { t, preferences } = session.locale;
  const language = preferences.language as LanguageCode;
  const key = platformKey();
  const model = key ? createThoughtModel(key.provider, key.key) : null;
  let thoughts = catThoughts(language, model);
  if (thoughts.length === 0 && model) {
    await settleThoughts(language, FIRST_BATCH_MS);
    thoughts = catThoughts(language, model);
  }
  const picked = pickThought(thoughts, BUILT_IN);
  const thought = "line" in picked ? picked.line : t(`today.thought.${picked.builtIn}` as Parameters<typeof t>[0]);
  return <HeroCatFigure thought={thought} />;
}

export function HeroCatFigure({ thought }: { thought: string | null }) {
  return (
    <div aria-hidden className="pointer-events-none absolute end-2 bottom-2 z-0 flex w-[9.5rem] flex-col items-end sm:hidden">
      {thought ? (
        <div className="relative mb-1 me-6 max-w-[9.5rem]">
          <p className="wh-rise rounded-[1.25rem] bg-[var(--wh-surface)] px-3 py-2 text-[0.8125rem] leading-snug text-[var(--wh-foreground)] shadow-[var(--wh-shadow-card)]">
            {thought}
          </p>
          {/* The little trail of a thought, down to the cat. */}
          <span className="absolute -bottom-2 end-5 size-2.5 rounded-full bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]" />
          <span className="absolute -bottom-4 end-3 size-1.5 rounded-full bg-[var(--wh-surface)] shadow-[var(--wh-shadow-card)]" />
        </div>
      ) : null}
      <HeroCat className="h-auto w-[7.5rem]" />
    </div>
  );
}
