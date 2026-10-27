# Portal fetch worker (story 08-033)

Headless-Playwright worker that runs the WonderHome portal fetch engine. **Runs
on Fly, not Vercel** — the Next.js web app stays on Vercel; this is the only
piece that drives a real browser.

## What it does
Polls the `portal_fetch_jobs` queue; for each job it signs into the connection's
portal with Chromium (reusing a saved session, auto re-logging in on expiry),
reads the pages the household listed, and files what it finds through HomeSend.
It holds only the Supabase **service-role key** (a Fly secret) and decrypts each
sign-in at job time.

> Extraction (HomeBrain) and filing (HomeSend) are the next slice — today the
> worker proves live login, session reuse/self-heal and page rendering, and
> reports what it read. See `src/extractor.ts` / `src/filer.ts`.

## Layout
- `src/playwright-browser.ts` — the real `PortalBrowser`/`PortalPage` (the one
  place Playwright is used).
- `src/run-job.ts` — assembles `fetchConnection` for one connection.
- `src/queue.ts` — claim/complete against `portal_fetch_jobs`.
- `src/server.ts` — `GET /health` for Fly.
- `src/index.ts` — the poll loop + server.

## Run locally
```bash
npm run test:browser -w @wonderhome/portal-worker   # real Chromium, mock portal
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run start -w @wonderhome/portal-worker
```

## Deploy (Fly)
The repo-root `Dockerfile` and `fly.toml` build and run **this** app. Secrets:
```bash
fly secrets set -a wonder-home \
  NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role key>" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<publishable key>"
fly deploy
```
Region `sin` (nearest available to Supabase ap-south-1), 2 GB, always-on
(`min_machines_running = 1`) so the schedule runs. Optional:
`PORTAL_POLL_MS` (default 5000), `PORTAL_PROXY_SERVER` (egress proxy; unset on Fly).

## Scheduling
`enqueue_all_portal_fetch_jobs()` enqueues every connected portal; wire it to
pg_cron twice daily. "Fetch now" from the web app calls `enqueue_portal_fetch_job`.
