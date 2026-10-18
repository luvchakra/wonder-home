# HomePlaces: places near the office, Add a place, and work facts in Family

**Date:** 2026-10-18 · **Stories:** 24-005, 24-006, 24-007 (In Progress: browser check to do)

## What was done
- **Places near the office (24-005).**
  - An adult's office is picked from Google Maps, never typed, because HomePlaces needs the point. The person picks it in Settings, and an Admin can pick it for any adult in Family.
  - It is stored in `member_work_places`: the person or an Admin writes it, and adults and Admins read it. A child and a helper never see anyone's office.
  - "Somewhere for lunch near my office" and "a café near Rohan's work" anchor there, through `homeplaces/request.ts`'s work anchor and `service.ts`'s `workAnchor`.
  - With no office picked, HomeTalk says where to add it (`needs_work`).
- **Add a place (24-006).** `/places` gives adults a search, kind `place`, leaning toward home.
  - They pick a result, add an optional note and save.
  - The browser sends only the place id. `addPlaceAction` reads the place again from the provider and saves it through `markPlace`.
  - Each save counts against the household's `places.find` budget.
- **Work facts (24-007).** Family's member detail now shows how a person works and their office, next to their office hours.
- **Words.** The new strings are in all eight languages, and there are two new HomeTalk help paragraphs (offices, adding a place). What's new has an entry, `officePlaces`.

## Verified
- `test-work-places-rls.mjs`: 6/6.
- Migration `20261018150000_member_work_places.sql`: applied live through the Supabase MCP, with 4 policies confirmed by query.
- HomePlaces unit tests pass, and `npm run eval` is 111/111 (new case HT-81).
- Typecheck and lint pass, and help links resolve.

## Still open
- A browser check at 360px and desktop: the office picker, the Add a place form, and the Family facts. This session has no QA credentials.
- The place book's lede still says places come "from HomeTalk". It can mention Add a place in a later wording pass.
