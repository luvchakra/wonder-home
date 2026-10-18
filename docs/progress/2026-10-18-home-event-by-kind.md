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

## QA cleanup

Recorded after the merge.
