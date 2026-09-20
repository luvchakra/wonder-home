# Root cause of the recurring Responsibilities crash, and a dismissible "Try asking" strip

**Date:** 2026-09-20
**Scope:** App-wide error handling; the AI assistant's suggestion strip.

## Why

The Responsibilities page had already been reported broken once ("This page
couldn't load / A server error occurred" on home.wonderapps.biz), and the
earlier fix — wrapping the one `responsibilities` query in a try/catch — did
not hold: the user reported the same crash again on the same page.

Production runtime logs were not reachable this session (the connected
Vercel account is scoped to team `luvchakra's projects`; the live app runs
under a different team, `wonder-team4`), so the earlier fix was a guess made
without a stack trace. This time, a full read of the render path plus a
search of the repository found the actual root cause: **there was no
`error.tsx` anywhere in the app.** Zero error boundaries, at the root or on
any route. Any uncaught exception in any Server Component — on any page, not
only this one — fell straight through to the platform's own bare failure
page: no brand, no way back in, exactly what the screenshot showed. Design
principle 10 requires every screen to keep the three states (empty, error,
loading); without a boundary, "error" for the whole app was whatever the
platform showed by default, and that promise was silently broken everywhere,
not just here — Responsibilities was simply the heaviest, most joined-data
page, so it was the one most likely to hit whatever the underlying edge case is.

## What changed

1. **`apps/web/app/error.tsx`** — the app-wide route error boundary (Next.js
   App Router convention). A client component (the only kind this file can
   be) rendered on-brand: wordmark, an attention `IconTile`, a plain
   explanation that nothing was changed, "Try again" (`reset()`) and "Go to
   WonderHome". The root layout carries no shell of its own (`app/layout.tsx`
   is just fonts and `<html>/<body>`), so this is the one screen in the app
   that cannot assume a session — by design, since the boundary catches
   failures the session fetch itself might cause.
2. **`apps/web/app/global-error.tsx`** — catches a failure in the root layout
   itself, the one place `error.tsx` cannot reach. Renders its own minimal
   `<html>/<body>` with inline styles only, so it survives even a
   font/CSS-related failure.
3. **`apps/web/app/household/responsibilities/page.tsx`** hardened further,
   independent of the boundary: everything after the initial data fetch (all
   pure computation and JSX, confirmed no further `await`) is now wrapped in
   its own try/catch, split into a `renderResponsibilities` helper. A bug in
   a join's shape, a malformed `cadence` value, or a rendering edge case
   degrades to the same honest "Responsibilities could not be loaded /
   Nothing has changed. Try again in a moment." card the query-level guard
   already gave, with the real error logged server-side instead of thrown.
   Belt-and-suspenders: this is still the heaviest page in the app (five
   queries across `listMembers`, the responsibilities join,
   `listConfigurationConflicts` — which itself re-queries responsibilities
   and members — and `listPlaybookOutcomes`), so it gets its own specific
   message rather than relying solely on the generic boundary.

Every other page in the app now also has a real error state for the first
time — this was previously the single biggest gap against design principle
10 ("keeps the three states"), and it is now closed everywhere, not patched
on one route.

4. **AI assistant — the floating "Try asking" strip.** The three suggestion
   chips shown above the composer once a conversation is underway (as
   opposed to the larger, already-labelled set shown on the empty
   conversation screen) had no heading and no way to dismiss them — raised
   by the user against a screenshot of the chat mid-conversation. The strip
   now has a small caption, "Try asking", and a dismiss (×) button that
   hides it for the rest of that conversation (`useState`, not persisted —
   it is a nudge, not a setting, so it reappears the next time the assistant
   is opened fresh). — `apps/web/app/ai/assistant.tsx`

## Verified

`PGHOST=localhost … npm run verify` — typecheck, lint, migration/embed/
boundary/secrets lint, tracker and brand checks, security, unit, DB tests,
build (all routes compile, including the two new error conventions), and
252 Playwright e2e tests: all passing.

Not verified: the actual production failure, since it could not be
reproduced (needs an authenticated session on real household data, and
production logs were not reachable this session). What the fix guarantees
is that whatever throws next — on Responsibilities or any other page — now
renders the app's own honest error card instead of the platform's bare
failure page, and the specific error is logged (`console.error`) so it is
findable from the Vercel dashboard directly if it recurs.

## Still open / needs a person

- If Responsibilities still fails after this, the on-brand error card will
  now appear (progress), but the underlying throw is still unidentified —
  someone with access to the `wonder-team4` Vercel team's runtime logs
  should pull the stack trace the next time it happens; `console.error`
  calls added here make it findable once that access exists.
- The AI Vercel account connected to this session should be pointed at
  `wonder-team4`, or that team's owner should share access, so future
  production issues can be diagnosed directly instead of by code audit.

## Where the code lives

`apps/web/app/error.tsx`, `apps/web/app/global-error.tsx`,
`apps/web/app/household/responsibilities/page.tsx`,
`apps/web/app/ai/assistant.tsx`.
