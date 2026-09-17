# WonderHome — Family Time & Social Activities

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 12-001 | Family events | Not Started | |
| 2 | P0 | 12-002 | Protected family time | Not Started | |
| 3 | P0 | 12-003 | Common availability | Not Started | |
| 4 | P1 | 12-004 | Family activity planning | Not Started | |
| 5 | P1 | 12-005 | Social events | Not Started | |
| 6 | P1 | 12-006 | Gift planning | Not Started | |
| 7 | P1 | 12-007 | Conflict detection | Not Started | |
| 8 | P2 | 12-008 | End-to-end outing | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Family Time & Social Activities as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 12-E01 — Family Time & Shared Availability:** stories 12-001 through 12-003.
- **Epic 12-E04 — Family & Social Planning:** stories 12-004 through 12-007.
- **Epic 12-E08 — End-to-End Outings:** stories 12-008 through 12-008.

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

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.