# WonderHome — Health and Fitness

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 21-001 | Health foundation & privacy | Done | Schema (`health_profiles`/`health_provenance`/`health_consents`), `wh.may_see_health` (no admin bypass), Overview + Privacy screens at `/health`, live-verified 2026-09-22 |
| 2 | P0 | 21-002 | Appointments | Done | Progressive booking wizard, confirm/complete/cancel, reschedule (new row + old marked rescheduled), deterministic conflict/duplicate detection, day-granularity reminder sweep folded into `/platform/retention`, live-verified 2026-09-22 |
| 3 | P0 | 21-003 | Health issues | Done | `health_issues` (status `mentioned→active→monitoring→resolved→closed`, `resolved_at` DB-enforced), deterministic `assessForMedicalAttention` (never a diagnosis), provenance row carries no health content, Overview groups active/mentioned into Needs attention, monitoring into its own section, resolved/closed into Recent, record/edit/status-change UI, live-verified 2026-09-22 |
| 4 | P0 | 21-004 | Checkups & preventive care | Done | `health_checkups` (source enum, `cadence_days`, `next_due_on`/`last_completed_on`), linked bidirectionally to `health_appointments.checkup_id`; completing/cancelling the linked appointment syncs the checkup automatically; overdue → Needs attention, due soon → Coming up, silent otherwise; add/edit(+reschedule)/complete/remove/bring-back UI, live-verified 2026-09-22 |
| 5 | P0 | 21-005 | Health records & HomeSend intake | Done | `health_records` (member, `record_type`, `document_date`, `file_path`, `status` active/archived), own privacy-scoped `health-records` storage bucket (object read requires `wh.may_see_health`, not just membership); HomeSend gains a `health_document` intake kind with its own extraction fields (`healthRecordType`/`documentDate`/`subjectMemberName` — a name hint only, never trusted to pick an identity) and its own confirm-form section; `home_send_items` narrowed to sender-only visibility for `health_document` items until routed (every other kind stays shared-inbox); routing copies the file from HomeSend's bucket into the privacy-scoped one; Overview's Recent shows both active and archived records so "bring back" stays reachable, live-verified 2026-09-22 |
| 6 | P0 | 21-006 | HomeBrain & HomeTalk health context | Done | New `health.manage` permission (head/administrator/adult only); 5 new HomeTalk rules recognizing the spec's own example utterances (record an appointment, log/resolve an issue for real; log a vital / set a fitness goal honestly "prepared, not done" — no backing write exists) plus a health-scoped `ask_status` rule ("what health appointments do I have this month?"); `health/domain-agenda.ts`'s `healthAgenda()` joins `gather-assessments.ts`'s fan-out exactly like every other domain; a new `healthSpecialist` proposes `health.notify_overdue` for an overdue checkup only, executed via `ai/executors.ts`'s `notifyOverdueHealth` (needs `run.ts`'s admin client, now passed through `runExecutor`'s new optional 4th param) using the existing `notifications` pipeline; `conversation/brain.ts`'s HomeBrain reads open appointments/issues/due-or-overdue checkups only for a viewer holding `health.manage`, tagged `contentClass: "health"` so an unrelated question never surfaces them and the household's own consent policy (default: none) decides whether a model ever sees them; live-verified 2026-09-22 |
| 7 | P1 | 21-007 | Vitals & measurement routines | Done | `health_measurement_routines` (created first, `cadence_days`/`preferred_time`/`reminder_enabled`/`next_due_on`/`last_completed_on`) and `health_vitals` (`value`/`secondary_value` for a paired reading like blood pressure, free-text `unit`, `status` active/archived, `routine_id` traces a reading back to the routine that produced it), same self-or-guardian RLS shape as every other health entity; `completeRoutine` records the real reading and advances `next_due_on` by the routine's own cadence in one step; `summarizeVitalTrend`/`describeVitalTrend` are pure verifiable arithmetic ("your last N readings were recorded over the past M weeks"), never a stated conclusion; HomeTalk's `log_vital` now actually executes via `createVital` — blood pressure/pulse/steps resolve without an explicit unit (their one conventional unit), every other type requires one or is honestly declined; day-scale reminder sweep (`routine-reminders.ts`) folded into `/platform/retention` alongside appointment/checkup reminders; add/edit/archive/reactivate UI for vitals, add/edit/complete/dismiss/reactivate UI for routines; live QA surfaced and fixed two real gaps — a dismissed routine with no completion history had no path back to "Bring back" (now included in Recent), and HomeTalk only recognized "My X was Y" phrasing (added "Log/Record my X as Y"); live-verified 2026-09-22 |
| 8 | P1 | 21-008 | Fitness & connected-health scaffolding | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose

Implement Health & Fitness as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

It is not a diagnostic system, treatment system, electronic medical-record replacement, or fitness-surveillance product. It manages appointments, health-related commitments, everyday health observations, preventive checkups, measurements, fitness routines and health records — captured once, remembered, connected to household context, surfaced only when useful, and kept under each individual's own privacy control.

Approved by Product Council decision `50173d0a-WonderHome_Health_Fitness_Product_Council_Claude_Code_Requirements.md`, 21 Sep 2026.

## Epic Map

- **Epic 21-E01 — Health Foundation & Privacy:** story 21-001.
- **Epic 21-E02 — Appointments & Preventive Care:** stories 21-002, 21-004.
- **Epic 21-E03 — Health Observations & Records:** stories 21-003, 21-005.
- **Epic 21-E04 — HomeBrain & HomeTalk Integration:** story 21-006.
- **Epic 21-E05 — Vitals & Fitness:** stories 21-007, 21-008.

## Dependencies

- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md`

## Stories

### Story 21-001 — Health foundation & privacy
**Epic:** Health Foundation & Privacy
**Priority:** P0
**Goal:** Establish the health domain's schema, per-person privacy scope, provenance and audit foundation that every later story builds on.

**Acceptance criteria**
- Given the household state described by the story, establish the health domain's schema, per-person privacy scope, provenance and audit foundation that every later story builds on .
- `health_profiles`, `health_provenance` and `health_consents` (the sharing ACL) exist with RLS enabled and a household-scoped index.
- Every health entity carries a `privacy_scope` of `private`, `selected_family` or `household_operational`; a new `wh.may_see_health(household_id, subject_member_id)` helper enforces it the same way `wh.may_see_child`/`wh.may_see_finance` already do, and household membership alone never grants access to another adult's private health data.
- A subject member can grant and revoke another member `selected_family` visibility into their own health data via `health_consents`; nobody else can grant it on their behalf except a household administrator acting for a child within configured guardian boundaries.
- Health Settings' Privacy screen lets a member see and change who can see their health data, in plain language, with no jargon.
- A Health & Fitness entry appears in secondary navigation, gated by a new `health.tracking` entitlement, with an Overview screen showing Needs Attention / Coming Up / Monitoring / Recent sections (empty states included) and no generic health score.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 21-002 — Appointments
**Epic:** Appointments & Preventive Care
**Priority:** P0
**Goal:** Let any authorized member create, track and complete a health appointment for themselves or another person where permitted, with useful reminders and calendar coordination.

**Acceptance criteria**
- Given the household state described by the story, let any authorized member create, track and complete a health appointment for themselves or another person where permitted, with useful reminders and calendar coordination .
- An appointment carries person, type (doctor/dentist/eye care/physiotherapy/dermatology/specialist/diagnostic/vaccination/mental wellness/other), date/time, and the optional fields the spec lists (provider, facility, location, end time, preparation notes, notes, reminder preferences, attachments, calendar sync); progressive entry (who → what → when → where → notes → reminder → save), never a giant form.
- Status moves through `proposed | confirmed | completed | cancelled | rescheduled`; completing or cancelling an appointment automatically suppresses its remaining reminders.
- Default reminders are useful, not noisy (an advance reminder, a preparation reminder where relevant, a day-of reminder where useful), with quiet hours and channel configurable per household member.
- HomeBrain may detect a calendar conflict, consider travel time, flag household coordination implications, and detect a likely duplicate appointment — always surfaced as a proposal a person confirms, never an unattended calendar mutation.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 21-003 — Health issues
**Epic:** Health Observations & Records
**Priority:** P0
**Goal:** Support everyday health observations through their own lifecycle without ever presenting a diagnosis.

**Acceptance criteria**
- Given the household state described by the story, support everyday health observations through their own lifecycle without ever presenting a diagnosis .
- An issue carries person, label, description, `started_at`, status, notes, privacy scope, source, provenance and `resolved_at`; status moves through `mentioned → active → monitoring → resolved → closed`.
- WonderHome never converts an observation into a diagnosis; a description suggesting a potentially serious situation may prompt a recommendation to seek appropriate medical attention, and nothing stronger.
- The Health Issues screen groups by status the way the reader actually thinks about it (active first), never a flat list, and every issue can be added, updated and resolved — never a create-only screen.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 21-004 — Checkups & preventive care
**Epic:** Appointments & Preventive Care
**Priority:** P0
**Goal:** Support user-defined recurring preventive-care commitments without silently prescribing a medical schedule.

**Acceptance criteria**
- Given the household state described by the story, support user-defined recurring preventive-care commitments without silently prescribing a medical schedule .
- A checkup carries a source of `user_defined | doctor_recommended | imported_appointment | configured_plan | informational_template`, and WonderHome never invents a schedule the household did not configure or import.
- A checkup due soon or overdue is what the Overview's Needs Attention/Monitoring sections actually surface; a checkup that is neither due nor overdue is silent.
- A checkup can be added, rescheduled and removed, and completing the linked appointment (story 21-002) marks it done and computes its next occurrence where a cadence is configured.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 21-005 — Health records & HomeSend intake
**Epic:** Health Observations & Records
**Priority:** P0
**Goal:** Store health documents against the right person, and let HomeSend classify and route a health document with the same confirm-before-write discipline every other HomeSend kind already has.

**Acceptance criteria**
- Given the household state described by the story, store health documents against the right person, and let HomeSend classify and route a health document with the same confirm-before-write discipline every other HomeSend kind already has .
- Every `health_records` row belongs to exactly one household member; if HomeSend's extraction cannot confidently determine whose record it is, WonderHome asks ("I found health information in this document. Whose record should I attach it to?") rather than guessing.
- HomeSend's classifier gains a `health_document` intake kind alongside `bill`/`school_item`/`grocery_item`, with its own field group in the extraction schema and the deterministic backstop (`sanitizeIntakeExtraction`) nulling any field outside that kind's own claimed shape.
- Extracted content from a document is treated as untrusted data end to end — it is never allowed to authorize a privileged action on its own, and a person's confirmation is what actually writes the record.
- Every record shows its provenance in plain language ("Added from the appointment confirmation you sent on 21 Sep") and a processing failure preserves the original upload, explains what happened, and offers manual entry rather than silently losing the document.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 21-006 — HomeBrain & HomeTalk health context
**Epic:** HomeBrain & HomeTalk Integration
**Priority:** P0
**Goal:** Make health a protected context inside the existing HomeBrain — never a separate health brain — reachable through HomeTalk's natural-language commands and governed AI tools, with context minimization and explainability intact.

**Acceptance criteria**
- Given the household state described by the story, make health a protected context inside the existing HomeBrain, reachable through HomeTalk's natural-language commands and governed AI tools, with context minimization and explainability intact .
- HomeTalk understands the spec's example utterances ("I have a dentist appointment next Tuesday at 4," "My BP was 128 over 82 this morning," "I've had a headache since yesterday," "My headache is gone," "I want to walk three times a week," "What health appointments do I have this month?") and routes each through the governed Health domain services — never a direct database write from the AI layer.
- A household's `healthAgenda()` joins `gather-assessments.ts`'s existing fan-out exactly like every other domain, so a notable health item can be planned and, where explicitly authorized, executed through the existing specialist/tool/orchestrator pipeline — no separate AI orchestration path is created for health.
- Private health information is never pulled into an unrelated AI context (asking about groceries never surfaces a private health fact); a request that is actually about health context may use it according to the asking member's own authorization.
- AI may interpret, identify likely health entities, propose actions, prepare reminders and summarize authorized information; it may not grant itself access, change a privacy scope, reach another member's private data, diagnose, prescribe, or write directly to Supabase.
- The existing "Why didn't WonderHome do this?" explainability pattern covers a health decision (an ambiguous person, a private appointment withheld from someone who asked) without ever exposing raw chain-of-thought, and the trust ladder's autonomous-disclosure level is never used for sensitive health information.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 21-007 — Vitals & measurement routines
**Epic:** Vitals & Fitness
**Priority:** P1
**Goal:** Record structured vitals, show trends rather than judgments, and let a household configure a recurring measurement routine.

**Acceptance criteria**
- Given the household state described by the story, record structured vitals, show trends rather than judgments, and let a household configure a recurring measurement routine .
- Every listed measurement type (weight, height, temperature, blood pressure, pulse, steps, distance, exercise duration, resting heart rate, custom) can be recorded manually or via HomeTalk, with value/unit/secondary value where relevant, `measured_at` and source.
- Trends are shown as arithmetic a person can verify ("your last five readings were recorded over the past three weeks") and WonderHome never states an unsupported conclusion like "your health is good."
- A measurement routine ("measure blood pressure every Sunday morning") carries measurement, person, cadence, preferred time, reminder policy and privacy scope; HomeBrain manages the routine's reminders, which stay sparse and configurable.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 21-008 — Fitness & connected-health scaffolding
**Epic:** Vitals & Fitness
**Priority:** P1
**Goal:** Offer lightweight, consistency-oriented fitness goals and sessions, and stand up the provider-neutral `HealthProvider` abstraction that a real Apple HealthKit/Android Health Connect/wearable integration will later plug into — with no fake live connection claimed before one exists.

**Acceptance criteria**
- Given the household state described by the story, offer lightweight, consistency-oriented fitness goals and sessions, and stand up the provider-neutral integration abstraction future connected-health providers will plug into .
- A fitness goal carries person, activity, target, frequency, preferred time, privacy scope and status; a session carries activity, duration, distance, `started_at`, source and notes. No family leaderboard, guilt messaging or child fitness surveillance exists anywhere in the module.
- `HealthProvider` is a real TypeScript interface with `Manual`/`HomeTalk`/`HomeSend`/`Calendar` as its genuinely live adapters and `Apple HealthKit`/`Android Health Connect`/`Wearables` declared but explicitly inert — no code path claims a live connection to any of the three until credentials, consent UI, disconnect/revoke, fixtures and integration tests exist for that specific provider.
- Core domain services depend only on the `HealthProvider` abstraction, never directly on a provider SDK.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule

Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.
