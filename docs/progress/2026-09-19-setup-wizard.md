# The setup wizard (story 02-001)

**Date:** 2026-09-19
**Module:** 02 — Household Configuration & Playbook
**Status:** Done

## What was done

A household can now describe how it runs, in five steps at
`/household/setup`: who lives here, the playbook, who looks after what, the
household's rules, and connected accounts.

The wizard is resumable because there is nothing to resume. Each step writes
straight into the household's real configuration, and the next visit reads
that configuration to decide what is already done. No draft is kept in a
browser, in a cookie or in a `setup_progress` table — which is what the
criterion means by "not UI-only state", and which also means the wizard and
the Home screen's progress card can never disagree, because both read the
same facts through `assessSetup(loadSetupFacts(...))`.

## Why it is shaped this way

Three decisions are worth knowing about later.

**A policy is never edited in place.** Saving one deactivates the version in
force and inserts the next. A partial unique index
(`policies_one_active_per_name`) lets the database hold many versions and
exactly one active one, so "which rule was in force when that decision was
taken" always has an answer. Editing a row would have thrown that away.

**Dependencies are refused before they can loop.** `canDependOn()` walks the
existing graph upstream from the proposed dependency; if it reaches the item
being edited, the link is refused with a sentence naming both outcomes. A
cycle in the playbook is not a validation nicety — it is a planner that never
terminates.

**Every change is audited, through the admin client.** Configuration decides
what WonderHome may do on its own, so who changed it and when is exactly the
trail somebody will want afterwards. `audit_events` has no INSERT policy: a
household cannot write its own trail, which is what makes the trail worth
reading.

Each save answers with what the change means — "WonderHome will act on this
and tell you afterwards", "this is checked on the server every time, so
neither a screen nor the assistant can go around it". That is
`downstreamOf()`, and it is the criterion about showing affected downstream
behaviours.

## Where the code lives

| Piece | Path |
|---|---|
| Pure domain (validation, cycles, versions, downstream sentences) | `packages/core/src/household/configuration.ts` |
| Reads and writes, with the audit trail | `packages/core/src/household/configuration-repository.ts` |
| Server actions, each re-checking admin | `apps/web/app/(auth)/configuration-actions.ts` |
| The forms | `apps/web/app/_components/config-forms.tsx` |
| The wizard | `apps/web/app/household/setup/page.tsx` |

The tables were already there, from stories 02-002 through 02-005
(`supabase/migrations/20260917015316_household_playbook_and_responsibilities.sql`).
This story needed no migration.

## What was verified

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run lint:secrets` — passed, 410 files
- `npm run test` — 769 passing across 60 files, 31 of them new in
  `packages/core/src/household/configuration.test.ts`
- `npm run build` — succeeded, `/household/setup` present
- `npx playwright test` — 202 passing

The E2E suite needed one fix on the way: `getByLabel("Password")` had started
matching two elements, because the reveal toggle added in the auth work is
labelled "Show password". The assertions are now exact, and the toggle has an
assertion of its own — the ambiguity was the test noticing a real second
control, not a defect.

## Still open

- **Story 02-006 (configure by conversation)** is still marked `Blocked` on
  the conversation engine, but module 04 is Done. That block is stale and the
  story is the next thing to pick up. It needs deterministic fixtures for
  household utterances before anything is wired.
- **Story 02-007 (conflict detection)** is untouched. `canDependOn()` is the
  first piece of it — the rest is two responsibilities or two policies that
  contradict each other, which nothing detects yet.
- The **connections step** is honest rather than functional: no provider is
  live, so it says so and links to the integrations screen instead of
  offering a button that goes nowhere.
