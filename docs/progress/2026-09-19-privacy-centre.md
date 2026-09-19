# The Privacy Centre, and the step-up that was never there (story 15-007)

**Date:** 2026-09-19
**Module:** 15 — Privacy, Security & Governance
**Status:** Done

## What this found first

`payment_intents` has carried a `step_up_verified_at` column since the bills
migration, with a check constraint requiring it before a payment can reach
`approved`. `finance/payments.ts` refuses to execute without it, and
`payments.test.ts` covers the refusal.

Nothing in the product ever set it. There was no table to record a
verification in and no code that performed one.

That is the same shape as the eleven unemitted audit events found in 15-006: a
control that reads as complete from the code and does nothing in practice. It
is arguably worse here, because the first person to wire payments up would have
found a column blocking them and been tempted to stamp it.

## What was built

**A step-up that verifies something.** The proof is the account's own password,
checked server-side against Supabase on a throwaway client — signing in on the
request's own client would mint new tokens and invalidate the session the rest
of the request is holding. There is no MFA on these accounts and no working
transactional mail, so an emailed nonce would be a control that silently never
arrives; a password re-entry is the strongest proof that can actually complete
today, and it is honest about being that.

Four properties make it a control rather than a ritual:

- **Purpose-scoped.** Confirming a password to export data does not authorise a
  payment pending in another tab. The purpose is checked *before* freshness,
  because a fresh proof of the wrong thing is the more dangerous mistake.
- **Spent when used.** `requireStepUp` checks and consumes in one call, before
  the action, so a half-failed action cannot leave a live proof for a retry.
- **Written only by the server.** `step_up_verifications` has no INSERT policy.
  A client that could write one could hand itself the thing the check demands.
- **Counted.** Failures are rows too. A step-up prompt says yes or no to a
  password guess from inside an already-signed-in session, which makes it a
  better brute-force target than the sign-in page unless somebody is counting.
  Five failures in fifteen minutes closes it; a success clears the slate, so
  mistyping twice this morning does not lock you out tonight.

**Export.** A copy of your data, as a file, from `/settings/privacy`.
Deliberately a POST that returns the file rather than a job that returns a
link — a link is a second way to reach the data, outliving the session that
proved itself for it. Assembled with the member's own RLS-scoped client and
narrowed again by permission, because an export touches every table at once,
which is exactly the request where one missing policy becomes a household's
finances in a child's downloads folder. Never includes keys, and never includes
the audit trail: a trail you can carry off is one you can be pressured to hand
over.

**Deletion.** A request with a 30-day grace window rather than a button,
cancellable throughout. The Head of Family is refused outright — deleting them
would leave a household with children and helpers in it and nobody to run it,
so handing the role over comes first and deserves its own flow.

**Retention.** A schedule in days, with a reason for each number, on one screen.
Two principles: what the household typed they own, and it never expires on a
timer; what the system inferred about them does, because the longer a guess is
kept the more it looks like a fact.

**And the sweep that applies it.** A published policy nothing applies is a
promise, not a policy — so `/api/v1/platform/retention` deletes everything past
its keeping, on a nightly Vercel cron, authorised by a shared secret rather
than a session because purging crosses every household at once. With no
`CRON_SECRET` set it refuses everything rather than running open.

## Two things the gates caught

**The export named six columns that do not exist.** `obligations.label`,
`orders.merchant`, `memories.statement`, `notifications.read_at` and two more —
all plausible, all wrong, and every one would have 500'd for the person who
asked. `export.test.ts` now parses the migrations and checks every column in
both the export and the purge map against the real schema.

**The retention route answered 403 where the suite requires 401.** The E2E
convention is that an anonymous caller gets `unauthenticated`, and the suite was
right: the credential here *is* the Authorization header, so a missing one is a
failure to authenticate, not a permission the caller lacks. One endpoint
answering differently is also a way to tell it apart from the rest.

## Where the code lives

| Piece | Path |
|---|---|
| Step-up rules | `packages/core/src/security/step-up.ts` |
| Verifying and spending | `packages/core/src/security/step-up-repository.ts` |
| The throwaway auth client | `packages/core/src/db/isolated.ts` |
| What an export contains | `packages/core/src/privacy/export.ts` |
| Requests, and building the export | `packages/core/src/privacy/repository.ts` |
| The retention schedule | `packages/core/src/privacy/retention.ts` |
| The sweep | `packages/core/src/privacy/purge.ts`, `apps/web/app/api/v1/platform/retention/` |
| The screen | `apps/web/app/settings/privacy/page.tsx` |
| Migration | `supabase/migrations/20260919140000_step_up_and_privacy_requests.sql` |

## What was verified

- `npm run typecheck`, `lint`, `lint:boundaries`, `lint:migrations` — clean
- `npm run lint:secrets` — passed, 443 files
- `npm run test` — 918 passing across 67 files; 64 new across step-up, export
  and retention
- `npm run build` — succeeded
- `npx playwright test` — 210 passing
- `npm run verify:live` — 69/69 against the real project, including four new
  checks: anonymous cannot forge a step-up, cannot read anybody's
  verifications, cannot read privacy requests, cannot ask for somebody else's
  data to be deleted
- Migration applied to `kqxndableyysxqhxiorz`; Supabase security advisors show
  no new findings

## Still open

- **Nothing consumes the step-up for payments yet.** The mechanism exists and
  `payments.ts` already demands it; wiring the payment flow through
  `requireStepUp(purpose: "payment")` is module 11's to finish. Until then a
  payment still cannot execute — which is the safe direction.
- **A matured deletion deletes nothing yet.** The request, the window and the
  cancel all work, and the grace period is recorded; the job that acts when it
  expires is not built, which is why `deleted_member` is deliberately absent
  from the purge map rather than silently missing from it.
- **`auth_leaked_password_protection` is off** on the Supabase project. It
  checks passwords against HaveIBeenPwned and is a dashboard toggle — worth
  turning on, and it makes the step-up meaningfully stronger.
- **`public.rls_auto_enable()` is flagged** by the advisor as a publicly
  executable SECURITY DEFINER function. It is Supabase's own event trigger that
  auto-enables RLS on new tables, it only ever *enables* RLS, and an event
  trigger function cannot do anything useful when called over RPC. Left alone
  deliberately: it is not ours, and disabling it would remove a safety net.
