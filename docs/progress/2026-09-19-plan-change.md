# Changing plans without losing anything (story 20-004)

**Date:** 2026-09-19
**Module:** 20 — Subscriptions, Entitlements & Usage
**Status:** Done

## The criterion, and how products usually break it

"Change plans without data loss." The way that promise gets broken is almost
never a `DELETE`. It is a downgrade quietly making things unreachable and the
product calling that "no longer available". A household that had fourteen
connected accounts and now has one has not lost data in the database's sense,
and has absolutely lost it in theirs.

So the work here is mostly about saying exactly what a change does, before it
happens, in terms a family can picture.

## What was built

**An assessment that distinguishes the two things a downgrade can mean.** A
*capability stopping* — the feature is gone, whatever it produced stays and is
still readable, the thing that made more of it stops. And a *limit now lower
than what is already there* — nothing is removed to fit; existing records stay
over the line and no new ones are added until usage falls back under it. That
second one is what "fail gracefully and preserve existing records" has to mean
if it means anything.

**Per-feature sentences rather than "your data is kept".** "Your data" is not a
thing anybody pictures. Somebody worried about downgrading is picturing their
bills, or their children's school work, and is told about *that*: "Your bills,
what was paid and when all stay."

**A `deletesData: false` field on the assessment.** It is a field rather than a
comment because the promise is load-bearing, and a test asserts it for every
change shape — so a future version that starts deleting has to change that line
in the open rather than change behaviour quietly.

**A description that leads with what is lost.** A downgrade screen that opens
with what you keep is a screen written to get somebody through it. The
reassurance — "Nothing is deleted" — is last, and always present.

**A change that only ever writes one row.** `changePlan` touches
`household_subscriptions` and nothing else: not to tidy records, not to bring
them under a new limit, not at all. Everything downstream is the entitlement
service reading the new plan.

**Confirmation that is not a formality.** A change taking a capability away
requires the caller to send back what it showed, which is re-derived on the
server and compared. A browser that skipped the preview cannot skip the
consequence, and if the counts moved while somebody was reading, the household
agreed to a different change from the one about to happen — so it is refused
and shown again.

**"Lateral" as a real answer.** A change that trades one capability for another
is not an upgrade. Calling it one would be a sales word in a place that should
carry only facts.

Nothing in the module knows what a plan costs. `assessPlanChange` takes plan
*features*, not a plan, which is the last criterion made structural: pricing is
not a thing a domain module can learn.

## Where the code lives

| Piece | Path |
|---|---|
| The assessment and its sentences | `packages/core/src/billing/plan-change.ts` |
| Preview, change, audit | `packages/core/src/billing/repository.ts` |
| The route | `apps/web/app/api/v1/households/[householdId]/plan/` |
| The screen | `apps/web/app/_components/plan-form.tsx`, in Settings |
| Write policy | `supabase/migrations/20260919160000_plan_change_policy.sql` |

`household_subscriptions` had carried a select policy and no write policy since
the plans migration, because nothing changed a plan — the row was seeded and
read. Administrators can now write it, with the application check authoritative
and RLS the second line.

`subscription.changed` joins the audit catalogue, recording the plan keys, the
direction and which features stopped. Not what it costs: that is not this
product's business to keep.

## What was verified

- `npm run typecheck`, `lint`, `lint:migrations` — clean
- `npm run lint:secrets` — passed, 462 files
- `npm run test` — 1020 passing across 73 files; 19 new in `plan-change.test.ts`
- `npm run build` — succeeded
- `npx playwright test` — 232 passing
- `npm run verify:live` — 70/70, including a new check that an anonymous caller
  cannot put a household on another plan (42501)
- Migration applied to `kqxndableyysxqhxiorz`

## Still open

- **Nothing charges anybody.** There is no payment provider and no price
  anywhere in the code, which is 20-006 (billing abstraction). Today a plan
  change is free and immediate; when billing arrives, this is the function it
  wraps rather than replaces.
- **Usage is read per feature in a loop** during a preview. Fine for the dozen
  features a plan has, and worth one query if that list ever grows.
- **The exceeded-limit case is described but not separately enforced.** The
  entitlement service already refuses over-quota work through `checkEntitlement`,
  so behaviour is correct; what does not exist is a screen telling somebody
  they are over a limit before they hit it. That is 20-005 (usage UI).
