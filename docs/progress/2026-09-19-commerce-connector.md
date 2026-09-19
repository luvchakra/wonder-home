# The commerce connector (story 17-005)

**Date:** 2026-09-19
**Module:** 17 — External Integrations
**Status:** Done

## What is different about this one

Calendar, mail and school were all feeds: a provider reports things it owns,
and WonderHome reconciles them in. A merchant is reporting back on something
**this household created**, with money already committed to it.

That changes what a sync is allowed to do, and it is most of this story.

**A merchant cannot rewind an order.** `canTransition` is the household's
lifecycle, not the provider's. A record saying "shipped" about an order already
delivered is refused and reported, not applied. Providers replay queues and
resend stale webhooks; a reconciler that treats the newest message as the
newest truth will eventually un-deliver a delivery.

**A merchant cannot quietly reprice.** A household approved an amount. If a
sync reports a different one, that is an exception for a person to see, not a
column to overwrite. `total_minor` is never written by a sync — which matters,
because writing it would make the household's record agree with the merchant's
and thereby make the disagreement impossible to notice. It is the same rule
`finance/payments.ts` applies when an amount changes after approval.

**An order WonderHome did not place is never inserted.** Somebody ordering in
the merchant's own app arrives as `unmatched`. It has no approval behind it,
and inventing one would put a purchase nobody agreed to into the household's
history.

A reprice is deliberately its own category rather than an update or a refusal:
the status change alongside it may well be real and worth applying. What must
not happen is the new amount arriving unremarked.

## Placing, not just reading

Commerce is also the first connector with an outbound side, and the criterion
is that expected cost and quantity are shown "before any purchase side effect
occurs". `prepareOrder` already produced the preview; `mayPlaceOrder` is where
that stops being a description of a screen and becomes a rule. A placement must
carry the preview it was approved against, and the totals must still match —
an order repriced between the preview and the click is a different order, and
the household agreed to the other one.

`place` is a separate type from `Connector` rather than a method on it, so a
read-only commerce adapter is a legal thing to write. A connector without it
can follow orders and cannot create them, which is the safer default for an
adapter somebody is still building.

## Where the code lives

| Piece | Path |
|---|---|
| Translation, reconciliation, placement rules | `packages/core/src/commerce/commerce-connector.ts` |
| The sync, with ports | `packages/core/src/commerce/commerce-sync.ts` |
| The route | `apps/web/app/api/v1/households/[householdId]/integrations/commerce/sync/` |

The contract and fixture (`CommercePayload`, `createFixtureCommerceConnector`)
already existed from module 09 and were extended rather than duplicated. No
migration: `orders` and `order_items` were already there.

## What was verified

- `npm run typecheck`, `lint`, `lint:secrets` (456 files), `lint:embeds` — clean
- `npm run test` — 1000 passing across 72 files; 28 new across the connector
  and the sync
- `npm run security` — 9/9 areas
- `npm run build` — succeeded
- `npx playwright test` — 228 passing

The OpenAPI coverage gate caught the new route as undocumented, as it did for
the last two routes. That check keeps earning its place.

## Still open

- **No merchant is live**, so the endpoint answers 409 and the placement path
  refuses with `provider_not_live`. That is the honest state under `CLAUDE.md`:
  a provider counts as live only once credentials, consent, authentication and
  integration tests exist.
- **Nothing surfaces a reprice to a household yet.** The sync reports it and
  the route returns it; no screen reads it. Whoever builds that should treat it
  as an exception needing a person, not a badge — it is the household being
  charged something they did not agree to.
- **`place` has no caller.** `mayPlaceOrder` guards the path and
  `prepareOrder` produces the preview, but nothing joins them into an ordering
  flow, because there is no merchant to order from.
