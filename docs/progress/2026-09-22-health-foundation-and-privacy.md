# Story 21-001: Health foundation & privacy

## What

Registered and built the first story of the new Health & Fitness domain
(module 21), approved by the Product Council decision
`50173d0a-WonderHome_Health_Fitness_Product_Council_Claude_Code_Requirements.md`.
This story lays the foundation every later health story builds on: schema,
per-person privacy, provenance, and a first real screen.

**Schema** (`supabase/migrations/20260922070000_health_foundation.sql`, applied
live):
- `health_profiles` — a member's own health-domain settings: `privacy_scope`
  (`private` / `selected_family` / `household_operational`, default
  `private`) and `ai_assistance_enabled`.
- `health_provenance` — source/confidence/confirmation for a health fact, the
  same shape `memories` already established, factored out so every later
  health entity (appointment, issue, checkup, record) can reference one row
  instead of repeating the columns.
- `health_consents` — the sharing ACL. A subject member explicitly grants
  another member `selected_family` visibility into their own data; nobody
  else can grant on their behalf except a guardian acting for their child.

**Privacy model**: `wh.may_see_health(household_id, subject_member_id,
privacy_scope)`. The product's own worked example ("Dad has a cardiology
appointment" is private to Dad; "Dad unavailable 5–6pm" is household-visible)
draws the line at household membership, not household administration — so
unlike every other precedent in this schema (`wh.may_see_child`,
`wh.may_see_finance`), there is **no household-admin bypass** for
`private`/`selected_family` data. Visibility is granted to: the subject
themselves; anyone, for `household_operational` scope; a guardian of the
subject, unconditionally; or an explicitly-consented viewer, for
`selected_family` scope.

**UI**: `/health` — Overview (Needs attention / Coming up / Monitoring /
Recent, all genuinely empty right now since appointments/issues/checkups are
later stories — no invented figures, no health score anywhere, per the
product's calm/non-clinical mandate) and Privacy (a plain-language scope
selector, a HomeBrain AI-assistance toggle, and grant/revoke controls for
sharing with named household members — an icon-button revoke per CLAUDE.md
rule 11, not a text button). Gated by a new `health.tracking` entitlement
(seeded on `pro`/`max`, matching `finance.bills`'s precedent of not being a
free-tier feature).

**API**: `GET/PATCH /households/{id}/health/profile`, `GET/POST
/households/{id}/health/privacy`, `DELETE
/households/{id}/health/privacy/{consentId}` — all through
`packages/core/src/health/repository.ts`, which uses only the household's own
RLS-scoped client (never the admin client) and translates RLS refusals into
household-facing messages. Three new audit events
(`health.profile_updated`/`health.consent_granted`/`health.consent_revoked`),
wired into `sensitive-actions.ts`.

## Why

The Product Council spec's core principle — "stay on top of health without
having to keep track of everything yourself" — explicitly forbids household
membership alone granting access to another adult's private health data.
Getting the privacy primitive right, with real database-level enforcement,
had to come before any health entity (appointments, issues, checkups) could
be built on top of it safely.

## Two real bugs found and fixed while building this

1. **Security**: the first draft of `health_profiles`' write policy was a
   single `for all` policy that included `wh.is_household_admin(...)` as an
   allowed actor — copying the nearest existing precedent in the schema
   without re-reading the spec's own privacy requirement. Because a `for
   all` policy's `USING` clause also gates `SELECT`, this silently let an
   admin read another adult's *private* health profile through a different
   policy than the dedicated (and correctly restrictive) SELECT policy —
   the same class of bug story 18-007 found in `household_webhooks`. Caught
   empirically against a scratch database (an admin could `select` a
   partner's private profile despite the SELECT policy's own
   `may_see_health` check refusing it) before it ever reached a migration
   file that shipped. Fixed by splitting into three admin-bypass-free
   `insert`/`update`/`delete` policies.
2. **Correctness**: `GET /households/{id}/health/privacy` validated its
   required `subjectMemberId` query parameter *before* calling
   `requireUser()`, so an anonymous caller with no `subjectMemberId` got a
   400 instead of a 401 — found by the e2e suite's blanket "every endpoint
   refuses an anonymous caller with 401" check. Every other route in this
   codebase authenticates first; reordered to match.

## What was verified

- `npm run verify` — typecheck, lint (incl. migration/embed/boundary/secret
  lints), tracker check, brand check, the P0 security suite, 1494 unit
  tests, 321 database/RLS tests (11 new, in `scripts/test-health-rls.mjs`),
  production build, 296 e2e tests. All green.
- `scripts/test-health-rls.mjs` — 11 tests against real Postgres: a member
  can create/read their own private profile; the household admin cannot
  read, update, or delete another adult's private profile (not even via a
  WHERE-conditioned write); `household_operational` scope is visible
  household-wide but not cross-household; a guardian can see/manage their
  child's profile regardless of scope, a non-guardian adult cannot;
  `selected_family` visibility requires an explicit consent grant, not just
  membership, and doesn't leak cross-household; only the subject (or a
  guardian, for a child) can grant a consent — never the admin on another
  adult's behalf; revoking a consent removes the visibility it granted; a
  subject cannot grant themselves consent to their own data;
  `wh.may_see_health` is genuinely wired into RLS, not merely correct in
  isolation.
- Migration applied to the live Supabase project (`kqxndableyysxqhxiorz`) via
  the Supabase MCP; `npm run verify:live` — 93/93 checks, including two new
  ones (anonymous cannot read a household's health profiles; anonymous
  cannot create one). `get_advisors` showed no new security findings.
- Live browser verification (360px and desktop) against a real QA household
  temporarily granted a `pro`-plan subscription row: the entitlement gate
  correctly refuses a free-plan household; the Overview screen renders all
  four sections' empty states correctly with no clipping under the fixed tab
  bar; the Privacy screen's scope change, AI-assistance toggle, consent
  grant, and consent revoke were each confirmed to persist across a full
  page reload (not just optimistic client state). QA household, its extra
  member, its subscription override, and the QA auth user were all removed
  afterward.

## What's still open

- Stories 21-002 through 21-008 (appointments, health issues, checkups,
  records/HomeSend intake, HomeBrain/HomeTalk context, vitals, and
  connected-health scaffolding) are `Not Started` — this story only lays
  the foundation they build on.
- The Overview screen's four sections are honestly empty because no health
  entity yet exists to populate them; they're structured so 21-002/21-003
  can start filling them in without a redesign.
- No UI yet lets a household *change* its own plan to `pro`/`max` from
  inside this story's testing — that's the existing 20-004 upgrade flow,
  reused as-is.

## Where the code lives

- Migration: `supabase/migrations/20260922070000_health_foundation.sql`
- Domain repository + tests: `packages/core/src/health/`
- API routes: `apps/web/app/api/v1/households/[householdId]/health/`
- UI: `apps/web/app/health/page.tsx`,
  `apps/web/app/_components/health-forms.tsx`,
  `apps/web/app/(auth)/health-actions.ts`
- RLS tests: `scripts/test-health-rls.mjs`
- Backlog: `backlogs/21-Health-and-Fitness.md`
