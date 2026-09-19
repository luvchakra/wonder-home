# The help guide no longer needs a login

**Date:** 2026-09-19
**Scope:** `/help`, route policy
**Status:** Done

## What was wrong

`/help` was in `AUTHENTICATED_PREFIXES`, so an anonymous visitor asking for it
was bounced to sign-in.

That is backwards for this particular page. Somebody deciding whether to trust
a product with their home should be able to read what it will and will not do
*before* creating an account — and somebody who cannot get in is exactly the
person who needs the help page. A guide behind a login answers neither of them.

Nothing in the guide is about a particular household: it is `help/guide.ts`,
sixteen static sections and ten FAQ entries describing the product. There was
nothing there to protect.

## What changed

`/help` is out of `AUTHENTICATED_PREFIXES`, with a note next to the list saying
why it is deliberately absent — an unexplained gap in a security list is an
invitation to close it again.

The page now takes an **optional** session (`optionalSession()`, which never
redirects — a public page that bounces a visitor to sign-in is not a public
page). Signed in it sits in the app shell exactly as before; signed out it gets
its own frame with the wordmark, a link home and the botanical corner the other
signed-out surfaces use.

The two calls at the foot of the guide reach into a household — "Talk to
WonderHome" and "Check what WonderHome believes". For a signed-out reader those
are replaced with *Get started* and *Sign in*, rather than links that would
bounce them to a login and lose their place in a long page.

The guide assistant needed no change: `askTheGuide` was already session-free,
searching the static guide deterministically.

## What was verified

- `npm run typecheck`, `lint` — clean
- `npm run lint:secrets` — passed, 463 files
- `npm run test` — 1021 passing; one new route-policy case asserting `/help`
  is public in both directions
- `npm run security` — 9/9
- `npm run build` — succeeded
- `npx playwright test` — 236 passing, including two new cases: an anonymous
  visitor reads the whole guide, and is offered the way in rather than a link
  that bounces them
- **Driven in a browser signed out**: the page returns 200 with no redirect,
  renders fully, and the guide assistant answers a question with no console
  errors

`/help` was removed from the gated-areas sweep in `shell.spec.ts`, so the
replacement is an assertion that it is reachable rather than a silent gap.

## Note

The security suite's session-abuse count moved from 11 to 12 with the new
route-policy case, and its note said so — which is the deletion detector from
15-008 behaving exactly as intended on an addition.
