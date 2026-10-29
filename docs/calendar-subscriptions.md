# Subscribe to any calendar (ICS / webcal), and later Google/Outlook

Owner request, 2026-10-29 (Settings → Connections): "add feature to subscribe to
any kind of calendar." Design-first and phased. The owner's two decisions, asked
and answered the same day:

- **Both mechanisms, link first.** Ship the share-link (ICS/webcal URL) method
  now, fully. Queue account sign-in (Google/Outlook OAuth) as a later story.
- **Visibility is chosen per calendar.** When someone adds a calendar they pick
  whether it is **shared with the whole household** or **personal to them**.

This is a HomeEvents feature (backlog 26, new story 26-022) that leans on
External Integrations (backlog 17) discipline: provider-neutral, off until
configured, deterministic ports and mocks first, and never a claim of a live
integration that is not.

---

## What phase 1 does

A person adds any calendar by its share link — an `https` ICS URL or a
`webcal://` URL (Google, Outlook, Apple, a school, a sports team, public
holidays, a shared family calendar). WonderHome:

1. **Fetches it safely** (SSRF-guarded, size- and time-bounded, DNS-pinned).
2. **Parses the ICS defensively** (untrusted text, capped event count, bounded
   recurrence expansion).
3. **Imports its events read-only** into the WonderHome calendar, each marked as
   coming from that subscription.
4. **Re-syncs periodically** on the delivery clock, idempotently (UID dedup).
5. Lets the person **name** it, optionally **colour** it, set its **visibility**,
   and **remove** it — removal deletes its imported events.

Imported events cannot be edited in WonderHome. They are a read-only projection
of a feed the household does not own.

### Not the same as the existing Calendar connector

External Integrations story 17-002 ("Calendar") is a **free/busy** connector:
"never the titles", private entries become time-only, and it reconciles into
`family_events` by a provider's identity. This subscription feature is
**different and intentional** — the person chose *this specific feed*, so we
import its **real event details** (title, time, place), read-only. The two stay
clearly distinct in the UI (two different cards on Connections) and in the data
(subscriptions live in their own table; free/busy sync uses the connector
framework). Neither changes the other.

---

## Why a dedicated table, not the `connections` framework

The `connections` / portal-fetch machinery (browser-automation and REST
connectors) exists to **file items into HomeSend for confirmation**. A calendar
subscription is the opposite shape: the person already decided to trust this
feed, so its events are imported **directly and read-only**, never queued for a
yes. It also carries calendar-domain concepts the connections table has no place
for — per-feed visibility, an optional colour, an imported-event count, a
cascade that removes events when the feed is removed. So subscriptions get their
own table and their own small sync path, and reuse the **shared, audited** parts:
the SSRF-safe fetcher, the untrusted-content handling, the `family_events` store,
and the pg_cron delivery clock.

---

## Data model

### `calendar_subscriptions` (new)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `household_id` | uuid | → `households(id)` on delete cascade |
| `created_by_member_id` | uuid | → `household_members(id)` |
| `name` | text | 1–80 chars; what the person calls the feed |
| `url` | text | normalised `https` URL (`webcal://` → `https://`) |
| `color` | text | optional brand token key, else null |
| `visibility` | text | `household` \| `private` (default `household`) |
| `owner_member_id` | uuid | set when `private`; the member who added it |
| `status` | text | `active` \| `error` \| `paused` |
| `last_sync_at` | timestamptz | |
| `last_sync_status` | text | `ok` or a closed-word failure reason |
| `last_error` | text | closed-word reason shown to the person |
| `event_count` | int | imported events currently live |
| `next_sync_at` | timestamptz | the delivery clock claims rows where this ≤ now |
| `sync_interval_minutes` | int | re-sync cadence (default 360 = 6h) |
| `created_at` / `updated_at` | timestamptz | |

**RLS (set-form helpers only, no per-row helpers):**

- SELECT — a member of the household sees household feeds; a private feed is
  seen only by its owner:
  `household_id in (select wh.member_households()) and (visibility = 'household'
  or (household_id, owner_member_id) in (select household_id, member_id from
  wh.my_memberships()))`
- INSERT/UPDATE/DELETE — an **adult** of the household manages household feeds;
  only the owner manages their own private feed:
  `household_id in (select wh.adult_households()) and (visibility = 'household'
  or (household_id, owner_member_id) in (select household_id, member_id from
  wh.my_memberships()))`

**Indexes:** `(household_id)`; `(next_sync_at)` where `status = 'active'` (the
delivery-clock claim); `(household_id, owner_member_id)`.

### `family_events` additions

- `source_subscription_id uuid references calendar_subscriptions(id) on delete
  cascade` (nullable). **This FK is how "removing a feed removes its events"
  works** — a `delete` of the subscription cascades to its events in one step.
  Indexed (every FK gets an index).
- Imported events set `external_id` to the ICS `UID` (for a recurring series,
  `UID` + the occurrence date), so re-sync upserts rather than duplicates. A
  **partial unique index** `(source_subscription_id, external_id) where
  source_subscription_id is not null` makes the upsert a true conflict target
  and makes a feed that repeats a UID safe.
- **Read-only enforcement:** the user-facing write policies on `family_events`
  gain `and source_subscription_id is null`, so a household member can never
  edit or delete an imported event through their own session. The sync writes
  with the service-role (admin) client, which is the single-door exception
  already carved out for "an integration's sync, keyed by the provider's id"
  (`single-door.test.ts`).

**Migration safety (either order).** Both changes are additive. On existing rows
`source_subscription_id` is null, so `and source_subscription_id is null` is a
no-op for every event that exists today, and readers that do not yet know the
column keep working. The migration is applied right after the deploy is READY
and then the calendar screens are loaded to confirm (per CLAUDE.md).

---

## Dedup by UID (idempotent re-sync)

Each VEVENT carries a `UID`. The importer keys every imported event by
`(source_subscription_id, external_id)`:

- non-recurring: `external_id = UID`;
- recurring (expanded, see below): `external_id = UID + "@" + occurrenceDate`.

Re-sync is a diff against what is currently imported for the feed:

- a UID/occurrence still in the feed with changed fields → **update** in place;
- a new UID/occurrence → **insert**;
- an imported event whose UID/occurrence is **no longer in the feed** → delete
  (it was cancelled or fell out of the window).

Running re-sync twice over an unchanged feed changes nothing. Phase 1 always
re-fetches and re-parses (the feed is bounded at ≤ 2 MB, so this is cheap); a
conditional GET (`If-None-Match` / `304 Not Modified`) is a clean follow-up.

---

## Refresh (the delivery clock)

WonderHome has two periodic mechanisms: pg_cron → a cron-secret API endpoint
(notifications dispatch, every 5 min), and pg_cron → a jobs table drained by the
Fly portal worker. Calendar re-sync uses the **first** pattern because an ICS
fetch is one light HTTP GET + parse, well within a serverless function, and it
keeps the whole feature inside the web app with no new worker job type.

- A pg_cron schedule calls `POST /api/v1/calendar/subscriptions/sync` with the
  Vault `cron_secret`.
- The endpoint claims active subscriptions whose `next_sync_at ≤ now`, **bounded
  per run** (a small batch), syncs each, and sets `next_sync_at = now +
  sync_interval_minutes`. A feed that errors backs off and records
  `last_error`.
- **Initial sync** runs from the subscribe action via `after()` (off the request
  path) so the person sees events shortly after adding the feed, with
  `next_sync_at` seeded to now as a fallback.
- A person can **Sync now** from the Connections card (sets `next_sync_at = now`
  and triggers a one-feed sync via `after()`).

Everything that can wait runs after the response; nothing fetches on the request
path.

---

## Removal / cleanup

Removing a subscription **deletes the row**, and the `on delete cascade` FK
removes every `family_events` row it imported in the same statement. Imported
events are a disposable projection of an external feed — there is no grace window
to keep (re-subscribing re-imports them), so this is a hard cascade, not the
soft-delete retention path used for household-authored data. The design note for
the retention session: imported events are removed with their feed and never
accumulate; they are also covered by the existing `family_events.soft_deleted_at`
readers, so a retention sweep that ever touches them stays consistent.

---

## SSRF and untrusted content

**The URL is somebody else's string, fetched by a server inside a private
network holding cloud credentials.** So:

- `webcal://` is normalised to `https://`; only `https` is accepted.
- The fetch reuses the **audited** safe-fetch path in
  `homesend/link-fetch.ts` — `validateLinkUrl` (scheme, no embedded
  credentials, default ports, blocked host suffixes, numeric-host tricks), then
  **resolve every address and require all public**, then **pin** the checked
  address so a second DNS answer (rebinding) cannot swap it, redirects followed
  by hand (≤3) each re-checked, no cookies/Authorization/Referer, size- and
  time-bounded. A non-public or malformed URL is refused with a clear,
  closed-word message (like HomeSend's `link_blocked`).
- Content type must be `text/calendar` (or `text/plain` /
  `application/octet-stream`), and the body must begin with `BEGIN:VCALENDAR`
  after trimming — otherwise it is refused as not a calendar.

**The ICS body is untrusted.** `SUMMARY`, `DESCRIPTION`, `LOCATION` and every
other text field are sanitised and length-capped. Anything bound for an AI step
is wrapped by `fenceUntrusted`; `detectInstructionInjection` runs for display
signalling. The importer never executes anything from the feed. Bounds: feed
size ≤ 2 MB, ≤ 1000 events per feed, recurrence expansion ≤ 200 occurrences per
rule within `[now − 30 days, now + 365 days]`.

---

## Recurrence (phase 1)

Full RRULE and VTIMEZONE handling is large. Phase 1 expands the **common** rules
and caps them:

- `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY` with `INTERVAL`, `COUNT`, `UNTIL`, and
  `BYDAY` (for weekly), expanded to single events within the sync window, capped
  at 200 occurrences, honouring `EXDATE`.
- A rule we do not expand → import the **first** instance only (so nothing is
  silently dropped) and note it.

Times: date-only `VALUE=DATE` → an all-day event; `Z` (UTC) → the exact instant;
`TZID=<IANA>` → the wall time converted to an instant in that zone; a floating
time → the household's time zone. Each imported event keeps its own `timezone`.

---

## Who may add (phase 1)

**RLS** permits any **adult** of the household to add and manage subscriptions
(`wh.adult_households()`), and only the owner to manage a personal feed. The
**phase-1 UI entry point** is the Calendar connection card on Settings →
Connections (the per-connection redesign, #444), which the page shows to members
who manage integrations — so in practice an Admin adds and manages feeds on that
screen, while the RLS still lets any adult do so through the API. Broadening the
on-screen entry point to every adult, and a child's add via a guardian, are
small follow-ups; phase 1 keeps the one screen the redesign gave Calendar.

---

## Phased plan

- **Phase 1 — share link (this work, story 26-022).** Safe fetch, subscribe,
  defensive ICS parse, read-only import, idempotent re-sync on the delivery
  clock, per-feed visibility/name/colour, remove-with-cleanup, Connections-page
  card, help in eight languages, tests.
- **Phase 2 — account sign-in (story 26-006, reframed).** Google Calendar and
  Outlook via OAuth, behind a separate approval: token storage in the
  `connection_secrets` pattern (service-role only), refresh, scope-minimised
  read, and the option of two-way sync as a later decision. The import target
  (`family_events` + `source_subscription_id`), read-only surfacing, dedup and
  removal built here are reused; only the acquisition changes from a URL to an
  OAuth grant.

---

## Open choices for the owner

1. **Default re-sync cadence** — proposed 6 hours. Public-holiday and school
   feeds change rarely; a sports feed can change same-day. A per-feed cadence
   choice could come later.
2. **Colour** — phase 1 stores and shows the feed colour as the event's source
   tint/label. Full per-feed colour theming of every calendar cell (vs. the
   existing category colours) can be a follow-up if the owner wants it.
3. **Private-feed events and HomeTalk/HomeBrain** — imported events surface on
   the calendar under the adder's visibility. Whether HomeBrain should reason
   over a *private* subscription's events (it already respects event visibility)
   is worth confirming; phase 1 keeps them to the calendar projection, which
   HomeBrain already reads with visibility applied.
4. **Recurrence rules we do not expand** — phase 1 imports the first instance of
   an unusual rule. If owners hit feeds that rely on those, phase 1.5 widens the
   expander rather than adding a dependency.
