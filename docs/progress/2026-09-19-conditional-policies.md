# Conditional policies (story 02-008) — module 02 complete

**Date:** 2026-09-19
**Scope:** `packages/core/src/household/configuration.ts`, `configuration-repository.ts`, `apps/web/app/(auth)/configuration-actions.ts`, `apps/web/app/_components/config-forms.tsx`
**Status:** Done — module 02 (Household Configuration & Playbook) is now 8 of 8

## What this is

Story 02-008, the last one in module 02: "Advanced rule builder... Support
conditional household policies." Picked immediately after 02-007 in the
same session, closing the module.

A policy today (`savePolicy`/`PolicyForm`) is a flat rule — a spending
limit, a note — the same for every member and every hour of the day. A
household's real rules are rarely that uniform: a spending limit that is
stricter for children than for adults, a notifications policy that only
holds during quiet hours. `commerce/policy.ts` already solved exactly this
shape of problem for purchase policies — a scope (`any` / `category` /
`merchant` / `consumable`) and a specificity order so the narrowest
matching policy wins. This story brings the same idea to module 02's own,
more general `policies` table.

## What was built

`PolicyCondition` in `packages/core/src/household/configuration.ts` — a
policy narrows to one of two cases:

- `{ kind: "member_type", memberType }` — applies only to adults, children,
  or househelpers.
- `{ kind: "hour_range", startHour, endHour }` — applies only during a
  window of the day, wrapping past midnight the same way a playbook's
  operating window already does (quiet hours, 9pm–7am, is `startHour: 21,
  endHour: 7`).

`null` (no condition) is the household's unconditional default for that
category — unchanged from how policies already worked.

`conditionMatches(condition, context)` decides whether a condition holds
for a moment (`{ memberType?, hour? }`). `selectApplicablePolicy(policies,
context)` picks which of a category's active policies actually applies:
every matching policy is filtered, then sorted so a matching *conditional*
policy always outranks the unconditional default, and two conditional
policies that both match resolve by name — deterministic, never dependent
on the order rows came back from the database. `validatePolicyCondition`
checks a condition's own shape (hours 0–23, not a zero-length window),
reusing the exact same rule `validatePlaybookItem` already applies to an
operating window.

**Where it's stored:** inside the existing `policies.rule` JSONB column, as
a sibling key (`rule.condition`) — no migration, since `rule` was already
the generic column for whatever a category's policy needs.
`activePolicies(supabase, householdId, category)` (new, in
`configuration-repository.ts`) reads a category's active rows back into
`ConditionalPolicy[]`, ready for `selectApplicablePolicy`. More than one
policy can be active in the same category at once — an unconditional
default plus any number of conditional ones — because `savePolicy` only
ever deactivates other *versions of the same name*, and a conditional
policy naturally gets its own name ("Children's spending" alongside
"Everyday spending").

**The form:** `PolicyForm` gained a collapsed "Narrow this to a specific
case (optional)" disclosure — the same pattern the playbook form's
own optional section uses — offering a member-type select and an hour
range. A household picks at most one; if somehow both are submitted,
member type wins rather than refusing the save over an unlikely double-fill.
`downstreamOf`'s policy case now says what a conditional policy is
narrowed to, when it has a condition, alongside the version/audit lines it
already gave.

## What was verified

- `npm run typecheck` — clean
- `npx vitest run --root packages/core` — 1060 unit tests passing (was
  1045; +15: condition validation for both kinds, `conditionMatches`
  including the midnight-wrap case and "no hour given never matches", four
  `selectApplicablePolicy` cases (default wins with nothing more specific,
  a matching conditional wins over the default, no policies at all, two
  matching conditionals resolve by name regardless of array order), and
  `downstreamOf` both with and without a condition)
- `npm run lint`, `npm run lint:boundaries`, `npm run lint:secrets` — clean
- `npm run security` — 9/9 P0 areas passing (unaffected; no new
  authorization boundary — `savePolicyAction` still requires household
  admin exactly as before)
- `npm run build` — succeeds
- `npx playwright test --project=desktop` — 126/126 unaffected
- `npm run tracker -- --check` — current (147/170)

## What is explicitly still open

- **No consumer calls `selectApplicablePolicy` yet for a real decision.**
  This story is the rule builder — the data model and the pure selection
  logic — not a rewrite of every place a policy might apply. The generic
  `policies` table's "spending" category in particular still has no real
  enforcement path anywhere in the product (purchases actually go through
  `commerce/policy.ts`'s own, separate `PurchasePolicy`/`evaluatePurchase`,
  built for stories 09-004/09-005 and unrelated to this table). Wiring
  `activePolicies` + `selectApplicablePolicy` into an actual decision point
  is real, separate work for whichever story first needs a *conditional*
  version of a module-02 policy category enforced somewhere.
- **Module 02 is done — 8 of 8.** The next dependency-ready story per
  `tracking/IMPLEMENTATION-ORDER.md`'s phase order is module 03
  (`03-006` Dependency graph, P1).

## Where

`packages/core/src/household/configuration.ts` (`PolicyCondition`,
`conditionMatches`, `selectApplicablePolicy`, `validatePolicyCondition`),
`configuration.test.ts`, `configuration-repository.ts` (`savePolicy`
extended, `activePolicies` new),
`apps/web/app/(auth)/configuration-actions.ts` (`savePolicyAction`),
`apps/web/app/_components/config-forms.tsx` (`PolicyForm`),
`backlogs/02-Household-Configuration-and-Playbook.md`,
`tracking/PROGRESS.md`, `docs/PROGRESS.md` (regenerated).
