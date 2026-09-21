# Delivery channels (06-008), and the migrations that never shipped

## What was done

### Story 06-008 — Channels

`packages/core/src/notifications/channels.ts` is the delivery layer that
sits under `decide.ts`'s decision engine: given a decision to notify
someone, which of their channels actually get it, and what happened.

- A provider-neutral `ChannelAdapter` contract (`{ channel, live, send() }`),
  matching the shape module 17's connectors already use for the same
  reason: swapping a real provider in later must not change a line of
  domain logic.
- `in_app` is genuinely `live: true` — the notification row already exists
  by the time this runs, so "sending" it is definitionally done.
- `push`, `email`, `whatsapp` are deterministic fixtures, `live: false`.
  They refuse to claim delivery — a fixture without a target says
  `no_target`; one with a target still says `not_configured`, never `ok` —
  because no real provider is wired in for any of them yet (CLAUDE.md's
  External Providers rule).
- `selectChannels` is the pure policy: skips a disabled channel, skips
  push/whatsapp without an address on file (email needs none — it resolves
  from the account), respects each channel's *own* quiet hours rather than
  one shared window, and lets a `critical` notification override them.
- New column `notification_preferences.target` (migration
  `20260921080000_notification_channel_targets`) — a phone number for
  WhatsApp, an opaque subscription reference for push. Put on
  `notification_preferences` rather than `household_members` deliberately:
  the existing RLS on that table already lets a member manage only their
  own row (`notification_preferences_write_own`), so a person sets their
  own contact address with no Admin involved, unlike the profile fields on
  `household_members` which are Admin-only.
- New `/settings/notifications` page: every one of the four channels gets
  a real card — its own enable toggle, its own quiet hours, and (WhatsApp)
  its own number field — all genuinely savable. Push/email/WhatsApp say
  plainly "Not connected for this deployment yet — your preference is
  saved for when it is," so the toggle is never a button that does nothing
  (design rule 10): it records a real preference against the day a
  provider exists, it just does not pretend to deliver today. Replaces
  Settings' old "Notifications" row, which linked to the notification
  *inbox* (`/notifications`) where a preferences screen belongs instead —
  the inbox is already reachable from the bell icon in the header.
- 46 unit tests on `channels.ts` (selection policy, every adapter, dispatch
  reporting every channel's own outcome, a stub-adapter injection point for
  tests that should not depend on the real fixtures' behavior) and 3 new
  RLS tests proving a member sets their own WhatsApp number, a malformed
  one is refused by the check constraint, and a push target is free text.

### The production incident this surfaced

Verifying the new page in a browser against the QA test account showed a
React error ("Functions cannot be passed directly to Client Components") —
fixed by resolving the channel icon inside the client component instead of
passing a Lucide component as a prop across the server/client boundary.

Fixing that let the real problem show through: saving a preference
returned success, but nothing persisted. Querying the live project
directly found `notification_preferences.target` did not exist there —
this story's own migration had never been applied to the live Supabase
project. Checking `list_migrations` against the project found it was not
alone: **`agent_run_contracts`, `household_feature_flags` and
`household_member_profile_fields` — three earlier stories, all merged, all
marked `Done` in the trackers — had never been applied either.**

`household_member_profile_fields` (from the person-detail work) is the one
that actually broke something live: `listMembers()`'s `MEMBER_SELECT`
queries `nickname, relationship, occupation, school_or_work_location,
special_occasion_label, special_occasion_date` — every one of those
columns did not exist on the live table, so the query threw
`42703: column does not exist` on every single call. `home-dashboard.tsx`
calls `listMembers(...).catch(() => [])`; several other pages have the
same pattern. The error was real; it was just swallowed into an empty
member list everywhere it was read. That is the exact shape of the bug
reported live: the Home page's Family status section gone, no family
members under Family, the househelper not visible, responsibilities
showing as unassigned — none of it was data loss. `Asmi Family`'s real
rows (4 members, 7 responsibilities, all correctly linked) were intact in
the database the entire time; the household's own attempt to set a
nickname ("Baba", found still sitting on one member's row) is what first
hit the broken write path.

**Fixed**: applied all four pending migrations to the live project via the
Supabase MCP `apply_migration` tool, in order, then confirmed the exact
`MEMBER_SELECT` query against the real household through PostgREST (not
just raw SQL) returns all four members with their roles correctly. Also
confirmed all seven responsibilities' primary/backup assignments resolve
correctly. Cleaned up two orphaned test households this session's own QA
verification had left behind (`qa-test-user.mjs`'s documented, expected
residue) so they were not sitting in the live project.

**Long-term fix**: `scripts/verify-live-project.mjs` gained
`SHIPPED_COLUMNS` — the same "did this actually land" check `SHIPPED_TABLES`
already does, but for a column an `alter table` migration adds to a table
that already existed, which is exactly the failure mode `SHIPPED_TABLES`
alone can never catch (the table is already there). `CLAUDE.md` gained a
standing instruction: apply every migration to the live project via the
Supabase MCP in the same session that writes it, and run `verify:live`
afterward — never trust a green from-scratch `test:db` run as proof the
live project has it too, because it proves the migration is *correct*,
not that it *shipped*.

## Verified

- `npm run verify` clean end to end: 46 unit (up from 43), 238 database (up
  from 235), 256 E2E.
- `npm run verify:live` — 74/74 (up from 70; the four new checks all pass
  against the now-corrected live project).
- The exact `listMembers` query for the real household, run against
  PostgREST with the service-role client (not raw SQL), returns all four
  members with roles. All seven responsibilities' primary/backup
  assignments resolve to real names.
- Verified `/settings/notifications` in a browser at 360px and desktop: all
  four channel cards render, the fixed bottom tab bar does not obscure the
  last card or the closing `QuoteCard` on real scroll (an earlier
  programmatic-`scrollTop` test suggested otherwise and was itself the
  artifact — a real wheel-scroll reaches true bottom cleanly), and a
  WhatsApp number + toggle saved and reloaded correctly once the schema
  was fixed.

## What's still open

- Push, email and WhatsApp remain fixtures. Going live on any of them
  needs a real provider's credentials, consent flow and integration tests
  — nothing here claims otherwise.
- No live event pipeline yet calls `decideNotification` →
  `dispatchToChannels` end to end; this module (like 06-001 through
  06-007 before it) is tested domain logic, consistent with how the rest
  of module 06 shipped. The gap is architectural (no background worker in
  this deployment), not something this story could close on its own.
- Whether any *other* live-project drift exists beyond the four migrations
  found here was not exhaustively audited — `SHIPPED_TABLES` and
  `SHIPPED_COLUMNS` in `verify-live-project.mjs` cover what is known to
  matter today, not a full schema diff.

## Where the code lives

- `packages/core/src/notifications/channels.ts`, `channels.test.ts` — new
- `packages/core/src/notifications/preferences.ts` — new
- `supabase/migrations/20260921080000_notification_channel_targets.sql` — new
- `apps/web/app/settings/notifications/page.tsx` — new
- `apps/web/app/_components/notification-preferences-form.tsx` — new
- `apps/web/app/(auth)/notification-preferences-actions.ts` — new
- `apps/web/app/settings/page.tsx` — Notifications row now links to the new page
- `scripts/test-notifications-rls.mjs` — 3 new tests
- `scripts/verify-live-project.mjs` — `SHIPPED_COLUMNS`
- `CLAUDE.md` — "Applying a migration to the live project"
- Live project (`kqxndableyysxqhxiorz`): four migrations applied
  (`agent_run_contracts`, `household_feature_flags`,
  `household_member_profile_fields`, `notification_channel_targets`); two
  orphaned test households removed
