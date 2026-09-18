# Household setup guidance for the first week

**Date:** 2026-09-18 · **Kind:** UI / product (user request, outside the backlog)

## What was done

A Head of Family or administrator sees "Set up your household" at the top of
Home for their first week: a progress ring, a milestone word ("Good start",
"Halfway there", …), and the next three steps, each with the reason it is
worth doing and a link to where it is done. After the week it becomes one
quiet row until 100%, then disappears. Manage Household always shows the
full checklist. At 100% the card becomes an achievement.

The percentage is weighted arithmetic over facts that exist (a bill, a
responsibility, a playbook item, a child's date of birth), never ticked
boxes. Steps that do not apply — no children, no helper — are left out of
the total, so such a household can still reach 100%.

The week is that person's own: `household_members.first_seen_at` is set
once by `public.mark_member_seen`, a definer function that only fills an
empty value. The window runs from the later of that moment and their most
recent head/administrator grant, so a later promotion earns its own week.

## Verified

- 19 unit tests (`household/setup.test.ts`), identity mapping tests updated.
- Typecheck, lint, 679 unit tests, production build.
- Migration `20260918050000_member_first_seen` applied; `verify:live`
  61/61 including "anonymous cannot record a first sign-in".

## Still open

- Per-step links point at the screens where the data is entered; some of
  those screens (members, home) still lack their own forms for every fact.
- No E2E test renders the signed-in Home; coverage is unit plus build.

## Where

`packages/core/src/household/setup.ts`, `setup-repository.ts`,
`packages/core/src/components/ui/setup-progress.tsx`,
`apps/web/app/_lib/session.ts` (`markFirstSeen`),
`apps/web/app/_screens/home-dashboard.tsx`, `apps/web/app/household/page.tsx`.
