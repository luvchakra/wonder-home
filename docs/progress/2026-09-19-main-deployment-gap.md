# Production was 11 commits behind — merged and closed the gap

**Date:** 2026-09-19
**Scope:** deployment, CI, `scripts/test-entitlements-rls.mjs`
**Status:** Done

## What was wrong

A second report that `/help` "is still behind login" turned out not to be a
code defect at all. The fix from the same day (see
[help-public](2026-09-19-help-public.md)) was correct and tested — it had
simply never reached production.

`main` was 11 commits behind this branch, back to `5efc582` on 2026-09-18.
Every PR opened from this branch since then had been closed without merging.
Confirmed directly against the live site rather than assumed: `curl -L
--max-redirs 0 https://wonderhome.vercel.app/help` returned a 307 to
`/sign-in?next=%2Fhelp`, `icon-dark.svg` 404'd, and the deployed landing HTML
still carried the pre-brand-mark logo path — proving production predated
almost this entire session's work, not just the `/help` fix.

## What changed

Opened PR #18 (11 commits: `/help` public, module 15 complete — AI privacy,
audit, Privacy Centre, security suite — the commerce connector, plan-change,
and the traced brand mark) against `main`.

CI failed on the first push. Root-caused via the job's full logs (not just
the truncated tail, which was dominated by container-lifecycle noise and
intentional RLS negative-test errors): two tests in
`test-entitlements-rls.mjs` were asserting an invariant that story 20-004 had
intentionally narrowed. The old test denied *any* member from writing to
`household_subscriptions`; the new plan-change route writes through the
household admin's own session, so migration
`20260919160000_plan_change_policy.sql` added an admin-only insert/update
policy — which the household's own creator (role `head`) satisfies. The test
used that same creator as its "should be denied" actor, so it started
passing when it should have failed, and its leftover row then broke the next
test's fixture insert with a duplicate-key error.

Fixed by testing the invariant that actually survives: added a non-admin
`ADULT` member and asserted *that* profile is denied, added a positive case
proving the admin path the new policy exists for, and switched the fixture
inserts to `on conflict … do update` so passing tests don't collide.
Deliberately not a widened PR or a skipped test — the failure was this PR's
own migration outrunning its own test suite.

Pushed the fix, waited for CI, then merged PR #18 into `main` (merge commit
`9830821`) once `ci` was green and `mergeable_state` was `clean`, per this
session's standing instruction to merge automatically without asking once
CI passes.

## What was verified

- `npm run test:db` — 211/211 (full RLS suite, not just the one file)
- `npm run test`, `typecheck`, `lint`, `npm run security` (9/9 areas) — clean
- CI green on the PR's final commit before merging (`ci`, "Vercel Preview
  Comments" success; "Supabase Preview" skipped — see below)

## What is still open

- **Stale "Supabase Preview" GitHub check.** It points at an old Supabase
  project (`stehegovxlssxdepiruk`, Tokyo) rather than the one actually in use
  since the Mumbai move (`kqxndableyysxqhxiorz`; see
  [database-move-to-ap-south-1](2026-09-18-database-move-to-ap-south-1.md)).
  Currently shows "skipped" so it isn't blocking, but it's a leftover
  integration that should be reconfigured or removed. Not yet raised as a
  decision — flagging it here so it isn't lost.
- **Vercel account mismatch in this session's tool access.** The Vercel MCP
  connection here is scoped to a different account (`luvchakras-projects`)
  than the one that actually hosts the live site (`wonder-team4/wonderhome`,
  visible only via the GitHub deployment status). This session cannot inspect
  the real production Vercel project directly; anything about the live
  deployment was confirmed by curling the public URL instead.
- Production should now redeploy from `main` automatically (Vercel's GitHub
  integration); this note does not include a post-deploy live check, since
  that happens on Vercel's own schedule outside this session's control.

## Standing instruction, going forward

The user asked that PRs from this branch always be merged into `main`
automatically, without asking — but not at the cost of shipping broken code.
This session's read of that instruction: still fetch CI status and only
merge once it is green; a red PR gets fixed and re-verified first, exactly as
happened here.
