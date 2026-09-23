# HomeTalk 2.0, part 2: corrections, multi-step and cross-domain requests (Wave 4, story 14-012)

**Date:** 2026-09-23 · **Area:** HomeTalk / conversation engine · **Spec:** `design/HOMETALK-2.0-WAVE-4.md` §9–§12

## What this part does

Part 1 made HomeTalk understand *what the household meant*. Part 2 is about
how it acts: fixing what it just did, doing several things from one
sentence, and working across domains. It also stops saying "Done" when
nothing was written.

### Corrections (§9)

- **What a correction looks like.** `conversation/corrections.ts` reads the
  three shapes the spec names, plus their everyday variants:
  - "Not milk, almond milk" (and "not the milk but the almond milk");
  - "No, I meant Manan";
  - "Actually, make that Friday" (and "change it to next Monday", "actually
    it's Friday").
- **What it corrects.** The route builds a list of candidates, newest first:
  - the proposal still waiting for a yes, within the same 10-minute window
    a "yes" has;
  - what HomeTalk did in this session in the last 30 minutes.

  The first request the correction fits, and would actually change, is the
  one it corrects. So "not milk" corrects the add, not the reminder made
  straight after it. "Make that Friday" never turns an item into one called
  "Friday".
- **Before anything was written.** The waiting proposal is marked rejected,
  and the corrected one is proposed in its place.
- **After something was written.** The executor undoes the earlier write
  through its own domain service, then makes the corrected one. The reply
  says both, prefixed with "Changed: milk, bananas → almond milk, bananas."
  - A list item is retired with `retireConsumable`. Only what HomeTalk itself
    added comes off: something already on the list stays, and so does
    anything the corrected request still names. "Not milk, almond milk"
    after "add milk and bananas" leaves the bananas alone.
  - An absence is freed with `recordAvailabilityException`.
  - A reminder is expired.
  - Anything with no undo service (a meal) is refused, and nothing changes.
- **Hidden history.** None of this is invisible: the original action and its
  corrective action both stay in the conversation's record.

### Several things at once (§10)

- **Several items in one add.** "Add milk and bananas" and "we need milk,
  eggs and bread" are one add with several items. Each item is matched
  against the list, added, or found already there on its own. The reply
  says which was which.
- **Several requests in one sentence.** `conversation/decompose.ts` splits a
  sentence into its requests. It is deterministic and conservative: it only
  splits where "and", "then", a comma or a full stop comes before a word
  that starts a request. "Mac and cheese" stays one dish, and "remind me to
  buy them" stays whole.
- **Each part on its own.** Each part is understood, grounded, gated and
  carried out through the same engine. The model reads only that part,
  through the same minimisation (`understandPart`). Each part becomes its
  own reply with its own Action Preview, and the client renders all of
  them.
- **The premise rule.** A part that leans on an earlier one ("buy *them*",
  "we have *everything*") reads only what the earlier parts of the same
  request actually wrote. It is held back, and says so, when an earlier part
  failed, is waiting for a yes, or asked a question. A question in the
  middle stops the request there, so the next turn is read as its answer.
- **Several proposals waiting.** A bare "yes" or "no" asks which one is
  meant. "Yes to both" settles them all, each through its own governed
  write.
- **Reminders are real.** "Remind me to buy them tomorrow" (a new
  `set_reminder` intent) becomes a notification addressed only to the
  speaker, scheduled in the household's timezone:
  - a day alone means 09:00;
  - a part of the day means the start of its window (evening is 17:00);
  - a time that was said wins.

  The Notifications inbox and the unread badge now read `scheduled_for`, so
  a held reminder appears when it falls due and not before. A consequence:
  a due notification still in `generated` is now shown in the inbox too. It
  was already counted in the badge but never listed. The row is inserted
  with the service client, because `notifications` has no INSERT policy for
  anyone, and its recipient is always the speaker. A reminder can be marked
  Done on its card, or cancelled or moved by correcting it in HomeTalk.

### Across domains (§11)

- **Planning a meal.** "Plan pasta for tonight" is a meal when it names a
  meal of the day, or matches one of the household's own recipes
  ("pasta" → "Tomato pasta" when only one fits). Anything else ("a picnic")
  stays a plan on the family calendar. The new `plan_meal` intent writes
  through the same `createMeal` and `attachIngredients` the Meals screen
  uses. It is gated by the `meals.planning` entitlement and by the meals
  outcome's autonomy; by default that means it needs a yes.
- **"Make sure we have everything."** This reads the ingredients of the meal
  just planned, or of the recipe named. They go through the same multi-item
  add, and the reply says what it could check: "I cannot see what is in the
  kitchen, so I checked what tomato pasta needs against the groceries…".
  With no recipe on record, HomeTalk asks what to add rather than inventing
  ingredients.

### Never "Done" when nothing was written (§12)

An add where everything was already on the list now shows **"Nothing to
change"** in the Action Preview, not "Done". The flag comes from the
executor's own result (`alreadyTracked`), through `unchangedResult`.

## Verified

- **Gates:** `npm run verify` passed:
  - typecheck and lint;
  - the migration, embed, boundary and secret lints;
  - the tracker and brand checks, and the security check;
  - 2115 unit tests;
  - 414 database tests, the build, and 364 Playwright tests.

  43 unit tests are new since part 1: `corrections.test.ts`,
  `decompose.test.ts` and `operations.test.ts` (executors against stubbed
  domain services), plus additions to `grounding.test.ts` and
  `rules.test.ts`. No migration was needed.
- **Live QA** through the real, signed-in conversation route on the Part 1
  QA household (Priya, Asmi, Manan, Sunita), with a "Tomato pasta" recipe
  seeded. Each result was checked in the database:

  | Said | Result |
  |---|---|
  | "Add milk and bananas, and remind me to buy them tomorrow" | Two replies: both items added; a reminder held for 09:00 IST tomorrow, reading "Buy milk and bananas". |
  | "Not milk, almond milk" | Milk retired, almond milk added, bananas untouched. |
  | "Plan pasta for tonight and make sure we have everything" (free plan) | Meal planning refused as not in the plan, and the second part held because of it. |
  | The same, on a pro plan | "Plan Tomato pasta for dinner tonight" waited for a yes; the second part was held with a reason. |
  | "yes", then "make sure we have everything" | The meal was planned with its 4 ingredients; pasta, tomatoes, basil and parmesan were added with the kitchen caveat. |
  | "Sunita is away tomorrow", then "No, I meant Manan" | "Changed: Sunita → Manan", a new proposal for Manan, and the old one rejected. |
  | "Remind me to call the electrician tomorrow", then "Actually, make that Saturday" | The first reminder expired and a new one was held for Saturday 09:00. |
  | "yes" with two proposals waiting | Asked which, and offered "yes to both". |
- **Browser:** checked at 360px and 1280px, with no horizontal scroll:
  - a multi-part request typed into HomeTalk rendered both replies and
    their previews;
  - Notifications was empty while the reminders were not due;
  - once a QA reminder was moved into the past, it appeared with Done and
    the unread badge.
- **Live QA found and fixed four bugs, each with a regression test or a
  guard:**
  - A correction went to the newest action even when it did not fit it.
  - A day correction could hit an old proposal from outside its time
    window.
  - A correction that changed nothing still counted as a fit.
  - "Tomorrow evening" was not read as a reminder's time.

## Still open

- **Part 3** (`design/HOMETALK-2.0-WAVE-4.md` §13–§23):
  - the §17 model prompt contract: local date/time, grounded entities and
    pending state sent to the model;
  - the ContextualIntent references schema and the §20 confidence wording;
  - the voice low-confidence confirm check;
  - the §21 examples and the §22 evaluation matrix as tests;
  - marking story 14-012 Done.
- **Correcting one item does not update a reminder built from it.**
  Correcting "milk" to "almond milk" leaves an earlier reminder reading
  "buy milk and bananas".
- **A planned meal cannot be undone from HomeTalk yet.** The Meals domain
  has no cancel service to call, so HomeTalk refuses and says so. Change it
  on the Meals screen.
- **Push and email delivery of reminders** go through the delivery-channel
  work (06-008). The in-app inbox is what is live today.
- **QA data** from this part is on the Part 1 QA household
  (84165c18-1d87-4e64-a5b3-2988802380fa), including a `household_subscriptions`
  row on `pro`. It is all removed with that household once Wave 4 merges.

## Where the code lives

- `packages/core/src/conversation/`:
  - `corrections.ts`, `decompose.ts` (+ tests) and `operations.test.ts`;
  - `executor.ts`: multi-item add, `plan_meal`, `set_reminder`, and undo
    for corrections;
  - `grounding.ts`: meals, ingredients and reminders;
  - `rules.ts`: several items, "add X", reminders, "make sure we have
    everything";
  - `intent.ts` and `proposal.ts`: the new intents;
  - `references.ts`: focus from what was written;
  - `repository.ts`: `recentExecutedActions`, `openProposals` and
    `unchangedResult`.
- `packages/core/src/meals/repository.ts`: `listRecipeNames` and
  `ingredientNames`.
- `packages/core/src/ai/model-client.ts`: the new actions described to the
  model.
- `packages/core/src/components/ui/action-preview.tsx`: the "Nothing to
  change" state.
- The conversation route: correction subjects, the multi-part path, "yes to
  both", and `understandPart`.
- `apps/web/app/ai/assistant.tsx`: several replies per turn.
- `apps/web/app/notifications/page.tsx` and `apps/web/app/_lib/session.ts`:
  reading `scheduled_for`.
