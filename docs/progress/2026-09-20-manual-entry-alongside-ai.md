# "Add something" gets a form, everywhere it only had a chat link

**Date:** 2026-09-20
**Scope:** Groceries, Bills, Home & upkeep, School, Meals — new Server Actions
(`commerce-actions.ts`, `finance-actions.ts`, `home-actions.ts`,
`meal-actions.ts`, `school-actions.ts`), new form components
(`_components/{commerce,finance,home,meal,school}-forms.tsx`), two new
repository writes (`createConsumable`, `createObligation`)
**Status:** Done

## What this is

Direct, repeated feedback while looking at the live app: Kids & School,
Groceries and Meals were all empty with only one way forward — a link to
"Talk to WonderHome." The explicit ask: "it should have both traditional
manual entry option as well as ai option," everywhere "add something" shows
up.

This reopens a call made earlier the same session (`2026-09-20-ux-clarity-pass.md`):
that Groceries/Bills/Home & upkeep/School were intentionally AI-only for
creation, based on `home.raise_service_request` etc. being wired to REST
routes rather than a form, and the product direction's emphasis on "Talk to
WonderHome." That reasoning doesn't survive contact with what the user
actually wants: an AI-first *default* is not the same as an AI-*only* path,
and a household that would rather type a form than phrase a sentence needs
somewhere to do that. The earlier call is superseded by this one.

## What was actually missing, domain by domain

Checked before building anything, since the four earlier "AI-only" domains
were not all in the same state:

- **Home & upkeep** and **School** already had working repository functions
  — `createAsset`, `createServiceRequest`, `createSchoolItem` — wired only to
  REST routes (for the AI orchestrator's own tool calls), never to a form.
  Same situation Responsibilities was in before its own fix. Just needed a
  Server Action wrapper and a Sheet.
- **Meals** already had `createMeal` too, same story.
- **Groceries** and **Bills** had *no* creation path at all beyond an
  AI-prep flow (`prepareOrder` prices a basket that must already have line
  items; `prepareIntent` prepares a payment for an obligation that must
  already exist). Adding manual entry here meant new repository functions —
  `createConsumable` (writes `evidence_basis: "member_stated"`, a basis the
  domain model already treats as equally real as purchase history — nothing
  invented) and `createObligation` (a bill typed in by hand, `source`
  defaulting to `"member_stated"` the table already provided for).

## What was built

Five Sheet-hosted forms, each following the pattern established for
Responsibilities and Family events (`useActionState` + `useFormStatus`,
`ActionState` return shape, `revalidatePath` on success):

- **Groceries** — `AddConsumableButton`: name, category, unit, usual
  quantity, and an optional "lasts about N days" (left empty, WonderHome
  works out a rate from purchases later, same as today).
- **Bills** — `AddBillButton`, admin-gated (the `obligations` table's own
  RLS policy, `obligations_write_admin`, restricts writes to admins —
  checked before gating the UI, not assumed): name, kind, recurrence,
  payee, amount+currency (validated together, matching the table's own
  check constraint), due date.
- **Home & upkeep** — `AddAssetButton` (admin-gated, matching
  `home_assets`' own RLS — its existing error message already said "Only a
  household administrator can add an asset") and `RaiseServiceRequestButton`
  (open to any member, matching its RLS).
- **School** — `AddHomeworkButton`, for whichever guardians add school work
  (RLS enforces the actual guardian check; the UI simply doesn't render the
  button when the household has no children to pick from).
- **Meals** — `PlanMealButton`: name, slot, date, ready-by time, optional
  cook.

Every page's header is now visible at every width (several were previously
`hidden lg:block`, meaning the AI link itself wasn't even reachable on
mobile for Bills/Meals) and carries both the new manual button and the
existing AI link side by side — "Tell WonderHome" stays the fast path, the
form is the alternative, neither is the only door.

## What was verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`,
  `npm run lint:secrets` — clean
- `npm run build` — succeeds
- `npm run verify` (typecheck, lint×4, tracker/brand checks, P0 security
  suite, unit tests, `test:db`, build, E2E desktop+mobile) — 252/252 E2E,
  passes end to end. `test:db` runs the real RLS policies against the two
  new writes (`createConsumable`, `createObligation`), not just application
  code — this is the one place in this session's work where the new logic
  was exercised against real Postgres authorization rules, not just typed.
- Not verified in a live signed-in browser — same constraint as every other
  UI change this session (`2026-09-20-nav-drawer.md`): no seed script for a
  test household, dev points at a rate-limited live Supabase project.

## Where

`apps/web/app/(auth)/{commerce,finance,home,meal,school}-actions.ts` (new),
`apps/web/app/_components/{commerce,finance,home,meal,school}-forms.tsx`
(new), `packages/core/src/commerce/repository.ts` (`createConsumable`),
`packages/core/src/finance/repository.ts` (`createObligation`),
`apps/web/app/{groceries,bills,meals,school}/page.tsx` and
`apps/web/app/household/home/page.tsx` (headers + wiring).
