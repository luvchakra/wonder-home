# HomePlaces shows every place picked with Google Maps (24-010)

**Date:** 2026-10-18 · **PR:** #233

## What and why

The owner added a home address, but it did not appear in HomePlaces. HomePlaces only listed the place book: places saved from HomeTalk, or added on its own screen. The owner asked that every address added anywhere appear there, using "wherever Google Maps is used" as the test.

Google Maps place pickers are used in four places:
- the home address (setup and Manage Household);
- each child's school (setup);
- each adult's office (Family);
- the place book itself.

Event and appointment locations are typed text, not Maps picks, so they are not part of this.

## What changed

- **Our places**, at the top of HomePlaces (`apps/web/app/places/page.tsx`).
  - It lists the home address, each child's school and each adult's office, built by `homeplaces/our-places.ts`. Siblings at one school, and colleagues at one office, share one row.
  - Each row opens in Google Maps. Its pencil goes to the one screen that edits it (rule 23): Manage Household for the home (Admins only), Kids & School for that child's school, Family for an office.
  - An Admin with no address on record sees **Add your home address**.
  - It reads only what the viewer's session may read, so RLS still decides who sees a school or an office.
- **A child's school can change after setup.** Before, a school could only be set during setup.
  - Kids & School's Overview has a **Schools** section, one row per child. The pencil opens the same Google Maps picker setup uses, or takes a typed name (`school/child-school.tsx`, `saveChildSchoolAction`, `_lib/places.ts`'s `saveSchoolFromForm`).
  - Leaving the field empty retires the school with `endEnrolments`. The row is kept, so its school items keep their history.
  - The field only changes a child.
- **The same school in Family.** The owner asked for a child's location in Family to be picked from Google Maps and to match Kids & School.
  - A child's details now use the same school picker, in place of the free-text "School or work location".
  - Both screens save through `saveSchoolFromForm`, so they always show the same school.
  - An adult's location is their Office picker, and only a helper keeps the free-text line.
  - A form without the free-text field leaves the stored value unchanged.
- **Words and help.** The words are in eight languages, and Help (Talk to WonderHome ¶11) explains Our places and where each place is changed.

## Verified

- **Gates.** Typecheck, lint and help links pass. Tests pass: `homeplaces/our-places.test.ts` (4), plus the core HomePlaces, school, i18n, help and navigation tests and the web tests.
- **Browser**, at 360px and 1280px on the live project with a QA household:
  - with no address on record, HomePlaces offered "Add your home address";
  - after Brigade Road was picked in Manage Household, a school on Kids & School and an office were added, Our places listed all three, each with a Maps link and the right editor link;
  - changing the school on Kids & School to Baldwin Girls' High School moved it in HomePlaces;
  - in Family, the child's details showed that same school with no free-text field, and picking Bishop Cotton Girls' School there changed it on Kids & School;
  - no errors and no horizontal scroll.

## Still open

The owner's next ask is queued as 08-010 to 08-012 and needs a migration:
- per child, the class teacher and the subject teachers;
- activities such as music, piano and karate, as folded rows with timings, the teacher, classes, competitions and medals;
- today's classes on the Calendar by default.

## QA cleanup

Checked on 2026-10-18 after the later merges (through #237): no `wonderhome-qa-verify.internal` account remains on the live project and no QA household this work created is left; the count was taken with `select … from auth.users where email like '%wonderhome-qa-verify.internal'`. Two older QA households from 2026-10-17 (`QA Welcome Home` b942c154…, `QA Hours Home` 7ab6da76…) could not be proven to be this work's and were left in place.
