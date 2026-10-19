# The invitation link carries the guest's name

**Date:** 2026-10-19 · **Asked by:** the owner ("auto populate the guest name based on what's selected before sending the invitation", with a screenshot of the guest reply page's empty "Your name")

## What changed

A phone's share sheet never tells a web page which contact was chosen, so the name has to be picked in WonderHome before the link is shared.

- **Sender** (`_components/event-controls.tsx`, `EventLinkShare`): a "Who is it for? (optional)" field above the link. Where the browser has the Contact Picker API (Android Chrome), a **Pick from contacts** icon button (accessible label, rule 11) fills it from the phone's contacts — one contact, name only, chosen by the person each time; nothing of the address book is read otherwise. The link shown, copied and shared becomes `/e/<token>?to=<name>`, and the share text becomes "Priya, you're invited: Diwali at ours". The invitation picture is unchanged.
- **Guest** (`e/[token]/page.tsx`, `event-reply-form.tsx`): the page reads `?to=` through `guestNameFrom` — control characters dropped, spaces collapsed, cut to the form's 80 characters — and "Your name" opens already filled; the guest can change it. A link without `?to=` behaves exactly as before. The name in the URL is never trusted for anything but that default: the reply is still written from what the form posts.
- **Words** (`events.link.forLabel`, `forHint`, `pickContact`, `shareTextFor` in all eight event catalogs) and a sentence in the calendar help section ¶8, all eight languages.

## Verified

- Typecheck, `npm run lint`, `npm test` 3575 + 64, `lint:help-links`, `check:bundle`.
- **Browser, 360px and 1280px, local build against the live project** with a faked Contact Picker: Pick from contacts fills "Priya Sharma", the shown and copied link ends in `?to=Priya%20Sharma`, the guest page opens with "Your name" = "Priya Sharma", `?to=%00%20%20%20` leaves it empty, no horizontal scroll, no page errors.

## Where the code lives

`apps/web/app/_components/event-controls.tsx`, `apps/web/app/_components/event-reply-form.tsx`, `apps/web/app/e/[token]/page.tsx`, `apps/web/app/family/events/[eventId]/page.tsx`, `packages/core/src/i18n/messages/areas/events/*.ts`, `packages/core/src/i18n/messages/areas/help/*.ts`.

## QA cleanup

Recorded after the merge.
