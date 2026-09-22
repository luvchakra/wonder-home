# Story 21-005: health records & HomeSend intake

Health & Fitness's fifth story: a household document filed against exactly
one member, and HomeSend's fourth intake kind — `health_document` — reaching
the same confirm-before-write discipline every other HomeSend kind already
has.

## What was built

- **`supabase/migrations/20260922150000_health_records.sql`** —
  `health_records`: member, `label`, `record_type` (`lab_result |
  prescription | imaging_report | vaccination_certificate |
  discharge_summary | referral | insurance_document | visit_summary |
  other`), `document_date` (never invented — null when the source doesn't
  show one), `file_path`, `privacy_scope`, `status` (`active | archived`),
  `source_type` (`manual_entry | home_send_document`), `provenance_id`. Same
  self-or-guardian-only RLS shape 21-001 through 21-004 all use.
- **A dedicated, privacy-scoped `health-records` storage bucket** — unlike
  `avatars`/`home-send` (household-membership-gated), reading an object here
  also requires `wh.may_see_health()` against the `health_records` row it
  belongs to, via a join in the storage SELECT policy. A household document
  can carry another adult's private health content, and HomeSend's own
  `home-send` bucket is deliberately not privacy-aware, so a record's file
  is copied into this bucket once a person confirms it, at a fresh path —
  never left pointing at the original HomeSend upload.
- **HomeSend gains `health_document`** as a fourth `classify-intake.ts`
  kind, with its own extraction fields — `healthRecordType`, `documentDate`,
  and `subjectMemberName` (a name exactly as printed/written on the
  document, never a member id — WonderHome never trusts extracted text to
  select an identity). The confirm form's "Whose record is this?" picker
  defaults to "Me" and lists the household's children; the extracted name is
  shown only as a hint beside it. Routing a `health_document` resolves the
  actual subject server-side (the picker's choice, or the confirming
  member if left on "Me") and writes through the same `createRecord()` a
  manual add uses — so a household member can only ever file a record for
  themselves, or a child they guard, exactly matching every other health
  entity's write policy; picking someone else is a clean, expected refusal,
  not a bug.
- **One privacy gap closed at the source**: `home_send_items`'s shared-inbox
  SELECT policy (any household member, matching every other kind) would
  otherwise make a health document readable by the whole household for as
  long as it sits unclassified/unconfirmed — precisely the
  membership-alone access the health module's own foundation (21-001)
  refuses everywhere else. `classified_kind = 'health_document'` is now the
  one HomeSend kind narrowed to its own sender until it is routed (becoming
  a properly privacy-scoped `health_records` row) or dismissed; every other
  kind's visibility is unchanged.
- **UI**: `apps/web/app/_components/health-record-forms.tsx` —
  `AddRecordButton` (manual entry: who/what/kind/document date/notes/
  privacy), `EditRecordButton`, `RecordActions` (edit, remove/bring-back —
  never the file itself). `/health`'s Overview gained an "Add a record"
  entry point and a "Recent" row for each record — records have no due date
  to be overdue against, so Recent is their only home in this Overview,
  which is also why an archived record has to stay visible there too (see
  the bug below).
- Audit events (`health.record_created`, `_updated`, `_archived`,
  `_reactivated`) and their `sensitive-actions.ts` descriptions; new
  `/health/records(/:id)` OpenAPI paths.

## Two bugs caught during live verification, not left for a household to find

1. **Archived records were unreachable.** `listRecords()` defaults to
   `status = 'active'` (a sensible default for most callers), and the
   Overview's fetch used that default — so archiving a record made it
   vanish from the only screen that could ever show a "bring back" button,
   silently breaking CLAUDE.md rule 12 for this one entity. Records have no
   other section to live in the way an overdue checkup or a monitored issue
   does, so unlike those entities, the Overview now explicitly fetches both
   statuses and `healthRecordsAgenda()` no longer filters archived ones out
   — the row still renders, with a "removed" note and the reactivate pill.
2. **The HomeSend "Recently handled" row picked the wrong icon.** Its
   `presentationFor(item.classifiedKind)` call used the AI's *original*
   classification — but a household can override that in the confirm
   form's "This is" dropdown, and with no AI provider configured for a
   household `classified_kind` is never even set to `"unknown"` (the
   no-key branch returns before the row is written), so a routed
   `health_document` showed a generic "Not sure yet" icon in its own
   history. Fixed by reading the actual routed domain off the
   `homesend_changes` row instead — what was actually written is always
   more trustworthy than what a model (or nothing) guessed first, and this
   fix helps every HomeSend kind's history, not just health.

## Verified

- `npx vitest run src/health src/ai/classify-intake` — 8 files, 64 tests,
  all passed (new: `records.test.ts`'s create/update/archive/reactivate via
  a hand-rolled fake Supabase client, 3 new `classify-intake-evaluations.ts`
  golden scenarios for `health_document` — a clean pass-through, hallucinated
  bill/grocery fields stripped, a hallucinated `secondary` dropped).
- `node --test scripts/test-health-records-rls.mjs` — 10/10: self access,
  admin cannot read or write another adult's private record,
  `household_operational` visible to any member, guardian can manage a
  child's record, a non-guardian cannot, `selected_family` requires
  consent, the `record_type` CHECK constraint rejects an unknown value, a
  `home_send_items` row classified `health_document` is visible only to its
  own sender (new), and every other HomeSend kind stays household-wide
  visible as before (regression guard for the same policy change).
- Full `npm run verify` — typecheck, lint, unit, 10 database/RLS suites,
  build, 328 e2e — all green, twice (before and after the two live-found
  fixes above).
- Migration applied to the live Supabase project (`kqxndableyysxqhxiorz`)
  via `apply_migration`; `npm run verify:live` — 105/105 checks, including
  two new ones (anonymous cannot read or create a `health_records` row).
- Live browser verification with a real QA household (granted `pro` via
  direct SQL for `health.tracking`, plus a guarded child member): filed a
  record by hand, edited it, archived it (confirmed it stayed visible with
  a "removed" note and a working "bring back"), reactivated it; separately,
  pasted a discharge-summary-shaped forward into HomeSend, manually picked
  "A health document" (no AI provider configured for this QA household, so
  classification itself couldn't be exercised end-to-end — the deterministic
  confirm-and-route path was verified instead), left "Whose record is
  this?" on the default "Me", and confirmed the real `health_records` row
  landed with `source_type = 'home_send_document'`, the right subject, and
  a correct `homesend_changes` row — at 390px and 1280px desktop. QA
  household, its members and auth user removed afterward; dev server
  stopped.

## What's still open

HomeBrain/HomeTalk health context (21-006), vitals (21-007) and fitness
scaffolding (21-008) remain, per `backlogs/21-Health-and-Fitness.md`. The
HomeSend `health_document` path was verified end to end except the live AI
classification step itself (no provider key was configured for the QA
household used here) — the extraction schema and its deterministic
sanitizer are covered separately by the `classify-intake-evaluations.ts`
golden scenarios.
