# Home's next event says what kind it is (26-007)

**Date:** 2026-10-18 · **Story:** 26-007 (Done)

## What the owner reported

A screenshot of Home: "Bounce School Trip" under **Family moment**, with a heart and **Plan together**. "This is a school event, display events as per the type of event."

## Why it happened

The card took the first upcoming event that was protected, family time or an outing, and otherwise the next event of any kind. The heading, heart and "Plan together" were fixed whatever it picked. The school trip was protected, so it won. `CalendarItem` also had no tile for school events or appointments and fell back to a plain calendar.

## What changed

- **Which event.** The card takes the next family-kind event: family time, outing, birthday, gathering, travel or special occasion. Only when there is none does it take the next event of any kind.
- **How it reads.** The heading, its icon and the action follow the event's kind:
  - a school event reads "School event", with the school tile and **Open event** to that event's page;
  - an appointment reads "Appointment", with **Open event**;
  - every family kind keeps "Family moment" with **Plan together**.
- **`CalendarItem`** gives school events and appointments the calendar's own tiles (`CATEGORY_LOOK`).
- **The Protected badge** wraps under a short title instead of being cut under the action (rule 15).
- **Words.** The new words (`home.schoolMoment`, `home.appointmentMoment`, `homeScreen.openEvent`) are in all eight languages.

## Verified

- **Gates.** Typecheck and lint pass, and the i18n, component and web tests pass (77).
- **Browser**, at 360px and 1280px, signed in as a QA household on the live project:
  - a protected school trip on its own read "School event" with the school tile and "Open event", and the event's page opened;
  - with a family picnic three days later, the card showed the picnic as "Family moment" with "Plan together";
  - at 360px, "Protected" wrapped under "Sunday picnic" instead of being cut;
  - no errors and no horizontal scroll.

## Where the code lives

- `apps/web/app/_screens/home-dashboard.tsx` (the moment card)
- `packages/core/src/components/ui/calendar-item.tsx`
- The eight `packages/core/src/i18n/messages/{lang}.ts` catalogs and `areas/household/{lang}.ts`

## Also in this PR: HomeTalk floats on its own (04-022)

The owner asked for HomeTalk to float by itself when someone switches to another app mid-conversation.
- **What changed.** While a live conversation runs and isn't paused (`shouldArmFloat` in `components/ui/live-float.ts`), `LiveTalkProvider` keeps the floating window's hidden video armed and playing, with `autopictureinpicture` set. Leaving the app floats it where the phone allows: Safari does it by itself, Chrome through the media session's `enterpictureinpicture` action, and a hidden page asks once more, quietly.
- **What stays the same.** A refusal shows no notice. Closing the window keeps it armed, ending the conversation tears it down, and Float is still the manual way.
- **Verified.** Typecheck, lint and component tests pass. In the browser at 360px and 1280px:
  - the video was armed before any tap;
  - a hidden page floated with no notice;
  - Float, Bring back and End still worked;
  - there were no errors.
- **Still open.** A check on a real phone, which only the owner can do.

## Also in this PR: ingredients with amounts (25-014), HomePlaces and HomeBrain (24-009)

- **The ask.** The owner asked for three things:
  - raw items with a quantity each, in place of the ingredients text box;
  - a small Add a recipe link when a meal has no recipe;
  - recipes that keep their items and amounts properly.
- **Ingredient rows.** `IngredientRows` (kit) replaces the text boxes in three places: a meal's Ingredients, Add recipe, and Plan a meal's quick recipe. On the server, `meals/ingredient-lines.ts` reads the rows (`ingredientLinesFrom`, 14 tests).
  - **Recipes keep amounts.** `createRecipe` stores each line's amount and unit; before this, every ingredient was saved as 1 "unit".
  - **Add a recipe from a meal.** In Change meal, the link opens `AddRecipeSheet` outside the meal's form. The new recipe is then picked for that meal (`createRecipeAction` returns its id).
- **A fix along the way.** `mealShortfalls` read the "unit" placeholder as one piece, because `normalizeUnit` maps "unit" to pcs. Ingredients with no amount now say the amount isn't known (regression test in `shortfall.test.ts`).
- **The nav.**
  - Places is HomePlaces, listed under AI & Smart Tools after HomeSend.
  - HomeBrain Review is HomeBrain.
  - Renamed everywhere: nav labels, page titles, the landing page, HomeTalk's replies and screen words ("take me to HomePlaces"), and the help guide, all in eight languages.
- **Verified.** Typecheck, lint and help links pass, and the core and web tests pass. In the browser at 360px and 1280px on the live project:
  - rows saved 500 g, 2 pcs, 1.5 kg (typed as 1,5), and an item with no amount;
  - Add a recipe made 250 g rajma and 3 pcs tomato, picked the recipe, and the meal took both amounts;
  - units fit at half width;
  - there were no errors.
- **Still open.** 25-015: editing or removing a recipe. A recipe saved before this change keeps "amount not known" ingredients until it is added again.

## QA cleanup

Done after #232 merged:
- QA household `df2d0762-15e1-4c5a-ad25-5fd803bcc4b1` deleted with a scoped script that refused unless its only member was this session's QA user. A count across all 132 household tables found 0 rows left.
- QA account `eba77d28-c046-48ed-8e54-095aa068f0b3` deleted (`qa-test-user.mjs delete`).
- No Storage files were uploaded.
- Local scripts, screenshots and logs removed; dev server stopped.
