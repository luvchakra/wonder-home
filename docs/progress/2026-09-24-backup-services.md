# Backup services: cover while a helper is away (story 07-008)

## What was done

When a helper is away and nobody at home covers one of their outcomes, the
household can now keep a list of outside services that can: a cleaning
service, a cook who fills in. WonderHome offers the right one for exactly
the days it is needed. One tap arranges it.

- **Migration** `supabase/migrations/20260927160000_backup_services.sql`
  (applied live):
  - `backup_services` holds a name, a contact, the outcome keys the service
    covers, notes, and whether it is active. It is Admin-only through RLS,
    like a helper's arrangement. It has one name per household, compared
    case-insensitively.
  - A service is retired, never deleted, so a cover request keeps its
    provider.
  - `service_requests` gains `backup_service_id`, `cover_outcome_key` and
    `cover_on`. A unique index allows one open cover per outcome and day; a
    cancelled cover frees the day.
  - A trigger refuses a cover that names another household's service.
- **`packages/core/src/household/backup-services.ts`**:
  - `planBackupCoverage` reuses 07-002's `assessAbsence`. It lists only the
    outcomes an absence leaves uncovered, because a household member's
    backup is handled, and handled is silent. Each item is `arranged`,
    `service_available` (with the services that fit) or `nobody`.
  - `arrangeCover` creates an ordinary 13-006 service request with the
    service's name and contact and the household's move next ("Confirm with
    … that they can cover it"). It is idempotent, including under two
    simultaneous taps.
  - Also here: `listBackupServices`, `createBackupService`,
    `updateBackupService`, `setBackupServiceActive` and `loadBackupCoverage`.
  - Every write invalidates the household's HomeTalk context.
- **Househelper screen:**
  - Overview now leads with "While they're away", the thing most likely to
    need the Admin (rule 17). It covers the next 14 days: an arranged day
    says so, a service that fits gets an "Arrange …" button, and nobody gets
    "Find cover".
  - The Tasks tab keeps the backup services. Admins can add one, choosing
    which outcomes it covers from a checkbox list, and edit, retire or
    restore it, with icon actions that carry labels.
- **API:** `GET` and `POST /api/v1/households/{householdId}/backup-services`
  (services plus the fortnight's cover) and
  `POST /api/v1/households/{householdId}/backup-services/cover`. Both are
  Admin only, and the OpenAPI document is updated.

## Why

The story asks WonderHome to coordinate backup services where available.
When helper availability changes, the planner should find only the
outcomes that actually need backup, and learning should come from outcomes,
never from surveillance. Everything here is about outcomes and days. Nothing
looks at what a helper did.

## What "marketplace" does not mean here

No service marketplace or booking provider is connected. WonderHome does not
book anyone. The household calls the service, and the cover request keeps
the next move with them. If it stays unconfirmed for two days, Home & Upkeep
raises it through 13-006's existing stall rule. A real booking provider
would sit behind the same service request as a person's errand: an account,
credentials and a contract. There is nothing to invent until then.

## Verified

- **Unit tests:** 2565 passing, 5 of them new in
  `household/backup-services.test.ts`:
  - only uncovered outcomes are listed;
  - only the absent helper's own outcomes are considered;
  - an arranged day is marked arranged, and a retired service is never
    suggested;
  - nothing is listed when nobody is away;
  - the request subject stays within its limit.
- **Database:** the home suite passes 26/26, with 4 new tests:
  - backup services are Admin-only, and neither a non-Admin member nor an
    outsider can read or write them;
  - a name is unique per household, and covers must be outcome keys;
  - there is one open cover per outcome and day, and a cancelled one frees
    the day;
  - a cover request cannot borrow another household's service.
  - Tenant isolation passes.
- **Gates:** `npm run verify:live` passes 176/176, with the new table and
  columns probed. Typecheck, lint and the migration lint are clean.
- **Browser, on the real project, at 360px and 1280px, with no horizontal
  overflow:**
  - The QA household had a helper with two outcomes and an absence two days
    out. Overview listed both as uncovered.
  - A service added through the form, covering "Home cleaned", was then
    offered for that outcome only. "Dinner prepped" still read "nobody covers
    it yet".
  - One tap created the service request, with provider, contact, the
    household as the next mover, and the outcome and day. Overview then read
    "cover is arranged".
  - Retiring the service kept the arrangement, and restoring it brought the
    service back.

A defect was caught in QA: the success message first said the request was
"on your service list". Home & Upkeep lists only what needs someone, so the
message now says what really happens: call to confirm, and it will come up
if it is still unconfirmed in two days. The server action also refreshed the
wrong path (`/home`); it now refreshes `/household/home`.

## Test data cleanup

Recorded after the merge, below.
