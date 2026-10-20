# Location sharing, recipe ticks and sharing, a week template, "tomorrow" after midnight, and a round of screen fixes

2026-10-21 · PR #277

## What was done
- **01-014 Location sharing, by consent.**
  - Off until turned on: an adult or helper turns it on in Settings → Location sharing (`/settings/location`); a child's is turned on by a guardian or Admin in Family.
  - Positions come only from the member's own device while the app is open (`LocationReporter`). Only the latest is kept, rounded to about 11 m, and turning sharing off deletes it.
  - The household's adults see At Home / At school / Out · how long ago, with Open in Maps (`packages/core/src/location/sharing.ts`).
  - Migration `20261020233000_member_locations.sql`.
- **25-028 Recipes.**
  - Ingredients and steps tick off on screen only (kit `TickItem`).
  - Share a household recipe: WhatsApp gets a picture card (`/meals/recipe-card/[id]`, read under the member's session) with the full recipe as the message (`meals/recipe-share.ts`), plus other apps, copy, email and save picture.
  - The recipe filters show counts.
- **10-012 Week template** (built in parallel): several dishes per meal, and WonderHome plans each week from it into empty slots. Migration `20261020234000_meal_week_template.sql`.
- **04-029 "Tomorrow" just after midnight.** Before 4 am it means the day just begun (`conversation/temporal.ts`'s `tomorrowIn`). This is used by action grounding, HomeBrain's question window (which names the date) and `context/resolution.ts`. Asked at 12:02 am, "what's on tomorrow" had answered for the day after.
- **05-012 HomeBrain.** Opens on Registered; three counts in one row.
- **24-012 The place book.** Added by you comes first, then Saved from HomeTalk, and added places rank first. Migration `20261021001000_household_places_origin.sql`; existing rows are told apart by `kind`.
- **13-010 Home & Upkeep redesign** (parallel): Overview / Things / Requests, Coming up, and edit, retire and service actions.
- **21-009 Health.** One grouped Add instead of eight pills (kit `AddMenu`).
- **Smaller fixes:**
  - the bell shows that you are on Notifications;
  - policy and playbook rows use icon actions so names aren't squeezed.

## Verified
- Unit tests: 3,896 passed.
- DB tests: member locations 4/4, week template 5/5, isolation and set-form RLS.
- Typecheck, lint on changed files, help links, bundle, migration lint, tracker, eval gates (unsafe 0/19), security, production build.
- Browser at 360px against the production build:
  - ten changed screens with no horizontal overflow;
  - the share sheet, the recipe card PNG (200, image/png) and ticks;
  - the bell's `aria-current`.

## Open / needs a person
- Four migrations need running on the live project (SQL artifact): pet preferences, member locations, week template, place origin. They are in addition to AMAF, goal verification and sayings.
- Location sharing can't be exercised end to end until its tables exist.
- A HomeTalk answer described a waiting dinner without its day. The meal fact carries its date, so the line came from the waiting-item fact; it is not yet traced.
- Parallel work still running: the Voice settings simplification and the About page.

## Later the same day: live
- The owner ran the migrations. The cat's sayings ran as smaller pieces, but the Supabase editor miscounted apostrophes inside the dollar-quoted text, so the last 102 of 154 were loaded through the service-role client from the same list instead. The live table has 154.
- Checked end to end against the live database (a local production build), at 360px:
  - **Week template:** opening Plan filled this week's 4 remaining dinners, each marked WonderHome's pick with Choose again.
  - **Location sharing:**
    - an adult turns theirs on in Settings and a guardian turns the child's on in Family;
    - both phones' positions are stored, and Family reads "Out · this minute";
    - the child sees that a grown-up turned it on and has no Stop button;
    - Stop deletes the position.
  - **Cat:** the child's cat showed 4 sayings from the table and recorded each as heard.
- The run found a real defect. The Permissions-Policy header denied geolocation everywhere (`geolocation=()`), so no phone could ever report. It is now `geolocation=(self)` (`security/headers.ts`, test updated), alongside `microphone=(self)` for voice. Embedded frames are still denied.
- 01-014, 10-012 and 24-012 are now Done.
