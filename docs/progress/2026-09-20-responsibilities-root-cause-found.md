# The actual root cause of the Responsibilities crash, found and fixed

**Date:** 2026-09-20 · **Kind:** bug fix (the real one, this time)

## Why this note exists

Responsibilities crashing in production was reported three times this
session. The first fix guarded one query with no stack trace to confirm it
was the actual cause. The second added app-wide error boundaries — a real
and necessary gap (nothing in the app had one), but it was explicit that
"the underlying throw is still unidentified." Now, with a real seeded
household and production database access, the user hit the exact same
crash a third time — which meant the first two fixes had made the failure
land more gracefully, but had not stopped it happening.

## What was actually wrong

`household/responsibilities/page.tsx` (a Server Component) resolves each
row's icon with `iconForOutcome(outcomeKey)` — a pure function returning a
Lucide icon **component reference** — and was putting that reference
straight into the `card` object passed as a prop to `<ResponsibilityRow>`,
a `"use client"` component:

```tsx
<ResponsibilityRow card={{ icon: presentation.icon, tone: presentation.tone, ... }} ... />
```

A React component is a function. Next.js's Server Components architecture
can render a component directly in a Server Component's own JSX — that
becomes plain HTML, nothing to serialize — but it cannot serialize a
function **value sitting inside a prop** and ship it to a Client Component
for hydration. That crossing is exactly where this threw, and it threw
**after** `renderResponsibilities` had already returned its element tree,
which is why neither of the two earlier fixes caught it: the page-level
try/catch (PR #36) only wraps the synchronous call that builds the tree,
and the new `error.tsx` boundary (also PR #36) is a client-side React error
boundary — the right tool for this, which is exactly why it started
showing an on-brand card instead of a bare platform crash, but it could
only contain the symptom, not remove it.

**Why only this page.** `iconForOutcome`'s result is used in four places.
Three of them — Family, Notifications, and Household Activity — call
`<IconTile icon={presentation.icon} tone={presentation.tone} />` directly
inside the *server* component's own JSX. No client boundary, no
serialization, no problem. The fourth, `AgendaRow`, is itself a client
component but resolves its own icon internally from a plain string prop
(`kind`) via a lookup table defined in the same file — also never crossing
the boundary as a raw value. Responsibilities was the only place the two
were mixed: a client component, receiving the icon as an external prop.

**Why it needed real data to surface.** `responsibilities.playbook_item_id`
had never been populated before this session's seed — every row's joined
`playbook_items` came back `null`, so `item?.name` always fell through to
`row.outcome_key.replace(...)`. The icon, though, comes from
`iconForOutcome(row.outcome_key)` regardless of whether a playbook item
exists — so the crash was always live for anyone with even one
responsibility row, seed or no seed. That the user's own two original
manual test rows apparently never got looked at signed-in as an admin
before is the only reason it wasn't caught the first time round.

## The fix

`ResponsibilityRow` now takes `outcomeKey: string` instead of a resolved
`icon`/`tone`, and calls `iconForOutcome` itself, client-side — the same
shape `AgendaRow` already uses. `card`'s type no longer includes
`icon`/`tone` at all (`Omit<ResponsibilityCardProps, "onExpand" | "icon" |
"tone">`), so passing them back in from a server page is now a compile
error, not just a convention to remember.

## How this was actually found

Guessing was retired this time. With production database access, every one
of the household's five real responsibility rows was rendered through the
*actual* `ResponsibilityRow` and `AddResponsibilityButton` components via
`react-dom/server`'s `renderToStaticMarkup`, fed the exact real data —
which passed clean, and correctly so: plain React SSR doesn't enforce the
RSC serialization boundary, so it could never have shown this class of bug.
That negative result, plus a `detectConflicts` unit check (also clean) and
a grep across every other `iconForOutcome` call site, narrowed it to
exactly one candidate: the one place the icon crossed into a client
component as a prop instead of being rendered directly. The diagnosis
rests on that contrast, not on reproducing the exact runtime error, since
minting a real authenticated session for a genuine `next dev` request
would have needed the project's JWT signing secret, which nothing here has
or should try to obtain.

## Verified

`PGHOST=localhost … npm run verify` — typecheck (which now rejects the
broken prop shape at compile time), lint, all other lints, security, unit,
DB tests, build, 252 e2e — all passing. Not verified: an actual production
request, for the reason above. The user reloading `/household/responsibilities`
after this deploys is the real confirmation.

## Where

`apps/web/app/_components/responsibility-controls.tsx`,
`apps/web/app/household/responsibilities/page.tsx`.
