# 2026-10-29 — Subscribe to any calendar by its share link (story 26-022, phase 1)

## What was done
Phase 1 of the owner's 2026-10-29 request ("add feature to subscribe to any
kind of calendar", Settings → Connections). A person adds any calendar by its
`https`/`webcal://` ICS share link; WonderHome fetches it safely, imports its
events **read-only** into the WonderHome calendar marked as from that feed,
re-syncs periodically, and lets the person name it, set its visibility
(household or personal), remove it (which deletes its imported events) and
refresh it. Design-first: `docs/calendar-subscriptions.md`.

The owner's two decisions, asked and answered the same day: ship the link
method now and queue account sign-in (Google/Outlook OAuth) as phase 2
(26-006); visibility chosen per calendar.

## Where the code lives
- **Design:** `docs/calendar-subscriptions.md`.
- **Migration:** `supabase/migrations/20261029090000_calendar_subscriptions.sql`
  — `calendar_subscriptions` table (per-feed visibility/colour, `next_sync_at`,
  counts; RLS set-forms, adult write), `family_events.source_subscription_id`
  (FK `on delete cascade` + partial unique `(source_subscription_id,
  external_id)`), **restrictive** read-only INSERT/UPDATE/DELETE policies on
  imported events, `claim_due_calendar_subscriptions` RPC (service role), and a
  `*/15` pg_cron schedule calling the sync endpoint with the Vault `cron_secret`.
- **Core:** `packages/core/src/calendar/subscriptions/` — `url.ts`
  (webcal→https), `fetch.ts` (`fetchCalendarFeed`), `ics.ts` (defensive
  parser), `time.ts` (TZID/UTC/floating/all-day → instant), `recurrence.ts`
  (bounded RRULE expansion), `import.ts` (sanitised mapping, window, caps),
  `repository.ts` (CRUD + claim/record), `sync.ts` (idempotent fetch/parse/diff).
  The one audited SSRF fetch path is now `homesend/link-fetch.ts` `fetchRaw`,
  shared by `fetchLinkSafely` and `fetchCalendarFeed`. `family_events` writes
  for imports live in `family/repository.ts` (`applySubscriptionImportPlan`,
  `listSubscriptionEvents`, `setSubscriptionEventsVisibility`) to keep
  HomeEvents' single door.
- **Surfacing:** imported events carry `fromSubscription` and are read-only on
  the calendar (`calendar/projection.ts`, `calendar/repository.ts`) and the
  event page (`family/event-detail.ts`, `apps/web/app/calendar/events/[eventId]`);
  never lead as a family moment (`family/schedule.ts`).
- **Endpoint:** `apps/web/app/api/v1/calendar/subscriptions/sync/route.ts`
  (cron-secret, bounded). **Actions:** `apps/web/app/(auth)/calendar-subscription-actions.ts`
  (add/update/remove/sync-now; initial sync and "sync now" via `after()`).
- **UI:** `apps/web/app/settings/connections/calendar-subscriptions-section.tsx`
  + `apps/web/app/_components/calendar-subscriptions-manager.tsx`, wired into the
  Connections page. Distinct from the free/busy Calendar connector (17-002).
- **Help:** `help.guide.connections.body.6` + section `updated` 2026-10-29, in
  all eight languages; UI labels `connectionsPage.cal.*` and the event fact
  `calendar.event.subscription*` in all eight. Knowledge registry: the table is
  excluded (config; its events are `family_events`, which are known).

## Guardrails held
- **SSRF:** reuses the audited `link-fetch` path — https only (webcal
  normalised), no credentials, resolve-every-address-and-require-public, pin the
  checked address (anti-rebinding), redirects re-checked, size/time bounded. A
  private/internal/malformed URL is refused with closed words.
- **Untrusted ICS:** parsed defensively (never throws), text stripped of control
  chars and capped, feed ≤ 2 MB, ≤ 1000 events, recurrence ≤ 200 occurrences in
  `[now−30d, now+365d]`.
- **Read-only:** members cannot edit/delete imported events (restrictive RLS);
  only the service-role sync writes them (the single-door integration exception).
- **Idempotent re-sync:** diff by `(feed, UID[/occurrence])`; a second run over
  an unchanged feed writes nothing; a dropped event is deleted.
- **Visibility:** household vs personal enforced by RLS set-forms (no per-row
  helper); indexed.
- **Removal:** deleting the feed cascades its events; nothing accumulates.

## Verified
- Typecheck (core + web) ✓. Full core suite **5297** pass, web **56** pass,
  subscriptions suites (ICS/time/recurrence/import/fetch-SSRF/sync/surfacing)
  pass. Build ✓. `check:bundle` ✓ (no server-only words in client chunks).
  Lints: migrations, boundaries, embeds, secrets, knowledge, help-links ✓; web
  ESLint ✓. Eval (deterministic) all gates pass, Unsafe Action Rate 0/26 —
  unchanged, as the conversation/model path is untouched (no live-provider run
  warranted). `tracker --check` ✓.
- DB tests (`test:db`) need a local Postgres (not available here); they run in
  CI, and the migration is applied to the live project after deploy with the
  Supabase MCP, then `verify:live`.

## Open / needs a person
- **Live migration:** apply `20261029090000_calendar_subscriptions.sql` to
  project `wonderhome` after the deploy is READY, then `verify:live`.
- **pg_cron:** the sync schedule only runs where the project has pg_cron/pg_net/
  Vault and the `cron_secret` is stored (same as the notification clock).
- **Deferred to follow-ups (flagged in the design doc):** a colour picker in the
  UI (the `color` field/API exist; UI later), editing a feed's settings after
  add (add-time in phase 1), a conditional GET (`If-None-Match`) optimisation,
  a child's add via guardian, and wider recurrence rules.
- **Phase 2 (26-006):** Google/Outlook via OAuth, reusing this import target.
