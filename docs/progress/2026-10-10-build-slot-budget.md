# Build-slot budget: branch deployments off, rules for the daily cap

**Date:** 2026-10-10

## What was done

The Vercel project allows 100 deployments a day, and every deployment Vercel
*creates* counts, including the ones the ignore step then cancels. On PR #191
the cap was reached and Vercel refused the deployment. Production is blocked
the same way when that happens.

- **`vercel.json`.** `git.deploymentEnabled` now turns automatic deployments off
  for `claude/**` and `feature/**` branches. `main` still deploys to production
  on every merge, and nothing else does by default. Preview deployments for
  working branches stop, so UI is verified locally, as CLAUDE.md already asks.
- **`scripts/vercel-should-build.sh`.** The comment no longer claims that
  skipping a docs-only build saves a deployment slot. It saves build minutes;
  the slot is spent when Vercel creates the deployment.
- **CLAUDE.md, "Build-slot budget".** Six standing rules:
  1. Create no deployment you don't need.
  2. One merge to `main` is one production deployment: squash-merge, and docs
     ride with their code.
  3. Tests run on GitHub Actions or locally, never on Vercel.
  4. Verify before pushing, so there are no fix-up pushes.
  5. Count the last 24 hours before deployment-heavy work, and stop
     non-essential deploys above about 70.
  6. When the cap is hit, stop, wait, and redeploy the latest `main` once.

## Verified
- Usage at the time of this change: GitHub's deployment records (`gh api
  repos/luvchakra/wonder-home/deployments`) show 2 deployments in the last 24
  hours, 1 production and 1 preview. Vercel's own API refused this session for
  the team's scope (403), so that endpoint couldn't be used, and the GitHub
  records may leave out deployments the ignore step cancelled.
- `vercel.json` parses, and the ignore script passes `bash -n`.
- CI on the PR. This PR's own branch is `claude/**`, so with the new setting it
  creates no preview. Merging it creates one production deployment.

## Open / needs a person
- **Vercel dashboard.** Confirm only one Vercel project is linked to
  `luvchakra/wonder-home`. This session can't list the team's projects (403).
  A second linked project would double every deployment.
- **Preview on demand.** If a preview is ever wanted for a branch, deploy it
  once by hand from the Vercel dashboard rather than re-enabling branch
  deployments.
