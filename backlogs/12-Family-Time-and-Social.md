# WonderHome — Family Time & Social Activities

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 12-001 | Family events | Done | events keep their participants, so a commitment constrains the right people |
| 2 | P0 | 12-002 | Protected family time | Done | protected is a column; automation can ask about it and cannot spend it |
| 3 | P0 | 12-003 | Common availability | Done | free/busy only — wh.busy_windows returns times, never what anybody is doing |
| 4 | P1 | 12-004 | Family activity planning | Done | at most three options, filtered by free time, budget, travel and age |
| 5 | P1 | 12-005 | Social events | Done | every social event has an owner and an explicit action state |
| 6 | P1 | 12-006 | Gift planning | Done | gifts planned against an explicit occasion, never guessed from a date |
| 7 | P1 | 12-007 | Conflict detection | Done | both sides named and a proposal made; never a silent move |
| 8 | P2 | 12-008 | End-to-end outing | Done | outing planning composes availability, conflicts and gifts already built |
| 9 | P0 | 12-009 | Family Calendar foundation | In Progress | C1 (design/FAMILY-CALENDAR-PHASE0.md, D1–D7 approved 2026-10-18) built: migration `20261018120000` (visibility, all-day, repeat rules, exceptions, DoP&T holidays, preferences, family events on every plan), `packages/core/src/calendar/`, `/calendar` Month/Week/Day/Year, the Today tab is Calendar. Waiting on: the migration applied to the live project (session writes time out) and signed-in browser QA |
| 10 | P0 | 12-010 | Calendar module adapters | Not Started | C2: school, meals, bills, health, helpers, upkeep, outcomes and orders on the calendar, each through its own visibility rules; "Busy" for health; dedupe by source |
| 11 | P1 | 12-011 | HomeTalk plans with the calendar | Not Started | C3: plan_event with participants and conflicts, find_free_time, moving and cancelling events, answers read from the projection |
| 12 | P1 | 12-012 | Calendar reminders and holiday region | Not Started | C4: reminders to every participant, a daily digest option, holiday region in Settings → Language & Region |
| 13 | P2 | 12-013 | Calendar notices over WhatsApp | Not Started | C5: only if wanted; the official template, shared with Groceries' Send to Cook |
| 14 | P2 | 12-014 | Google and Outlook calendars | Not Started | C6: only after a separate approval |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Family Time & Social Activities as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 12-E01 — Family Time & Shared Availability:** stories 12-001 through 12-003.
- **Epic 12-E04 — Family & Social Planning:** stories 12-004 through 12-007.
- **Epic 12-E08 — End-to-End Outings:** stories 12-008 through 12-008.
- **Epic 12-E09 — Family Calendar:** stories 12-009 through 12-014 (design `design/FAMILY-CALENDAR-PHASE0.md`).

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 12-001 — Family events
**Epic:** Family Time & Shared Availability
**Priority:** P0
**Goal:** Create shared events and participants.

**Acceptance criteria**
- Given the household state described by the story, create shared events and participants .
- The event remains linked to participants and affected household schedule constraints.
- Confirmed family-time windows are first-class scheduling constraints and routine automation must not consume them silently.
- Common availability calculations expose only the minimum free/busy information needed for planning, not private calendar details.
- Family/social suggestions use explicit preferences, age, budget and travel constraints and remain a small actionable set.
- Social events have an owner and explicit action state for RSVP, preparation or gifting so they do not become passive calendar data.
- Conflicts are resolved through proposed alternatives and never by silently deleting or moving a confirmed family commitment.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 12-002 — Protected family time
**Epic:** Family Time & Shared Availability
**Priority:** P0
**Goal:** Prevent routine optimization from consuming protected time.

**Acceptance criteria**
- Given the household state described by the story, prevent routine optimization from consuming protected time .
- The event remains linked to participants and affected household schedule constraints.
- Confirmed family-time windows are first-class scheduling constraints and routine automation must not consume them silently.
- Common availability calculations expose only the minimum free/busy information needed for planning, not private calendar details.
- Family/social suggestions use explicit preferences, age, budget and travel constraints and remain a small actionable set.
- Social events have an owner and explicit action state for RSVP, preparation or gifting so they do not become passive calendar data.
- Conflicts are resolved through proposed alternatives and never by silently deleting or moving a confirmed family commitment.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 12-003 — Common availability
**Epic:** Family Time & Shared Availability
**Priority:** P0
**Goal:** Find shared free windows.

**Acceptance criteria**
- Given the household state described by the story, find shared free windows .
- Availability supports recurring windows plus date-specific exceptions and is queryable by the planner.
- Confirmed family-time windows are first-class scheduling constraints and routine automation must not consume them silently.
- Common availability calculations expose only the minimum free/busy information needed for planning, not private calendar details.
- Family/social suggestions use explicit preferences, age, budget and travel constraints and remain a small actionable set.
- Social events have an owner and explicit action state for RSVP, preparation or gifting so they do not become passive calendar data.
- Conflicts are resolved through proposed alternatives and never by silently deleting or moving a confirmed family commitment.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 12-004 — Family activity planning
**Epic:** Family & Social Planning
**Priority:** P1
**Goal:** Suggest a small number of relevant options.

**Acceptance criteria**
- Given the household state described by the story, suggest a small number of relevant options .
- The event remains linked to participants and affected household schedule constraints.
- Confirmed family-time windows are first-class scheduling constraints and routine automation must not consume them silently.
- Common availability calculations expose only the minimum free/busy information needed for planning, not private calendar details.
- Family/social suggestions use explicit preferences, age, budget and travel constraints and remain a small actionable set.
- Social events have an owner and explicit action state for RSVP, preparation or gifting so they do not become passive calendar data.
- Conflicts are resolved through proposed alternatives and never by silently deleting or moving a confirmed family commitment.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 12-005 — Social events
**Epic:** Family & Social Planning
**Priority:** P1
**Goal:** Track birthdays, gatherings, RSVPs and preparation.

**Acceptance criteria**
- Given the household state described by the story, track birthdays, gatherings, RSVPs and preparation .
- The event remains linked to participants and affected household schedule constraints.
- Confirmed family-time windows are first-class scheduling constraints and routine automation must not consume them silently.
- Common availability calculations expose only the minimum free/busy information needed for planning, not private calendar details.
- Family/social suggestions use explicit preferences, age, budget and travel constraints and remain a small actionable set.
- Social events have an owner and explicit action state for RSVP, preparation or gifting so they do not become passive calendar data.
- Conflicts are resolved through proposed alternatives and never by silently deleting or moving a confirmed family commitment.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 12-006 — Gift planning
**Epic:** Family & Social Planning
**Priority:** P1
**Goal:** Plan gifts for explicit events.

**Acceptance criteria**
- Given the household state described by the story, plan gifts for explicit events .
- The event remains linked to participants and affected household schedule constraints.
- Confirmed family-time windows are first-class scheduling constraints and routine automation must not consume them silently.
- Common availability calculations expose only the minimum free/busy information needed for planning, not private calendar details.
- Family/social suggestions use explicit preferences, age, budget and travel constraints and remain a small actionable set.
- Social events have an owner and explicit action state for RSVP, preparation or gifting so they do not become passive calendar data.
- Conflicts are resolved through proposed alternatives and never by silently deleting or moving a confirmed family commitment.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 12-007 — Conflict detection
**Epic:** Family & Social Planning
**Priority:** P1
**Goal:** Detect social/school/home conflicts.

**Acceptance criteria**
- Given the household state described by the story, detect social/school/home conflicts .
- Conflicts identify the two or more records/rules in conflict and provide a direct resolution action.
- Confirmed family-time windows are first-class scheduling constraints and routine automation must not consume them silently.
- Common availability calculations expose only the minimum free/busy information needed for planning, not private calendar details.
- Family/social suggestions use explicit preferences, age, budget and travel constraints and remain a small actionable set.
- Social events have an owner and explicit action state for RSVP, preparation or gifting so they do not become passive calendar data.
- Conflicts are resolved through proposed alternatives and never by silently deleting or moving a confirmed family commitment.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 12-008 — End-to-end outing
**Epic:** End-to-End Outings
**Priority:** P2
**Goal:** Coordinate activity, travel and preparation.

**Acceptance criteria**
- Given the household state described by the story, coordinate activity, travel and preparation .
- Confirmed family-time windows are first-class scheduling constraints and routine automation must not consume them silently.
- Common availability calculations expose only the minimum free/busy information needed for planning, not private calendar details.
- Family/social suggestions use explicit preferences, age, budget and travel constraints and remain a small actionable set.
- Social events have an owner and explicit action state for RSVP, preparation or gifting so they do not become passive calendar data.
- Conflicts are resolved through proposed alternatives and never by silently deleting or moving a confirmed family commitment.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 12-009 — Family Calendar foundation
**Epic:** Family Calendar
**Priority:** P0
**Goal:** One calendar the whole household reads, built as a projection of the records that already exist: family events (with visibility, all-day, recurrence and single-occurrence exceptions), birthdays and occasions on the household's own clock, and curated public holidays, in Month (default), Week, Day and Year views with the day's agenda, filters, an add/edit sheet that checks conflicts, and pinch zoom. The Today tab becomes Calendar (D1).

### Story 12-010 — Calendar module adapters
**Epic:** Family Calendar
**Priority:** P0
**Goal:** School, meals, bills, health, helpers, upkeep, outcomes and orders appear on the calendar through their own readers and visibility rules, each opening its own screen; someone else's health appointment is hidden or "Busy" (D4).

### Story 12-011 — HomeTalk plans with the calendar
**Epic:** Family Calendar
**Priority:** P1
**Goal:** HomeTalk puts events on the calendar with participants and conflicts, finds free time, moves and cancels events through approval, and answers "what do we have next week?" from the same projection.

### Story 12-012 — Calendar reminders and holiday region
**Epic:** Family Calendar
**Priority:** P1
**Goal:** Event reminders reach every participant, not only the owner; an optional daily digest; the holiday region is chosen in Settings → Language & Region.

### Story 12-013 — Calendar notices over WhatsApp
**Epic:** Family Calendar
**Priority:** P2
**Goal:** Only if wanted: event notices to a consenting helper or member through the official WhatsApp template.

### Story 12-014 — Google and Outlook calendars
**Epic:** Family Calendar
**Priority:** P2
**Goal:** Two-way sync with Google and Outlook calendars, only after a separate approval.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.