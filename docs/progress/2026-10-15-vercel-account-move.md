# Hosting moved to the Kunal Vercel account

## What changed
WonderHome's Vercel hosting now lives in the **Kunal** account (team
`kunals-projects-9f64757f`, `team_nGnxn1FrUI78kVpMm12R7FIF`, Hobby plan). This
is the account the session's Vercel connector is signed in to, so production
deployments, settings and runtime logs are readable from a session again.
Earlier notes named `wonder-team4` (where the app ran) and
`luvchakras-projects` (where the connector used to point); both are superseded.

The owner confirmed the two correct projects:

| Vercel project | Id | Serves |
|---|---|---|
| `wonderhome` | `prj_wmkKrjqrezwGc8av9LEdjbcU46cO` | `home.wonderapps.biz`, production from `main` |
| `wonder-apps` | `prj_eAN93HE8LG4URCWU0JlhBQtokWuM` | `wonderapps.biz`, `www.wonderapps.biz` |

Deployment URLs of `wonderhome` still end in `-wonder-team4.vercel.app`; that is
the project's original URL slug, carried over by the move.

The database did not move: Supabase project `wonderhome`
(`kqxndableyysxqhxiorz`, ap-south-1).

## Verified
- `get_auth_user`: the connector is the Kunal account, default team
  `team_nGnxn1FrUI78kVpMm12R7FIF`.
- `list_projects` lists both projects; `get_project` returns their domains.
- `list_deployments` for `wonderhome`: latest production deployment `READY` on
  `main` at `41d5c65` (#196).
- Supabase: every one of the 98 migration files in `supabase/migrations/` is
  applied to `kqxndableyysxqhxiorz` by name. The live project also records two
  that have no file of their own (`school_item_times_backfill`,
  `smart_notifications_reconcile_deny_policy`).

## Still open / needs a person
- **Connector scope.** Calls that name the team (`teamId` or `slug`) are refused
  with 403 "re-authenticate to this scope"; calls without one work, because the
  team is the account's default. Re-authorizing the Vercel connector in
  claude.ai for `kunals-projects` removes the limitation. Until then, sessions
  leave the team out (recorded in `CLAUDE.md`, *Where it is hosted*).
- **One project per repository.** Confirm in Vercel (`wonder-apps` → Settings →
  Git) that `wonder-apps` is not also linked to `luvchakra/wonder-home`; if it
  is, every merge to `main` deploys twice against the daily cap.

## Where it lives
`CLAUDE.md` (*Where it is hosted*), `README.md` (*Deploying*), and superseded
lines in the 2026-09-19, 2026-09-20 and 2026-10-10 notes.
