# Reset home and Download full data (story 15-014)

The owner asked (2026-11-20): "in settings give option to reset home, when it cleans up the entire home, remove all members and all related data, mark it as danger zone, give option to download full data before reset".

## What it does

**Settings → Danger zone** sits at the very bottom of Settings, with a red border and the words "Danger zone", and only the household's owner sees it. It has two things: **Download full data** (first) and **Reset home**, which opens `/settings/reset-home`.

**Reset home** (`/settings/reset-home`, "not found" for anyone but the owner) has three steps:

1. **Download a copy first.** This step is optional. The screen says whether a copy was downloaded in this browser session ("You downloaded a copy in this session at 10:42" / "You haven't downloaded a copy in this session").
2. **What goes and what stays**, listed plainly, with the real counts.
   - **Goes:** the other members, the waiting invitations, every record in every area, and every connected service with its keys.
   - **Stays:** the owner's account, the plan and its billing history, the activity record, and the home's name and time zone.
3. **Confirm.** A final sentence says how many other members go and that it cannot be undone. The owner types the home's name, then gives their password, or uses "Confirm with Google" if they sign in with Google only (a Google sign-in in the last ten minutes, the PR #565 mechanism). The button is the kit's secondary button in the risk colour; the kit has no destructive variant, and the Privacy Centre's delete uses the same pattern.

After the reset, the owner lands on `/onboarding` with the same household id and is its only member, as head. Setup starts again. Other members' sign-in accounts are not touched. On their next request they have no membership, so they get the normal "not in a home" state.

## Who can do it (default, the owner can change it)

- **Only the owner** (`households.owner_member_id`), and only an adult. Another Admin, an adult, a child or a helper cannot.
- **Only in the app.** It is never available by voice, from HomeTalk, from WhatsApp or by an agent. There is no intent, agent tool, Gemini tool or voice capability for it. `household/reset-policy.test.ts` fails if one ever appears.
- **Server-side checks, in this order:** session → membership → `mayResetHome` (owner, adult, app) → the home's name → step-up → `adminGrant.householdOwner` (a grant only the owner can be given, for this one household) → `public.reset_household`. That function can be executed by the service role only, not by `authenticated`, so a browser cannot reach it past the step-up. It checks again, itself, that the profile is this household's owner and that the name matches. Passing another household's id fails with `not_owner`.
- Nothing triggers it except this form: no default, timer, reminder or model.

## What the reset deletes and keeps

`wh.household_tables()` reads the list of tables from the catalog: every public table with a `household_id` (192 today). The reset deletes this household's rows from every one of them except:

- **Kept** (`wh.household_reset_kept_tables()`, said on screen):
  - `audit_events`
  - plan and billing: `household_subscriptions`, `billing_intents`, `billing_events`, `billing_invoices`, `payments`, `payment_refunds`, `payment_customers`, `billing_reconciliation_findings`
  - metering, so a reset is not a way to refill an allowance: `usage_counters`, `trivia_generation_usage`
  - `step_up_verifications`, so a reset does not clear the lockout count
- **The owner's own row** in `household_members` and the `head` role. All other members and roles go.
- **`households` itself** stays (same id). Name and time zone are kept. `key_member_id`, region, currency, measurement system and default language go back to null, as for a new household.

Other details:

- **Integrations and secrets go with their tables:** connection secrets, provider keys, WhatsApp links, email forwarding addresses and allowlists, school portal credentials, Instamart tokens, voice grants, webhooks and API keys.
- **In-flight work goes too:** HomeSend items, Needs-you rows, notifications, `notification_reconciliations` and queued jobs. Reminders are derived from records, and none are left to derive from.
- **One transaction.** Rows are deleted in passes, so foreign keys between household tables are met in any order. Rows a trigger touches are caught by the next pass. If anything is left after 12 passes the function raises, and everything rolls back.
- **It is idempotent.** A second run deletes nothing and writes one more audit entry.
- **One `household.reset` audit entry** records who, when, members removed, invitations revoked, rows deleted and tables cleared. It survives the reset.
- **Storage** (`avatars`, `home-send`, `health-records`, all under `<household_id>/`) is emptied after the commit. Each batch is tried three times, and any leftovers are listed in a `household.reset.files` audit entry. The owner's own photo is kept.

## The download

`POST /api/v1/households/{id}/export/full`: owner only, with the same step-up, streamed back to that request only, `no-store`, and no stored copy or link.

The file is one ZIP:

- `data/<area>/<table>.json`: one JSON array per table, in 16 areas.
- `files/<store>/<path>`: every uploaded file the owner can read.
- `README.txt`: what each file is, row counts, and what is left out and why.

How it is built:

- **It is read with the owner's own session.** `public.household_export_rows` is security invoker, so row-level security and column grants apply exactly as on every screen.
- **Secrets are left out.** Secret-named columns are dropped by the function, and the 26 secret or machinery tables are not read at all (`notExported` in `reset-tables.json`, with a reason for each).
- **Memory stays bounded.** Pages are 500 rows, and the ZIP writer (`household/zip.ts`, stored entries with data descriptors) streams, so memory is one page or one file. `maxDuration` is 300 s.
- **It is audited.** Each download writes a `household.exported` entry.

**Health records decision (a question for the owner).** The security baseline has no rule that lets the owner read another member's private health records, and the existing export follows "an export may not become a way to read what you could not read". So the download holds what the owner can see:

- **Included:** their own health records, their children's, and any shared as household-operational.
- **Left out:** other adults' private health records and private HomeTalk conversations. The README says so.

Visibility of health detail is unchanged everywhere else. If the owner wants everything in the download regardless, that is a change to the security baseline, and it is the owner's call.

## Covered by the schema, not a hand list

`packages/core/src/household/reset-tables.json` classifies every household table once, either into an area for the download or into `notExported` with a reason. Its `kept` list mirrors the database function. `scripts/test-household-reset-rls.mjs` fails when:

- the schema gains a household table that is not classified,
- the file names a table that no longer exists, or
- `kept` differs from `wh.household_reset_kept_tables()`.

The reset itself needs no list; it always covers every household table.

## Verified

- `scripts/test-household-reset-rls.mjs` (local Postgres 16, all 231 migrations): 7/7.
  - table coverage
  - a member cannot call the reset, not even the owner
  - another Admin, a child, and another household's owner are refused, including pointing household A's owner at household B
  - name mismatch
  - the download reads as the caller: the owner's count equals what the screens show, a person's own private record is in their own download, another household is refused, a non-household table is refused, and secret columns are absent
  - **resetting A leaves B byte-for-byte the same**: an md5 of every household table's rows, plus B's `households` row
  - A is left with the owner alone as head, no rows outside the kept tables, the plan kept, and exactly one more audit entry; other members' accounts still exist
  - running it twice is harmless
- Unit tests (vitest):
  - `reset-policy`: owner yes; other Admin, adult, child, helper, another household's owner, and every non-app channel no; no destructive intent or tool exists
  - `zip`: CRC-32, and the archive read back by Python's `zipfile`
  - `full-export`: a file per classified table, paging over 1,000+ rows, files, README content, refusal when the function is missing
  - storage removal retry
  - also `admin-context`, `sensitive-actions` and `audit`, the settings search registry, i18n and help
- `npm run typecheck`, `lint:service-role`, `lint:migrations`, `lint:boundaries`, `lint:boundaries:input`, `lint:help-links`, `tracker --check`, ESLint on the changed web files, `npm run build -w apps/web`, `check:bundle`.
- E2E `e2e/reset-home.spec.ts`, run locally against fresh QA households on the live project (pre-launch, `E2E_ALLOW_LIVE_PROJECT=1`), mobile and desktop: 8 passed, 2 skipped.
  - Signed out: the screen redirects to sign-in, and the download answers 401 with `no-store`.
  - Another Admin sees no Danger zone, and the reset screen shows them nothing.
  - The owner sees the Danger zone last on Settings and the reset screen's three steps. The real member count is shown. The button stays disabled until the name matches, ignoring case and outer spaces. There is no horizontal overflow.
  - Skipped: the owner downloading the ZIP and resetting. That test checks itself whether the migration is on the project and skips until it is, so the nightly cannot go red on it. Once the owner applies the migration it runs in the nightly: ZIP contents, `/onboarding`, the owner alone, records gone, one audit entry, the other account intact.

## Not live until

The migration `supabase/migrations/20261121010000_household_reset.sql` is applied by the owner (SQL Editor). Until then, the code works either way:

- the Danger zone shows,
- "Download full data" answers "The full download isn't available yet. Nothing was changed." (HTTP 503), and
- "Reset home" answers "Reset home isn't available yet. Nothing was changed."

Nothing else reads these functions.

## Where the code is

| What | Where |
|---|---|
| Who may reset | `packages/core/src/household/reset-policy.ts` |
| Reset (database part, then Storage) | `packages/core/src/household/reset-repository.ts` |
| Download | `packages/core/src/household/full-export.ts` and `zip.ts` |
| Table classification | `packages/core/src/household/reset-tables.json` |
| Owner-only grant | `adminGrant.householdOwner` in `packages/core/src/db/admin-context.ts` |
| Download route | `apps/web/app/api/v1/households/[householdId]/export/full/route.ts` |
| Reset screen and action | `apps/web/app/settings/reset-home/` |
| Danger zone | `apps/web/app/settings/page.tsx` |
| Words (8 languages) | `packages/core/src/i18n/messages/areas/reset/` |
| Help | the Privacy section (body 6) and the "download-delete" FAQ |
| Search | `danger-zone`, `full-download` and `reset-home` in the registry (audience `owner`) |

## Cleanup

The E2E runs created QA users (`reset-owner-…` and `reset-other-…@e2e.wonderhome-test.internal`) and "E2E Reset …" households on the live project. The spec's `afterAll` deleted them. A check with the service role afterwards found no user matching `reset-(owner|other)-…@e2e.wonderhome-test.internal` and no household named "E2E Reset …". No real household was reset; the reset never ran on the live project, because the migration is not there yet. The local test database is dropped by its test.
