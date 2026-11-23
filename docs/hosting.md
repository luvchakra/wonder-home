# Hosting

Reference detail moved verbatim from CLAUDE.md (2026-10-24, token-economy pass). Summary rules stay in `CLAUDE.md` under *Where it is hosted*.

## Where it is hosted
Since October 2026 WonderHome lives in the Vercel account **Kunal** (team `kunals-projects-9f64757f`, `team_nGnxn1FrUI78kVpMm12R7FIF`, Hobby plan) — the account the Vercel connector is signed in to. The earlier teams (`wonder-team4`, `luvchakras-projects`) are history; older progress notes that name them are superseded.

| Vercel project | Id | Serves |
|---|---|---|
| `wonderhome` | `prj_wmkKrjqrezwGc8av9LEdjbcU46cO` | `home.wonderapps.biz` (this app, production from `main`) |
| `wonder-apps` | `prj_eAN93HE8LG4URCWU0JlhBQtokWuM` | `wonderapps.biz`, `www.wonderapps.biz` |

New deployment URLs end in `-kunals-projects-9f64757f.vercel.app`. Deployments made before the move still end in `-wonder-team4.vercel.app`; that is the old team's URL slug, not a second team. Call the Vercel connector **without** a `teamId`/`slug` — it then works against this team, the account's default; naming the team explicitly is refused with 403 until the connector is re-authorized for that scope. The live database is Supabase project `wonderhome` (`kqxndableyysxqhxiorz`, ap-south-1).


## Configuration lives in Platform admin

Since 2026-11-22 Vercel holds only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and optionally `SUPABASE_ACCESS_TOKEN`, `CSP_MODE`, `LOG_LEVEL`, `NEXT_PUBLIC_SITE_URL`, `WONDERHOME_PLATFORM_ADMINS`. Everything else, webhook secrets included, is saved in Platform admin; a variable left in Vercel is only a fallback until the value is saved there. A redeploy that loses variables then breaks nothing but the four bootstrap ones. Inventory: `docs/progress/2026-11-22-platform-config-one-place.md`.

## AI settings are not Vercel variables

WonderHome's AI key, provider and model names live only in Platform admin → AI & providers (owner, 2026-11-21). Vercel variables and GitHub secrets named `WONDERHOME_AI_*`, `WONDERHOME_SPEECH_KEY` or `WONDERHOME_GEMINI_*_MODEL` are ignored by the code and can be deleted; see `docs/external-providers.md` and `docs/progress/2026-11-21-ai-key-one-place.md`.

## Background jobs
Scheduled and batch work runs on GitHub Actions (`.github/workflows/background-jobs.yml`, since 2026-11-07), not on Vercel. Since 2026-11-23 the 5-minute delivery tick does too: pg_cron dispatches `.github/workflows/delivery-clock.yml` through the GitHub API with the token saved in Platform admin → Integrations → Background jobs (`GITHUB_DISPATCH_TOKEN`, a fine-grained token, this repository only, Actions read and write), because GitHub's own schedule runs hours late. Vercel's dispatch route (pg_cron → `/api/v1/notifications/dispatch`) stays as the fallback: one heartbeat read, then it answers while GitHub is healthy. Vercel keeps the retry queue, the daily sweeps that send notifications, inbound webhooks and everything a person waits on. It takes any moved step back by itself when GitHub's heartbeat (`platform_job_heartbeats`) goes stale. The map, the reasons and the cut-over steps are in `docs/background-jobs.md`.

## Platform staff from `WONDERHOME_PLATFORM_ADMINS` (owner, 2026-11-22)

Who may open Platform admin is set in Vercel, never in Platform admin (that would let anyone who can write the settings store make themselves staff). Value: comma-separated `email` or `email:role`, role `support`, `operator` or `owner` (no role = `operator`; `owner` is full control), e.g. `you@example.com:owner, helper@example.com:support`. Redeploy after changing it.

- Only a verified email counts: a Google sign-in, or an email-and-password account with a confirmed email. Phone-only accounts never match; two accounts sharing an email are judged separately. The email is read from the auth server, never the browser, and no account is ever created.
- Applied at sign-in, and on each person's first request after a server start (`platform/admins-variable.ts`; once per person per server, no query after that). It grants, changes the role, reactivates and, once an email is removed, suspends — only rows it made (`platform_admins.source = 'variable'`). A row added by hand (`manual`) is never touched.
- Every change is audited (`platform_admin.granted`, `.role_changed`, `.suspended`) with the email only as a fingerprint and a masked form. Entries that aren't understood are ignored, logged once without the email, and shown under Configuration health. Platform admin → Security lists staff read-only: name, masked email, role, status and source.
