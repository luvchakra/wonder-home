# An event's "Where" is picked from Google Maps (26-014)

**Date:** 2026-10-19 · **Asked by:** the owner (a screenshot of Edit the plan: "make this Google maps enabled")

## What was done

- **The field.** Adding an event ("Plan something" on Home, Today, Family and the Calendar) and editing one ("Edit the plan") now search Google Maps for **Where**.
  - It is the same search the place book uses: `PlaceSearchField`, kind `place`, places near home first.
  - `EventPlaceField` in `_components/new-event-form.tsx` serves both sheets.
  - It is offered to adults on a deployment with a place search (`eventPlaceSearch`). Anyone else types the place, as before.
- **What is kept.** Only the picked place's id comes from the browser.
  - The server reads the place again (`eventPlaceFromForm` → `pickedPlace`), and `decideEventPlace` (`places/event-place.ts`) keeps Google's name, address and id: `family_events.location`, `location_address` and `location_place_id`.
  - Migration `20261019130000_event_place_from_maps.sql` was applied live.
  - Keeping the same place asks Google nothing.
  - A typed place such as "Home" is kept as written, with no address or id.
  - A pick that cannot be read right now keeps the typed words, so a save never fails on a provider outage.
- **Where it shows.**
  - The event page shows the address under the place name, with **Open in Google Maps**.
  - The guest invitation page (`/e/[token]`) has a directions card under the invitation.
  - A typed place has no link (`mapsLinkFor` returns null): "Home" searched on Google Maps would find somebody else's.
- **Help.** Calendar ¶3, in all eight languages, with new search keywords. The field's own words (`places.event.*`) are in every household catalog.

## Verified

- `event-place.test.ts`: 6 tests, covering pick, keep, typed, an unreadable pick, clearing, and the link.
- `npm test` passed: 3555 unit and 64 script tests.
- Typecheck, lint, `lint:migrations`, `lint:help-links`, `check:bundle`, security 12/12, eval 128/128 and the production build all passed.
- `test:db` 667/667, and `verify:live` 302/302.
- Browser, on the live project with the deployment's Maps key, on a QA household:
  - **At 360px:** an event with Where "Home" was opened, Lodhi Garden was searched and picked, and the event was saved.
  - **The row** then held Google's name, address and place id.
  - **The event page** showed the address and the Maps link.
  - **At 1280px:** the edit sheet reopened on the picked place.
  - **The guest page** at 360px showed the directions card. No horizontal scroll, no page errors.

## Still open

- Nothing for this story. A place picked for an event is not added to HomePlaces' place book; that is a separate choice for the owner.

## QA cleanup

Ran after #246 merged (2026-10-19): QA account `61c4f276-6d08-4cb4-82df-7835a6a0e947` and household `39856c7c-3e4e-4a8c-ae28-eb0b2f720b90` ("QA Maps Home", with its event and invite link) deleted. Confirmed by SQL: 0 households, events, members and auth users left for those ids. Scratch screenshots removed.
