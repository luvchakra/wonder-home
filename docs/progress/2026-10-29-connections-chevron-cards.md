# Connections page — one chevron card per connection (2026-10-29)

Owner instruction (2026-10-29): "Make all these as chevron cards and put all the
connection related details under those chevron cards … if they disconnect, it
just becomes a simple card with the option to connect. This page should have
only these chevron cards, and the rest of the connection detail should go inside
these chevron cards."

## What was done

`/settings/connections` is now nothing but **per-connection chevron cards**.
Each connection is one card: collapsed it shows a tinted `IconTile`, the name and
a status badge; expanded it shows that one connection's whole detail.

The crux was splitting `integrations-section.tsx`'s single "Providers" grid (one
card holding a tile per kind) into individual status-driven cards, and dropping
the cross-cutting "Needs you" banner and the explanatory footer card so the page
is only cards (the closing handwritten `QuoteCard`, a design principle, stays).

Two kinds of card, enforced by `apps/web/app/_lib/connection-cards.ts`
(`connectionCardShape`):

- **User-connectable** — School, WhatsApp, Voice, the named Connections,
  Shopping/Instamart, Calendar, Email. Collapsed shows status; expanded shows
  the detail and (where it exists) a Connect/Disconnect control.
- **Deployment-level** — Weather, Payments, smart home, and anything whose
  credentials are not set. Honest status only ("Set up by your administrator" /
  "Not configured"), **never a Connect button** — the external-providers
  invariant (`docs/external-providers.md`): never offer a connect flow that
  isn't real. A provider becomes user-connectable only if/when it genuinely is.

## Where the code lives

- `apps/web/app/_components/provider-card.tsx` — the presentational chevron card
  (built on the shared `@wonderhome/core/ui/collapsible-section`). It refuses to
  render an `action` when `connectable` is false, so no deployment-level card can
  show a Connect button.
- `apps/web/app/_lib/connection-cards.ts` — pure card-shape logic
  (`connectionCardShape`, `isDeploymentLevelKind`).
- `apps/web/app/_lib/connection-card-labels.ts` — the status badge words.
- `apps/web/app/settings/connections/integrations-section.tsx` — Weather,
  Payments, smart home (with devices) as deployment-level cards + Developer access.
- `apps/web/app/settings/connections/page.tsx` — composes the flat card list.

## Composable detail slots for two follow-on sessions

Calendar and Email are their own card files so the next two sessions drop their
managers in cleanly (merge order: this redesign → calendar-subscriptions →
email-allowlist):

- `apps/web/app/settings/connections/calendar-section.tsx` — SLOT marked in the
  card body for the calendar-subscriptions session (session_01R5Xz6YsajwJfvSAE48ouV6)
  ICS-subscription manager.
- `apps/web/app/settings/connections/email-section.tsx` — SLOT marked for the
  email-allowlist session (session_01R5Xz6Z4dGALJBsm1SxCcce) `EmailConnection`
  component. Until then both cards show their status + a short "managed here"
  placeholder (`manage.integrations.managerSoon`).

Those sessions replace the one marked `<p>…managerSoon</p>` line in each file's
body with their component; the page import and card frame stay as-is.

## i18n and help

- New household keys in all eight languages: `manage.integrations.notConfigured`,
  `.setUpByAdmin`, `.deploymentManaged`, `.managerSoon`.
- `help.guide.connections.body.1` reworded in all eight languages to describe the
  per-connection cards and the deployment-level honesty; `connections` guide
  `updated` bumped to 2026-10-29.

## Verified

- Typecheck (`tsc -p apps/web`) 0 errors; ESLint on changed files clean.
- Unit/component tests: `connection-cards.test.ts` (shape logic: connected vs not
  vs deployment-level) and `provider-card.test.tsx` (badge per status; Connect
  renders only on a connectable card; **never** on a deployment-level card, even
  when an action is passed; detail body always shown) — all pass.
- i18n parity test (`translate.test.ts`) passes with the new keys.
- `npm run build -w apps/web` and `npm run check:bundle` pass; `lint:help-links` passes.
- Signed-in browser QA on a throwaway live household (deleted after) via
  `scripts/ui-check.mjs` at 360px and 1024px: no horizontal overflow
  (scrollWidth == width at both). Seeded a connected calendar and a connecting
  email integration; cards read Calendar **Connected**, Email **Connecting**,
  Weather/Payments/Smart home **Not configured**. Expanding Weather shows the
  honest deployment copy and **no Connect** control; expanding Calendar shows its
  last-synced line and the manager placeholder. QA user, household and seeded rows
  deleted; confirmed 0 households remaining for the test id.

## Open / for a person

- Calendar and Email cards carry a placeholder body until the two follow-on
  sessions land their managers.
- The old "Needs you" attention banner was removed; a provider needing
  reconnection now surfaces only through its own card's status. No provider is
  live today, so there is no real attention state to lose; revisit if/when a live
  provider ships.
