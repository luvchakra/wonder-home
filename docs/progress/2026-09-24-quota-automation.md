# Fair-use and burst policies as plan data (story 20-007)

## What was done

A plan feature can now carry two more policies, both optional and both data:

- **Burst**: at most N uses per fixed W-second window (`burst_limit`,
  `burst_window_seconds`). It stops the spike a script or a stuck client
  makes. It refuses only for that window, and the refusal says the pause is
  temporary and nothing was lost.
- **Fair use**: past N uses in the period (`fair_use_limit`) the household
  is served more simply, and never refused. For HomeTalk that means the turn
  is answered from WonderHome's own rules with a disclosure
  (`not_transmitted_fair_use`) instead of reaching a model.

The hard allowance (`limit_per_period`) is still the only thing that
refuses for the rest of a period.

Where it lives:

- **Migration** `supabase/migrations/20260927140000_plan_usage_policies.sql`
  (applied live):
  - three nullable columns on `plan_features`, with checks: a burst needs
    both parts, a window of 10 s to a day, positive numbers, and a fair-use
    level never above the allowance;
  - the append-only `plan_policy_events`, with RLS on and no policies, so
    only the service role reaches it.
  - Every plan starts with no policy, so nothing changed for any household
    when it landed.
- **`packages/core/src/billing/policies.ts`**:
  - `fairUseState`, `needsCounting` and `policyProblem`. The last gives the
    same checks in words, and also refuses a fair-use level on a feature
    counted `forever`, which never resets.
  - `describePolicy`, `planPolicies`, `setFeaturePolicy` (records who, why,
    and the before and after; setting what is already set records nothing)
    and `policyHistory`.
- **`billing/repository.ts`'s `consume`**, the one entitlement service:
  - The burst check runs first, through the same `rate_limit_hit` counters
    every rate limit uses (bucket `plan.burst.<feature>`, per household).
    Like them it fails open.
  - A feature with only a fair-use level is now counted, with `p_limit`
    null so it is never refused. The decision carries `fairUse:
    "within" | "over"`.
  - `usageSummary` shows fair-use-only features and the policies as
    sentences.
- **HomeTalk** (`apps/web/app/_lib/hometalk-turn.ts`) now spends its
  allowance up front with `consume`, instead of checking with `may` and
  spending later in parallel. The same call answers the allowance, the
  burst and fair use, so a turn can no longer be allowed and then refused
  by the meter. A meter error falls back to `may`.
  - A burst is a 429 with the policy's message.
  - Past fair use, `decideProviderRouting` answers by the rules before any
    model call. This comes after the consent decision, so nothing leaves
    either way.
- **Staff API**: `GET` and `PATCH /api/v1/platform-admin/plans/{planKey}/policies`.
  - Both need `subscription.manage`, and a non-staff caller gets 404.
  - A change needs a reason code, and an incoherent policy gets a 422 that
    says why.
  - The OpenAPI document is updated.
- **Settings**: "Usage this period" lists the plan's policies in plain words
  under the counts.

## Why

The story asks for configurable fair-use and burst policies. They must be
data-driven, checked server-side through one entitlement service, auditable,
and never hard-coded in a domain module. Fair use degrades rather than
refuses because a family's heavy month is not abuse. A burst is the abuse
case, so it refuses, and only briefly.

## Verified

- **Unit tests:** 2549 passing, including 14 new in `billing/policies.test.ts`
  (policies, `consume` with burst and fair use, `setFeaturePolicy`).
- **Database:** the entitlements suite passes 20/20, with 3 new tests:
  - a household can neither set a policy nor read its history;
  - the database refuses an incoherent policy whoever writes it;
  - the burst bucket counts in `rate_limit_hit`.
- **Gates:**
  - `npm run eval`: 47/47, with an Unsafe Action Rate of 0/14.
  - `npm run verify:live`: 168/168, with the new table and columns
    probed.
  - Typecheck and lint are clean.
- **Live, on the real project,** with the dev server using a Gemini key
  passed only on the command line:
  - The QA household was put on `pro`, a plan no real household is on.
    Its QA account was made an `operator` for the test only.
  - `PATCH` with a fair-use level above the 2000 allowance got 422 with its
    reason.
  - Setting burst 4/60 s with fair use 1 got 200, and a repeat got
    `changed: false`.
  - Turn 1 went to Gemini. Turns 2–5 were `not_transmitted_fair_use` with
    the disclosure.
  - In one fixed minute, turns 1–4 passed and turns 5–6 got 429 with "Nothing
    was lost". The refused turns were not counted: 9 used, not 11.
  - Clearing the policy was recorded, and the history holds both changes.
  - With the operator row removed, `GET` answered 404.
  - Settings at 360px and 1280px showed the counts and both policy sentences,
    with no horizontal overflow.

## What a reader should know

- **Windows are fixed, not sliding.** A spike that straddles two windows can
  reach up to 2N across the boundary. That is the accepted cost of one
  atomic counter per window, and the policy's wording says "per minute", not
  "in any minute". The first live QA run found exactly that before the
  wording was fixed.
- **HomeTalk only.** Only HomeTalk calls `consume` today. Any other metered
  path gets the same policies the moment it calls `consume` rather than
  `may`.
- **No admin screen.** There is no platform-admin screen for policies. Like
  subscription administration (16-005), it is API-only.

## Test data cleanup

Recorded after the merge, below.
