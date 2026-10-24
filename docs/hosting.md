# Hosting

Reference detail moved verbatim from CLAUDE.md (2026-10-24, token-economy pass). Summary rules stay in `CLAUDE.md` under *Where it is hosted*.

## Where it is hosted
Since October 2026 WonderHome lives in the Vercel account **Kunal** (team `kunals-projects-9f64757f`, `team_nGnxn1FrUI78kVpMm12R7FIF`, Hobby plan) — the account the Vercel connector is signed in to. The earlier teams (`wonder-team4`, `luvchakras-projects`) are history; older progress notes that name them are superseded.

| Vercel project | Id | Serves |
|---|---|---|
| `wonderhome` | `prj_wmkKrjqrezwGc8av9LEdjbcU46cO` | `home.wonderapps.biz` (this app, production from `main`) |
| `wonder-apps` | `prj_eAN93HE8LG4URCWU0JlhBQtokWuM` | `wonderapps.biz`, `www.wonderapps.biz` |

New deployment URLs end in `-kunals-projects-9f64757f.vercel.app`. Deployments made before the move still end in `-wonder-team4.vercel.app`; that is the old team's URL slug, not a second team. Call the Vercel connector **without** a `teamId`/`slug` — it then works against this team, the account's default; naming the team explicitly is refused with 403 until the connector is re-authorized for that scope. The live database is Supabase project `wonderhome` (`kqxndableyysxqhxiorz`, ap-south-1).

