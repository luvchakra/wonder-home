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
| 15 | P1 | 12-015 | Household chat with the thing itself attached | Done | The owner, 2026-10-21 ("add an internal chat feature for each member, including household … direct link or tasks can be mentioned in the chat so other member can look at them and take action … put chat icon [on each Family member row] … add members in incremental way"; and the Family members header had wrapped). Migration `20261021030000_household_chat.sql`: `chat_threads` (one household thread per household, direct threads keyed by the pair, groups), `chat_participants` and `chat_messages`, RLS by the set form `wh.my_chat_threads()`, written only through `chat_household_thread`, `chat_open_direct`, `chat_add_participants` (a direct chat that gains a third person becomes a group, history included), `chat_leave`, `chat_mark_read`; `chat_inbox` (security invoker) gives each chat its last message and unread count. A message is written only as yourself; only its writer changes or takes it back, and nobody deletes one; a link is a path on this site only (check constraint). `chat/links.ts` builds an attachment from a bill, meal, event, thing to buy or screen the writer can see, never from what the browser sends (tested). Screens: `/chat` (Everyone, the chats, Start a chat), `/chat/[threadId]` (messages, Attach sheet, change and take back, Add people one or several at a time, Leave a group with a question first), `/chat/with/[memberId]`; Chat under More (Family & People); a chat icon beside each other person on Family who signs in (`ExpandableRow` `trailing`). Family: Manage is an icon, and `SectionHeader` lets its action move under the title rather than break it. Words, nav and help (Chat) in all eight languages. Tests: links 4, RLS 8 (`test-chat-rls.mjs`). The owner ran the migration on the live project (2026-10-21, verified: three tables with RLS and five policies). Then the owner, 2026-10-21: "why is chat icon only available with only one family member … also a group chat for family should be available". The chat icon is on every other active member's row, signed in or not (the database never required an account; only the screen filtered), and so are Start a chat and Add people. A chat with anyone who has not signed in yet names them at its top and says messages wait for them. The household chat is now "Family chat", opened from an icon in the Family members header (`/chat/family`). Words and help (Chat) in all eight languages. Browser QA at 360px and 1280px: a chat icon on both other members, Family chat opens with the notice, a message to a member with no account was sent and shown. Then the owner, 2026-10-21: "for family chat, never include househelper". Migration `20261021050000_family_chat_without_helpers.sql` (applied live and verified): `wh.my_chat_threads()` leaves helpers out of the household thread, so no policy lets a helper read or write it, and `chat_household_thread` refuses a helper. A helper keeps direct and group chats. Screens: no Family chat icon for a helper, /chat does not open it for one, and its not-signed-in note never names a helper. RLS test 9/9 (a helper reads nothing in Family chat, cannot write there, still has a direct chat). Help (Chat) in all eight languages. Then the owner, 2026-10-21: "notification should be triggered for chat feature … / can list all module related tasks … @ can trigger name of all members … including pets and helpers, # … trending … listed in home page". `chat/composer.ts` (pure, 6 tests): `/` opens a picker of everything attachable (bills, meals, events, things to buy, now school work and home things too, plus screens), `@` lists every active member, helper and pet ("@" + the name they are called), `#` lists the tags already in use or makes a new one; a mention or tag in a message is shown highlighted. Trending at home on Home: the most-used tags of the last 7 days, counted only from messages the viewer can read (RLS), each opening the chat it was last used in. Migration `20261021060000_chat_notices.sql` (applied live and verified): `notifications.source_type` allows `chat_thread`. `chatNotices` (7 tests) is a notice like any other: one per reader per chat, never to the writer, never with the message text, a mention at high priority, resolved once they read it; the sweep runs after a send and after a chat is opened, and the delivery clock picks up households with new messages. Words, reminder catalog and help (Chat) in all eight languages. Browser QA at 360px: the /, @ (a member and a pet) and # pickers, a highlighted mention and tag, Trending at home on Home, and a mention notice reaching the other member and resolving once read.

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Family Time & Social Activities as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 12-E01 — Family Time & Shared Availability:** stories 12-001 through 12-003.
- **Epic 12-E04 — Family & Social Planning:** stories 12-004 through 12-007.
- **Epic 12-E08 — End-to-End Outings:** stories 12-008 through 12-008.
- The Family Calendar stories (12-009 to 12-014) moved to `backlogs/26-HomeEvents.md` on 2026-10-18.

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

### Stories 12-009 to 12-014 — moved to HomeEvents
The Family Calendar stories moved to `backlogs/26-HomeEvents.md` on 2026-10-18 as 26-001 to 26-006, with their old ids kept in its notes.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.