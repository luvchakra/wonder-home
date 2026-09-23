# Controlled entitlement experiments (story 20-008)

## What was done

An experiment changes one plan feature for a share of the households on the
plans it names. It can turn the feature on, turn it off, or give it a
different allowance. The plan itself is never touched.

- **Who is in it.** A household's group is a pure function of the
  experiment key and the household id:
  - FNV-1a over both, then murmur3's finaliser, gives a bucket from 0 to 99;
  - a bucket below `treatment_percent` is in the treatment group.

  So the same household always lands on the same side, and raising the
  share only ever adds households. No per-household row is stored, and the
  split can always be recomputed from the frozen terms. The first version
  used FNV-1a alone, and a unit test caught it splitting two experiments
  almost identically: FNV's low bits barely mix. The finaliser fixed it.
- **Where it applies.** `billing/experiments.ts`'s `applyExperiments` runs
  inside `loadSubscription`. `may`, `consume`, the usage screen and every
  domain gate built on them therefore see one answer, and a direct API call
  cannot reach a feature the screen hides, or miss one it shows.
  - Running experiments are read through the member's own session, like
    the plan itself.
  - If they cannot be read, the household gets its plan as sold.
  - The plan's burst policy still holds under an experiment, and so does
    its fair-use level while that fits under the new allowance.
  - Two experiments on one feature are settled by key, never by row order.
- **Migration** `supabase/migrations/20260927150000_entitlement_experiments.sql`
  (applied live):
  - `entitlement_experiments`: a session may read only a running
    experiment's terms, through column grants plus an RLS policy. Staff's
    description never reaches a session.
  - A trigger freezes the terms once an experiment starts, and allows only
    draft → running → stopped.
  - The append-only `entitlement_experiment_events` has a deny-all policy.
- **Staff API** (`subscription.manage`, a reason code on every change):
  - `GET` and `POST /api/v1/platform-admin/experiments`: list experiments,
    or create a draft. An incoherent draft or an unknown plan gets a 422
    that says why.
  - `GET` and `PATCH /api/v1/platform-admin/experiments/{key}`: start or
    stop. Anything else gets a 409.
  - Results are per-group household counts and that feature's usage
    counters this period. They are counts only, never content.
  - The OpenAPI document is updated.
- **Households see it.** Settings says in plain words when a feature is part
  of a trial, and that ending the trial removes nothing they made.

## Why

The story asks for controlled entitlement experiments. A direct API call
must not be able to bypass the entitlement decision, and the experiments
must be data-driven, auditable, and never a pricing branch inside a domain
module. Putting the overlay in the one entitlement service delivers all of
that. The same service answers the screen and the API.

## Verified

- **Unit tests:** 2560 passing, 11 of them new in `billing/experiments.test.ts`:
  - hashing is stable, independent between experiments, and monotone in
    the share;
  - the overlay and its ordering behave as described;
  - `may` and `consume` refuse a control household and allow a treatment
    household for the same feature;
  - unreadable experiments fall back to the plan as sold;
  - the staff moves are enforced.
- **Database:** the entitlements suite passes 22/22, with 2 new tests:
  - a household reads only a running experiment's terms, and never its
    description, drafts or history, and cannot create or widen one;
  - the trigger freezes terms and refuses a restart.
  - Tenant isolation passes 11/11, with the new tables listed as
    platform-level.
- **Gates:** `npm run verify:live` passes 172/172. Typecheck, lint and the
  migration lint are clean.
- **Live, on the real project, through the member's own session:**
  - The QA household was on `pro`, which no real household is on.
  - A 100% trial of `integrations.deep`, which Pro lacks, was created,
    started and seen by the household. Settings showed the trial sentence at
    360px and 1280px, with no overflow.
  - A 50% experiment on `conversation.text` left the household in control
    (bucket 99), so its allowance stayed 2000.
  - Results counted 1 household in each experiment's group.
  - Restarting a running experiment got 409, and an unknown plan got 422.
  - Stopping both returned the plan as sold.

## Open

- **No admin screen.** Like subscription administration and plan policies,
  experiments are API-only for staff.
- **Recomputed results.** Results are recomputed on every read, across all
  households. That is fine at today's size. A large fleet would want a
  materialised assignment.

## Test data cleanup

Ran after PR #142 merged. Stories 20-007 and 20-008 were QA'd with the same
account, so one cleanup covers both. Removed:

- the QA household "Policy QA Home" (`098048e0-b1b0-425b-87d4-35e8c7e8fe7b`),
  its audit row, its usage counters and its rate-limit and burst counters;
- the two policy events and the two QA experiments (`qa_trial_deep`,
  `qa_control_text`) with their six events;
- the temporary `operator` row in `platform_admins`;
- the `verify.live` counter row;
- the QA account `a2fb27ea-69ff-4b93-970d-ca36094e58e2`, deleted with
  `node scripts/qa-test-user.mjs delete`. Two accounts created by mistake
  moments earlier (`cce4be2c-…`, `080dcb69-…`) were deleted at once, before
  they were used.

The `pro` plan's text-conversation policy had already been cleared through
the API. A SQL count afterwards found no experiments, experiment or policy
events, plan policies, household, members, counters, profile or auth user
left, and no `qa-verify-` account at all. The dev server was stopped and
the scratch QA scripts and screenshots removed. Nothing was left behind.
