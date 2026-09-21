# Househelper: a scoped empty state, and errors that show instead of hide

## What happened

The first four items of a new 13-item user-reported batch, all on
`/househelper` and `/household/members`:

- Item 10: "under househelper page, it's not showing current house help."
- Item 11: "on clicking add someone, it throws error page."
- Item 12: "under schedule, it again shows add someone, not required."
- Item 13: "under tasks, it shows add someone, remove that and add tasks
  feature. ensure it is internally linked with other modules."

For item 13, the Tasks tab already renders real, cross-module-linked
content — outcomes assigned via Responsibilities/Playbook, the same data
Responsibilities and Home read — with no per-chore completion tracking
(the migration that built this table is explicit: "there is no task
completion table, no per-chore status... adding one later would not be a
feature; it would be this product becoming a different one," matching
CLAUDE.md's own "manage outcomes, not micro-task checklists"). Asked the
user whether to build a literal task-completion feature anyway or fix the
bug masking the existing outcome-based Tasks tab; the answer was to fix
the bug and keep Tasks outcome-based.

## Root cause

All four items trace to two defects, not four:

1. **`apps/web/app/househelper/page.tsx`** called `listMembers(...).catch(() => [])` —
   any failure (a transient query error, a cold connection) silently
   became an empty member list instead of surfacing as a failure. That
   turned a real error into a false "no househelper" (item 10).
2. **The page's "No househelper yet" empty state wasn't scoped to the
   Overview tab.** It rendered whenever `helpers.length === 0`,
   regardless of which of the three tabs (`Overview`/`Schedule`/`Tasks`)
   was active — so a household with no helpers saw "Add someone" stacked
   on top of Schedule's and Tasks' own, already-correct empty states
   (items 12, 13).
3. **`apps/web/app/household/members/page.tsx`** (where the "Add
   someone" link points) called `listMembers`/`listInvitations` with no
   error handling at all, so the same class of failure that (1) silently
   swallowed on `/househelper` crashed this page outright to the app's
   generic error boundary (item 11) — the two pages disagreed about
   what to do with an identical failure.

Reproduced the real production household's exact member shape (an admin
via `head`, a second adult via `administrator`, a child, and one
`helper`-typed row with no avatar/DOB/profile) locally against the live
Supabase project and could not force `listMembers` itself to throw for
that data — the query, the RLS functions (`wh.is_member`,
`wh.is_household_admin`), and every row involved are all sound. The fix
here does not depend on knowing what triggers a future failure: it
makes failures visible instead of silently wrong (Overview) or an
unhandled crash (Members), and it removes the always-present
duplicate-empty-state bug on Schedule/Tasks outright, which is
independently confirmed straight from the source — no live failure
needed to prove it.

## What shipped

- `/househelper`: `listMembers` failure and success are now distinguished
  (`{ data, failed }`, resolved via `.then(ok, err)` rather than a mutated
  outer variable, which the `react-hooks` ESLint rule correctly rejects
  in an async Server Component). A failed load renders `ErrorState`
  ("Couldn't load your househelp," with a retry link) instead of the
  misleading "No househelper yet."
- The "No househelper yet / Add someone" empty state is now scoped to
  `active === "overview"` — Schedule and Tasks keep only their own,
  already-correct empty states ("No changes coming up," "Nothing
  assigned yet") when there are no helpers.
- `/household/members`: `listMembers`/`listInvitations` are now wrapped
  in a `try/catch`; a failure renders `ErrorState` in place of the
  member/invite/add-forms content instead of crashing to the generic
  error page.

## Verified

- `npm run verify` clean: typecheck, lint (the `react-hooks` rule caught
  the first draft's outer-variable mutation and the fix above resolves
  it cleanly), migrations/embeds/boundaries/secrets lint, tracker/brand
  checks, security suite, unit tests, DB/RLS tests, production build,
  256 E2E.
- Browser-verified against a QA household shaped like the real one
  (one `head` adult, one `administrator` adult, one child, one helper)
  reconstructed directly in the live Supabase project: with a helper
  present, Overview/Schedule/Tasks all render correctly. Removed the
  helper and re-checked all three tabs: Overview shows "No househelper
  yet / Add someone" (only place it appears now); Schedule shows only
  "No changes coming up" and an empty "Weekly pattern" list, no
  duplicate "Add someone"; Tasks shows only "Nothing assigned yet" with
  a link to Responsibilities, no duplicate "Add someone." Clicked "Add
  someone" from the Overview empty state and confirmed it lands cleanly
  on `/household/members` with no error boundary and no console errors.
  QA household and test user deleted afterward.

## What's still open

Items 5-9 and 14-16 of the same batch (Meals & Cooking, Bills &
Finance) are separate stories, not yet started.

## Where the code lives

- `apps/web/app/househelper/page.tsx`
- `apps/web/app/household/members/page.tsx`
