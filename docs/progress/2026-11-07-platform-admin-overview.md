# Platform admin Overview: needs you, growth, health (16-014)

**Asked (owner, 2026-11-07):** "make the overview more insightful, useful and actionable for the admin". The old Overview showed three totals and four settings tiles.

## What changed

`/platform-admin` now reads, top to bottom, in the order an admin decides (rule 17):

1. **An opening sentence** stating the state in words (rule 7), e.g. "All systems healthy. 2 things need you: 1 setting still comes from Vercel, 23 Vercel variables can be deleted." With nothing raised: "All systems healthy. Nothing needs you right now."
2. **Needs you**: one row per raised signal: icon, what it is, why it matters, and one action (rule 4). Most urgent first:
   - *Problem*: a failing background job (heartbeat error newer than its last success; links the GitHub run); an open AI key alert (`ai_key_alerts`); HomeTalk failing (≥3 failed turns in 24 h and ≥20% of turns); billing (unresolved reconciliation findings, or the last run failed).
   - *Attention*: background jobs stale on GitHub (Vercel has taken them back); a HomeSend failure spike (≥3 in 24 h and more than twice the previous week's daily average); reminder delivery failures (≥3 and ≥10% of attempts in 24 h); advisor findings above the accepted baseline (live reads only); failed plan payments this week; open support grants.
   - *Tidy-up*: settings still from Vercel; Vercel variables safe to delete; quiet setups (households over 3 days old where nobody signed in after the first day).
   Thresholds sit in `NEED_THRESHOLDS` in `packages/core/src/platform/overview.ts`.
3. **Growth & use**, for the last 7 or 30 days (a URL tab) against the period before. Households, People and Support grants tiles, then six cards with a delta in words and a sparkline: new households, active households, active people, HomeTalk turns, HomeSend items, reminders delivered. Households by plan adds up to the total, and the page says so in arithmetic (rule 9). HomeSend's entries show confirmed against still checking. Counts only: no household or person is ever named.
4. **Health**: each background step's last finish and state (on GitHub, Vercel doing it, failing), HomeTalk's 95th-percentile reply time over 7 days, failures in 7 days, advisor findings, the live migration count, and the time the figures were read.
5. **Settings** is now one compact row with the counts. **Services** is unchanged.

"Active" means a person made a recorded change (`audit_events`) or sent HomeTalk a message. Days are India time.

## How it is built

- **One call:** `public.platform_overview(p_staff_profile_id)`, in migration `20261107234500_platform_overview.sql`. It is SECURITY DEFINER and executable by `service_role` only, and it checks inside the function that the caller is active platform staff (the same pattern as `platform_performance_snapshot`). Each source is read once and grouped by day. Every time-based read is bounded to 60 days, with a `created_at` index added on each table it filters. Live on the real data: about 32 ms warm (the first draft, with correlated per-day subqueries, took about 199 ms).
- **Cached per server for 60 s** (`apps/web/app/_lib/platform-overview.ts`), together with the advisor counts. These are platform-wide aggregates with no household identifiers, and they are read only after the staff check. A failed read is not kept.
- **Pure model** (`packages/core/src/platform/overview.ts`): parse, needs-you rules, opening sentence, growth, plan arithmetic.
- **View** (`apps/web/app/platform-admin/_ui/overview-view.tsx`) is separate from the loader (`page.tsx`), so it can be driven with fixture data.
- **Kit:** a new `Sparkline` (`@wonderhome/core/ui/sparkline`), server-rendered SVG on tokens only. The note is in `design/DESIGN-NOTES.md`. No chart library ships to the browser.
- The test database's `auth.users` stub gained Supabase's `last_sign_in_at` (`supabase/tests/supabase-shim.sql`).

## Verified

- `packages/core/src/platform/overview.test.ts`: 16 tests.
  - Needs-you items come only from real signals, with fixtures for each signal and each threshold edge, plus the empty state.
  - The opening sentence.
  - Growth sums for 7 and 30 days.
  - Plans add up, and the page says when they don't.
  - Parsing.
- `scripts/test-platform-overview-rls.mjs` (part of `test:db`): 5 tests.
  - Anon, members and staff sessions cannot execute the function.
  - The service role gets nothing for a profile that isn't active staff.
  - The figures add up.
  - No household name, person, email or id appears.
  - Quiet setups appear and clear.
  - `test-platform-performance-rls.mjs` still passes.
- Typecheck, ESLint on changed files, `npm run build -w apps/web`, `check:bundle`, `budget:bundle`, `lint:migrations` and `lint:service-role` all pass.
- In a browser: the view was driven with fixture figures (all thirteen kinds of item, stale and failing jobs) at 360 px and 1280 px, with no horizontal overflow at either width. On a phone the row's action moves under its text.
  - This container has no service-role key (`apps/web/.env.local`), so no signed-in QA staff run against live was possible. No QA user or household was created, so there is nothing to clean up.
- The migration was applied to the live project with `apply_migration` (name `platform_overview`) and the function was called against the real data. It is additive, so it is safe in either order.

## Open

- **Not watched yet:** the nightly E2E and other scheduled workflows, and the production deploy state, because the portal holds no GitHub or Vercel token. Adding a read-only token setting would let this page show them; that is the owner's call.
- Migration drift is still covered by CI's `check-migrations-applied.mjs`, not by this page.
- CSP reports are logged and rate-limited, not stored, so there is nothing to count.
- WonderWorks' admin overview (`luvchakra/wonder-jobs`) was not attached to this session, so it could not be mirrored. The layout follows the portal's existing `PageTitle`/`Panel` shapes, which came from it.
