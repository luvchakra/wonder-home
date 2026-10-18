# Decorated invitations, and five fixes from the owner's phone

**Date:** 2026-10-18 · **PR:** #236 · **Stories:** 26-009, 26-010, 08-014, 07-009, 07-010, 05-009, 26-011

## What was done

- **Decorated invitations (26-009).** An event's invite link wears one of nine
  designs: birthday, anniversary, wedding, festival, puja, housewarming, baby,
  get-together and classic (`packages/core/src/family/invite-templates.ts`:
  palettes, SVG garlands and corner ornaments, `suggestTemplate` by rules from
  the event's kind and title). Until the household picks one on the event page
  (`_components/invite-design-form.tsx`), the design follows the event. An
  optional line for guests (`invite_message`) is the only extra text a guest
  sees; notes never are. The guest page renders `InvitationCard` (kit), and
  `app/e/[token]/opengraph-image.tsx` draws the same design as a 1200×630
  postcard that WhatsApp shows large, with og:title/description from
  `generateMetadata`, in the household's language. Fonts are vendored in
  `apps/web/assets/invite/` and traced into the route; other scripts come from
  Google Fonts for just the characters used.
- **Birthdays as the whole day (26-010).** The member-occasion trigger wrote UTC
  midnight to midnight with `all_day = false`, so an Indian household's
  birthday read "5:30 am – 5:30 am". It now writes the household's local day,
  all day; the existing rows were moved (migration `20261018270000`).
- **Kids & School counts three across (08-014).** `ExpandableMetricRow`: stacked
  tiles whose labels wrap, one full-width panel below. Recorded in CLAUDE.md as
  rule 19's single, owner-approved exception.
- **Header tagline on one line.** Sized from the screen's width
  (`min(0.65rem, 2.4vw)`), so a phone's larger text setting can't wrap it; the
  name is capped the same way.
- **Looks after (07-009).** Add, change and remove a helper's responsibilities
  from their card (`HelperLooksAfter`, the Responsibilities form and actions);
  starter outcomes read by name, not key.
- **Leave over several days (07-010).** First day off, number of days, and a last
  day that fills itself in (or sets the number). "Which way" is gone; every day
  is written in one upsert (`recordLeave`, `leaveDates`, max 60).

- **Review many at once (05-009).** HomeBrain's list has Select: tick items (or
  Select all) and Confirm, Remove (asks first) or Later together
  (`reviewManyAction`). Single and bulk decisions share one `reviewItem` path
  in `certification-actions.ts`, so the trail is one decision per item. While
  selecting, each item is a compact row (claim, source, category) so nothing is
  squeezed.

- **Event cards (26-011).** Home's next-event card showed every member's avatar;
  it now names who is going from the event's own list, gives the title the full
  width and puts the action beside who is going. Every event list says when the
  same way (`_lib/event-when.ts`: "All day", never midnight), with its place;
  Today's rows wear the event's own kind and no longer truncate.

## Verified

- Typecheck; lint (0 errors); core unit tests 3445/3445, web 9/9; security
  12/12; eval gates pass (operations "not yet", unchanged); help links;
  `npm run tracker -- --check`; production build; bundle check.
- `test:db` 646/646, including new tests: a birthday is all day at local
  midnight; an event's owner sets the design and line, another member cannot;
  an unknown design and an over-long line are refused.
- Migration applied to the live project with the Supabase MCP tool; `npm run
  verify:live` 289/289 (new: `invite_template` landed, no timed member occasion
  left). The owner's own "Asmi Chakraborty's birthday" now reads 9 Dec, all day.
- Browser, against the live project with a QA account and household:
  - all nine postcards rendered;
  - a Hindi title rendered in Devanagari;
  - a full card (long title, place and line) fits whole;
  - the guest page at 360px and 1280px, no sideways scroll;
  - picking Festival and a line on the event page showed on the guest page;
  - the picker's names fit at 360px;
  - Kids & School's three tiles at 360px and 1280px;
  - the header at 16px and 20px text;
  - two responsibilities added to a helper from its card;
  - leave for 7 days recorded from the new form;
  - HomeBrain: two items confirmed together, then the rest removed together; the review trail held four decisions;
  - a school trip only the QA child goes to reads "With Asmi QA" on Family; a birthday reads "All day"; Home's card with nobody asked says so beside the ask button.

## Open / for a person

- WhatsApp keeps its own copy of a link preview it has already fetched, so a
  design changed after sending shows on the next new share.
- The rest of 26-003 and the owner's newer asks are queued as stories:
  - 08-015 timetable and exams;
  - 25-017 catalog ingredients with nutrients;
  - 25-018 suggest from what's at home;
  - Plan a meal recipe-first (25-019).
- QA cleanup: recorded after the merge.
