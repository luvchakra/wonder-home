# The AI privacy gate (story 15-005)

**Date:** 2026-09-19
**Module:** 15 — Privacy, Security & Governance
**Status:** Done

## What was done

The gate that decides whether anything about a household may reach a model
provider, and how little of it, now exists — before the provider does.

That order is the point. No provider is configured with credentials, so
understanding is still deterministic and nothing is transmitted today. Building
the consent check now and the provider call behind it later is what keeps the
promise; the reverse order is how a product ships an integration and adds the
consent check in the release after.

## How it decides

Two questions, in this order, neither skippable.

**May this household's content go to a provider at all?** `routeToProvider`
answers that from the household's configured data-use policy, *before* any
payload is assembled. Assembling first and deciding afterwards is how content
ends up in a log, a trace or a retry that the decision was supposed to prevent.
It refuses four ways, each with its own code: the household has not agreed, no
provider is configured, this provider is not one they agreed to, or everything
was withheld and an empty round trip would still tell a provider that this
household asked something.

**What is the least that answers the turn?** `minimiseContext` applies four
filters in order, so the reason something was withheld is the most fundamental
one rather than whichever fired first: never transmissible, not relevant, class
not permitted, over budget. What goes out is reported back with why, so the
household can be told exactly what left.

## The invariants

- **A household cannot consent its way past the `credential` class.** Tokens
  and keys are not theirs to trade, they are the thing an attacker wants, and a
  policy flag that could release them is one somebody eventually sets by
  accident. The parser strips it from any allowed list, and the filter would
  catch it even if a policy reached the gate another way. Both are tested.
- **A household's own key does not widen which classes may be sent.** BYOK
  changes whose agreement with the provider governs the call. It does not make
  a child's information the household's to trade for a better retention term.
- **Names never leave.** Members are replaced with stable role placeholders —
  "Adult A", "Child A" — ordered by member id so the same person gets the same
  placeholder every turn. A provider that sees a consistent label can follow a
  conversation; one that sees fresh random labels cannot, and the household
  pays for that in worse answers. Full names are substituted before first
  names, so "Ravi Nair" does not leave "Nair" behind.
- **Every failure path lands on the conservative default.** An unreadable
  policy row, a database that will not answer, an unknown class name — none of
  them may be the reason a child's information reaches a provider.

## The default before a household says anything

Ordinary household matters only, to Anthropic, no retention, at most 12 items
per turn. Deliberately usable rather than empty: the assistant works out of the
box, and everything that is somebody's private business — a child, a diagnosis,
an amount, a whereabouts, a message — waits for an explicit yes. Starting from
"nothing at all" would push households to switch the whole thing on without
reading it, which is worse than a careful default.

## Retry without duplicating the turn

The criterion asked for it, and the composer had no retry at all. A failed turn
now keeps its utterance and offers **Try again**, resending the *same*
idempotency key — the key belongs to the attempt, not the click — and the
conversation route declares `idempotency`, so a retry after a request that did
reach the server returns the recorded response instead of writing the messages,
the proposal and the usage a second time.

## Where the code lives

| Piece | Path |
|---|---|
| Classes, policy, routing, minimisation | `packages/core/src/ai/privacy.ts` |
| Reading and writing the agreement | `packages/core/src/ai/privacy-repository.ts` |
| The gate on every turn | `apps/web/app/api/v1/households/[householdId]/conversation/route.ts` |
| Consent control | `apps/web/app/_components/data-use-form.tsx`, `apps/web/app/(auth)/privacy-actions.ts` |
| Where a household reads and changes it | `apps/web/app/settings/page.tsx` |

The agreement lives in `policies` under the `privacy` category, as one more
versioned household rule rather than a settings blob — so it is versioned
(what was agreed when something was sent stays knowable), audited (`savePolicy`
audits), and read on the server every time. No migration was needed.

## What was verified

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run lint:secrets` — passed, 419 files
- `npm run test` — 828 passing across 62 files; 27 new in `ai/privacy.test.ts`
- `npm run build` — succeeded
- `npx playwright test` — 202 passing

## Still open

- **The provider call itself does not exist.** The gate runs each turn and
  records why nothing was sent (`not_transmitted_no_client` when a key is
  configured and permitted). Whoever wires a real provider puts the call behind
  `routeToProvider` returning `ok: true`, sends only `minimised.included`, and
  maps the answer back through `pseudonyms`.
- **One candidate today.** The only thing a turn would send is what the person
  said. When the assistant starts drawing on outcomes, schedules and memories,
  each becomes a candidate with its own class and relevance test — which is
  exactly the shape `ContextCandidate` already has.
- **15-006 (Audit), 15-007 (Privacy Center) and 15-008 (Security testing)** are
  the rest of this epic and are next. The Settings screen still lists export and
  deletion as "Soon"; 15-007 is where they stop being soon.
