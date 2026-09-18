# Landing page: no video, informative devices, contact and a real footer

**Date:** 2026-09-19 · **Kind:** design (user request, outside the backlog)

## What was reviewed and what was already there

Parallax and hero motion were already in place — `data-parallax` on the hero
art and the section visuals, `wh-rise` on the hero, `wh-reveal` on everything
that scrolls in, all of it disabled under `prefers-reduced-motion` and all of
it readable before any of it runs. Nothing was added there.

## What changed

**The video call to action is gone.** The approved sheets show "Watch Video";
there is no video, and a button that opens nothing is exactly what this page
avoids elsewhere. It is now "Explore what it does", pointing at the features.
An E2E test fails if a watch/video/play link or a `<video>` element ever
appears.

**The device section informs rather than decorates.** It used to show a
laptop and a phone beside a paragraph about syncing. Each frame now carries a
number and a sentence saying what that screen is actually for — the whole
household on desktop, five areas and the assistant on a phone, and asking in
your own words — under a line that says these are the real screens rather
than pictures of them.

**A contact section closes the page.** The email address is configuration
(`NEXT_PUBLIC_CONTACT_EMAIL`), the same discipline as Google sign-in: a
mailto addressed to nobody is worse than offering the routes that work. Where
it is unset, the section offers the account and the guide instead.

**The footer is three columns and every link resolves.** Product, Get
started, More — plus the year and the one promise worth repeating. A test
walks every footer link: anchors must land on an element that exists, and
paths must answer 200 or a redirect, never a 404.

**Terms and privacy now exist**, because sign-up has always said "you agree
to our Terms of Service and Privacy Policy" with nowhere to go. `/legal` does
not invent legal text — it says plainly that formal documents are not
published yet, and describes what the software actually does with a
household's data today, which is the part a family can check against the
product.

## Verified

Typecheck, lint, secret lint, 738 unit tests, production build, full E2E 198
passed — including no horizontal overflow at 360px, which is what guards the
new footer and contact grid on a phone.

## Still open — needs a person

- Set `NEXT_PUBLIC_CONTACT_EMAIL` to switch the contact section to email.
- There is no demo page to link to, which the request allowed for.
- Formal terms and a privacy policy still need writing by someone qualified;
  `/legal` is honest about their absence rather than a substitute for them.

## Where

`apps/web/app/_screens/landing.tsx`, `apps/web/app/legal/page.tsx`,
`packages/core/src/config/contact.ts`, `apps/web/app/sign-up/page.tsx`,
`e2e/landing.spec.ts`, `design/DESIGN-NOTES.md`.
