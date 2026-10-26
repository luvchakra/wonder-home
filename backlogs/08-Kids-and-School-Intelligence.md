# WonderHome — Kids & School Intelligence

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 08-001 | Child responsibility | Done | age-appropriate effort, sitting length and a child's own view |
| 2 | P0 | 08-002 | School connector | Done | school connector on the shared contract; broken never looks like empty |
| 3 | P0 | 08-003 | Assignment ingestion | Done | canonical items keyed by provider identity; a portal cannot mark work done |
| 4 | P0 | 08-004 | Study planning | Done | work split into sittings that fit the time; what will not fit is reported |
| 5 | P0 | 08-005 | Deadline risk | Done | risk is time against remaining effort, not the calendar |
| 6 | P1 | 08-006 | Document workspace | Done | documents by reference, guardian-gated in the API and in RLS |
| 7 | P1 | 08-007 | School summaries | Done | only messages that ask something surface; a newsletter is filed |
| 8 | P2 | 08-008 | Deep portal automation | Done | adapter seam and scopes in place; no portal is live (CLAUDE.md) |
| 9 | P2 | 08-009 | Add a child from a school notice | Done | Found in the test-spec live run (23 Sep 2026): a household with no child on record cannot confirm a school notice — offer to add the child inline. Done: the resolver names an untitled unknown child (`unknown`), never assumes the household's only child; the review offers "Add <name> as a child" to Admins (guardian = the Admin, as on Family) and confirms the notice for them in the same step; golden case HS-15 |
| 10 | P0 | 08-010 | Each child's school details: class, class teacher, subject teachers | Done | The owner, 2026-10-18 (PR #234). Each child has a card on Kids & School: the school (Google Maps, 24-010) with its class and section and its start and end times, which are the same record the child's details in Family edit (`setSchoolHours`); the class teacher and each subject teacher (subject picked from a list with its own add, rule 20), each changed or removed with icons (`school_teachers`, migration `20261018260000`, run by the owner 2026-10-18; verify:live 287/287). Child, guardians and Admins read; guardians and Admins write (`wh.may_change_child`), `scripts/test-child-activities-rls.mjs` 7/7. Browser-checked at 360px and 1280px on the live project |
| 11 | P0 | 08-011 | Activities and classes outside school, folded | Done | PR #234. Folded rows (`ExpandableRow`) show the class, a short description and its days and times ("Every day" for all seven); opened: teacher, where (Google Maps, re-read on the server), from–until, notes, competitions coming up and medals, awards and notes, each addable and removable; a class is changed or stopped (`child_activities`, `child_activity_notes`, `school/activities.ts`). Nothing hard-deleted: a removed award was kept with `active = false`. Browser-checked: Piano, every day 5–6 pm, at TheMusicsCool picked from Maps, a December festival and a Grade 1 distinction |
| 12 | P0 | 08-012 | Today's classes on the calendar by default | Done | PR #234. A new `activity` source in `calendarRange` (`activityEntries`, `sessionDates`): each class's sessions on the days it meets, at its times on the household's clock, for that child, opening on Kids & School; stopping a class takes it off. Checked: the Calendar's day view showed "Piano · 5:00 pm – 6:00 pm · Anya QA" today with nothing added by hand |
| 13 | P0 | 08-013 | A child's classes in their details in Family too | Done | The owner, 2026-10-18 (PR #235): the classes outside school appear in the child's opened details in Family, folded with days and times and opening onto every detail, added and changed there (`_components/child-classes.tsx`, one component for Family and Kids & School, rendered outside the details form so its sheets keep their own forms). Browser-checked at 360px: a class changed from Family (Sunday dropped) read back everywhere |
| 14 | P1 | 08-014 | Kids & School's three counts side by side | Done | The owner, 2026-10-18 (PR #236): Need you, Live work and Checked sit three across as `ExpandableMetricRow` (stacked tiles, labels wrap, one full-width panel below for the open one) — CLAUDE.md rule 19's one written exception. Checked at 360px and 1280px, no sideways scroll |
| 15 | P0 | 08-015 | School timetable and exams | Done | PR #243. The owner, 2026-10-18. On each child's card on Kids & School: **School timetable** (one folded row per school day with its subjects, opening to each period with its time, teacher and room) and **Exams** (each exam by its kind, Unit test / Mid-term / Finals or the household's own, which any adult adds and is then there to pick; each opens to its subjects, each on its day and time with syllabus and links to material, web addresses only). Every subject is on the Calendar on its day (`examEntries`, source `school`), and HomeBrain reads papers and timetable days (`exam_paper`, `timetable_day` items), so HomeTalk answers "when is Asmi's maths exam and what does it cover?"; the night-before inference now also fires for an exam paper. Migration `20261019100000` (four tables, access as a child's classes: the child, guardians and Admins read; guardians and Admins write; stood down, never deleted; marks HomeBrain's store stale), live, `verify:live` 302/302, DB test 6/6. A sheet that refuses a save keeps what was typed. Checked on the live project at 360px: a period, a Mid-term with Maths on 26 Oct with syllabus and a link (a bad link refused, the rest kept), on the Calendar's day view, and answered by HomeTalk |
| 16 | P2 | 08-016 | A child's timetable and exams in their details in Family, and the day's lessons in Calendar's day view | Not Started | Follow-up of 08-015 (PR #243): Family's child details show classes outside school (08-013) but not yet the timetable and exams; Calendar shows exam papers, not the school day's periods |
| 17 | P1 | 08-017 | A child's goals, and a brighter, game-like WonderHome for children | Done | The owner, 2026-10-20. **Goals** on Kids & School (a fourth tab): a guardian or an Admin sets, changes and retires a goal with a child — title, kind (picked, with its own way to add one), picture, every day / some days a week / once, stars each time, an optional reward and end date (`child_goals`, `child_goal_checkins`, RLS: the child and guardians read, guardians write goals, the child or a guardian ticks off today; `scripts/test-child-goals-rls.mjs`). **The child's Home** opens with a game card — level (every 20 stars, named), stars and streak, and where the stars came from — and the tabs Today, School (was Homework), Goals and Fun. Today holds the day's missions (goals and school work due), what is on the family calendar today and the next fun thing; "I did it!" ticks off a goal or marks school work done, a second tap takes it back. Stars, levels, streaks and badges are counted, never stored (`school/goals.ts`, tested). **Every screen a child opens** carries `data-audience="child"`: a brighter page, rounder cards and a star counter beside the bell; nothing an adult sees changes. Fun is the family calendar's outings, family time, gatherings, trips, birthdays and occasions, and the Goals tab says so with a link to Calendar. Help ¶8–9 of School in all eight languages |
| 18 | P1 | 08-018 | A cat companion for the child, and clear ways to earn stars | Done | The owner, 2026-10-20. Under the game card the child's own cat (`CompanionCat` in the kit, `--wh-cat-*` tokens, tail and blink still under reduced motion) says one thing at a time, worked out from the child's own records by `school/companion.ts`, never stored: something new under their bell (the newest unread one's title, in their language), missions left, a streak to keep, a goal one tick away, stars to the next level, the next fun plan, then a saying and an idea of the day (12 each, changing daily). Show me opens what a line is about; Tell me another moves on. The child names the cat and renames it (`child_companions`, migration `20261020180000`, live; written only by the child, read by the child, guardians and Admins; `scripts/test-child-companions-rls.mjs` 4/4). Ways to earn stars, on Today and Goals, lists each of the child's goals with its stars, one star for each piece of school work marked done, a level every 20 stars and the streak, the same rules `childProgress` counts by. Words in all eight languages, help ¶10. Follow-ups the same day: the child picks the cat's colour (ginger, grey, black, white, brown or calico, each a small cat with its word; `child_companions.coat`, migration `20261020190000`, live), and the cat now shares true facts for the child's age band (`kids.cat.fact.<young|older|teen>.N`, four a day), reminds them of the next school work, the next class today (`nextClassToday`, activities and timetable) and what they look after (responsibilities), dealt reminder–fun–reminder, and starts one line further along each time the page or a tab opens (a per-device counter). |
| 19 | P1 | 08-019 | Each child's score on Kids & School, goals set from classes and school work with a reward, and a child's school work that opens to its details | Done | The owner, 2026-10-20 (PR #272). **Score:** under each child's name on the Overview — level, stars (from goals and from school work), streak, goals met now of all, and each reward earned — counted by `childProgress` exactly as the child's Home counts it (`kidProgress`, `ChildScore` in `school/goals-tab.tsx`); the Goals tab shows the same card. **Start from:** adding a goal lists the child's classes outside school and open school work (`goalStarts`, tested). A class fills a weekly goal, as many times as it meets; school work fills a one-off goal ending on its due date, met the day the work is marked done (`child_goals.source_kind`/`source_id`, migration `20261020210000`, live; `childProgress` counts the work's done day as the goal's tick; the server checks the source is that child's). Adults set it; the child sees it, with no separate tick for a work goal and no second mission. **Child Home fixes:** each school row opens under its chevron (`ExpandableRow`) to its kind, subject, when, time it takes, status and the teacher's note, with "I did it!" still one tap; the cat's Show me scrolls to the section it means, also on the tab already open. Words in all eight languages, help ¶11. Follow-ups the same day (PR #273): the score card stays on Goals only (the owner took it off the Overview); the child picker says first names (a full name only when two children share one); the tab row fits a 320px screen with no scroll (`SegmentedControl` labels wrap, the count drops under its label); a timetable period's teacher is picked from the child's teachers, with No teacher set and its own Add new; an event is no longer homework — it is kept under the Overview's Coming up only, out of the Homework tab, its count and Live work. |
| 20 | P0 | 08-020 | A child's Done on a goal waits for a grown-up | In Progress | The owner, 2026-10-20 ("send this to adult for verification before making done"). A check-in the child makes is kept unverified (`child_goal_checkins.verified_at`/`verified_by`, migration `20261020230000`): the child sees **Waiting for a grown-up** (amber, hourglass; a second tap takes it back), and it earns no stars, streak or reward until verified (`goalStandings`/`childProgress` count only verified ticks; `waitingToday`). The child's guardian, else an Admin, gets a notice (`goalCheckInNotices`, source `goal_checkin`, one per waiting tick, resolved when answered). Kids & School → Goals shows **Waiting for you** first, each with **Yes, done** (verifies, in their own name) and **Not yet** (takes the tick back) — `answerCheckInAction`. A guardian's or Admin's own tick is verified as made; RLS lets only them verify, and the child can no longer take back a verified tick. Rows from before stay counted. Tests: goals 2, notices 3, RLS 2 (`test-child-goals-rls.mjs` 10/10). Words and help ¶11 in all eight languages. **Waiting on:** the migration reaching the live project (the database tool's calls were cancelled; until it runs, ticks count as before). |
| 21 | P1 | 08-021 | The cat's sayings from a long list, by age and gender, never repeated for a child | In Progress | The owner, 2026-10-20 ("store a long list of such quotes in a table, tag with age, gender etc. use that to display, never repeat these for a child"). `companion_sayings` holds 154 facts, sayings, ideas, jokes and riddles (`school/companion-sayings.json`, the migration's seed, kept equal by `companion-sayings.test.ts`), each tagged with ages (4–7, 8–12, 13–17, or all), a gender when chosen for one, and topics, in all eight languages. `companion_sayings_for` (security invoker) picks unheard ones for the child's age and gender from their own member row; each line the cat shows is recorded in `companion_sayings_heard` (`heardSayingAction`), so it never comes back, and Tell me another skips any already shown. When every saying is heard, the cat keeps to reminders; without the table it keeps the built-in daily lines. Also fixed: each tab press added another cat card (PR #276). Tests: companion 2, sayings 4, RLS 4 (`test-companion-sayings-rls.mjs`). Help ¶10 in all eight languages. **Waiting on:** migration `20261020231000` reaching the live project. |
| 22 | P2 | 08-022 | Confetti and balloons when a child does something | Done | The owner, 2026-10-20 ("on goal completion show confetti and balloons going up as celebration"). `Celebration` in the kit (`ui/celebration.tsx`, keyframes in `ui-theme.css`): about three seconds of confetti falling and balloons rising over the screen in the domain tones, catching no taps, hidden from assistive technology (the button already announces it) and not shown under reduced motion. It plays each time I did it! is tapped on a goal or school work. The Waiting for a grown-up button now wraps in a narrow width so a goal's name is never squeezed (rule 11). Also the same day, every tab row (`SegmentedControl`): tabs size to their own label and count so a count stays beside it (it drops under only when the row truly cannot fit, 320px Kids & School), and a tapped tab brings its row to the top of the screen (`SegmentInView`, `scroll-margin-top`, reduced motion jumps). Checked at 320/360/412px: no tab row scrolls, no two-line tab at 360; a tab tap put the row at 64px. |
| 23 | P1 | 08-023 | The cat walks, goes back and forth, and goes round its whole list | In Progress | The owner, 2026-10-21 ("repeat the quotes only when the stored list is finished"; "make the cat move in the empty area"; "show left arrow icon and right arrow icon around the 'tell me another' button"). `companion_sayings_for` now offers every saying that suits the child, unheard first, and only once all are heard the one heard longest ago; telling one again moves its `heard_at` on (`markSayingHeard`, column-limited update policy; migration `20261021031000_companion_sayings_cycle.sql`, `test-companion-sayings-rls.mjs` 4/4). Before the migration reaches the live project the cat behaves as before. The cat strolls down its column and back with a step-bob (`wh-cat-wander`, still under reduced motion). The left arrow goes back the way the child came this visit, the right arrow forward again; Tell me another always finds a new line; the controls sit under the cat across the card so both arrows fit at 360px. Help ¶10 in all eight languages. Waits on: applying the migration live (two `apply_migration` calls were cancelled on 2026-10-21). |
| 24 | P1 | 08-024 | One stray tap never takes a tick back | Done | The owner, 2026-10-21 ("yesterday it was showing 1 star and 1 streak, but today is showing 0"). The API log showed Asmi's check-in for 20 Oct (17:28 UTC) taken back at 18:12 by the done button's second tap (`undoCheckIn`, not a grown-up's Not yet). The done button now asks first: one tap on a done tick shows "Tap again to take it back", which lapses after four seconds; only a second tap takes it back (`kid-done-button.tsx`). Asmi's 20 Oct tick was restored on the live project (1 star, the streak resumes with today's). Words in all eight languages; help ¶10. Browser QA at 360px: one tap asks, the question lapses, the check-in stays on record. |
| 25 | P2 | 08-025 | Add homework and Connect school sit under the child picker | Done | The owner, 2026-10-21 ("bring this row in between these lines, these should specific to each child"). The two actions moved out of the page header to a row between the child picker and the Overview/Homework/Calendar/Goals tabs (`school/page.tsx`). Add homework opens on the child picked above (`defaultChildId` on `AddHomeworkButton`); Connect school still opens Integrations, because a school portal is connected for the household. Help (Kids & School ¶1) in all eight languages. Browser QA at 360px and 1280px: the row sits between the pills and the tabs, no horizontal scroll, and picking the second child then Add homework shows that child in For. |
| 26 | P2 | 08-026 | Touch the cat and it darts away | Done | The owner, 2026-10-21 ("if you try to touch the cat, it should quickly move away!"). A touch on the companion cat (or a mouse coming near it) sends it to the far side of its card from the finger in 140 ms, with a sideways skip, never past the card's edge (worked out from where it rests, so a second tap moves on from there rather than off the card); it strolls back after 1.5 s (`companion-card.tsx`, `flee`). A touch that arrives as two pointer events counts once. Still under reduced motion. Browser QA at 360px: the cat moved about 370px inside a card of 466px and came back. |
| 27 | P0 | 08-027 | A class's exam or event, from HomeSend, on the Calendar | Done | The owner, 2026-10-24 ("this particular activity is actual Extra Curricular not school work. add more types so categorisation can be done properly"), on a WhatsApp forward about Asmi's karate exam that HomeSend filed as school work. A class's entries gain an exam (grading, belt test) and an event (a show, a match), each with a start and end time (migration `20261024130000_activity_note_exams_events`, applied live); every dated one is on the Calendar once on its day (`activityEntries`) and a HomeBrain fact with its time. HomeSend reads two new kinds — a class or activity outside school (`activity_item`, filed under the child's class of that name, the class added in the same step if the child has none) and an event or invitation (`event`, on the family calendar through `addFamilyEvent`); both are reviewed, reconciled and undoable (migration `20261024140000_homesend_activity_event_kinds`, applied live). Eval HS-20 (now an activity) and HS-21 (an invitation) |
| 34 | P1 | 08-028 | A generic school-portal connector catalog | Done | The owner, 2026-10-26 ("create a generic connector… it could be any other portal for other schools"). The connector framework (08-002/08-003/08-008) was provider-neutral but registered no providers, so `getConnector("school", …)` was always null and the pipeline unreachable. New catalog `packages/core/src/school/providers.ts`: a `SchoolProviderDescriptor` (id, label, auth, scopes, `requiredEnv`, `adapterReady`, `portalUrl`) and `SCHOOL_PROVIDERS` — the forward path (`manual`, works for any school with no setup, items arrive via HomeSend), a `demo-school` fixture for development, and `loop-learning` named but `adapterReady:false` (off until `LOOPLEARNING_*` set, and still unconnectable until a real adapter ships — CLAUDE.md's bar). `schoolProviderAvailability`/`schoolProviderCatalog` gate on env; `connectable` is true only for the forward path and shipped+configured adapters, so a merely-named portal never masquerades as live. `registerSchoolProviders()` (idempotent) populates the shared registry and is called by the school sync route before `getConnector`; with no portal env — every deployment today — it registers nothing and the route still answers "not configured" honestly. Every registered connector is `live:false`. Tests `school/providers.test.ts` 10/10 (catalog order, env gating, connectable logic, no live adapter, idempotent registration, a full sync through a catalog provider); school suite 122/122, core typecheck + web typecheck clean. No migration, no secrets. Follow-up: the user-facing Connect-school screen (provider picker, per-portal auth + guardian consent, child-identity mapping) — 08-029. |
| 35 | P2 | 08-029 | The Connect-school screen | Not Started | Turn the catalog (08-028) into a user-facing connect flow: provider picker, per-portal sign-in or grant, a guardian's consent, and external-child-id → member mapping, read-only. Eight languages; 360px/desktop QA. |
| 36 | P1 | 08-030 | Track a school message channel from its link | Done | The owner, 2026-10-26 ("after login… user can give a direct link within the portal where messages come in continuously… tracked and entered in WonderHome as entries", e.g. `https://www.looplearning.com/channel/2044541`). The provider-neutral, network-free core: a `channel` shape on `SchoolProviderDescriptor` (hosts + path pattern + example; Loop Learning's `/channel/:id`), and `packages/core/src/school/channels.ts` — `parseSchoolChannel(url)` recognises a pasted link by its host, extracts the channel id and normalises the URL (a host no provider claims, or a non-channel path, is refused with a reason, never guessed), and `toChannelIntake(channel, message)` codifies how one message becomes a HomeSend review entry: untrusted text with a context line and an idempotency key `school_channel:provider:channel:messageId`, so a continuous feed never files one twice. The rule it keeps (CLAUDE.md agent platform): every channel message is untrusted and goes through HomeSend — understood, injection-scanned, nothing written until a person confirms; a channel is never an authorisation channel. Tests `school/channels.test.ts` 8/8 (the owner's exact link, trailing slash/query/bare-host normalisation, wrong host, non-channel path, non-URL, idempotent keying, sender prefix); school suite 130/130; core + web typecheck clean. No migration, no secrets, no live polling. |
| 37 | P1 | 08-031 | Store, poll and file a school channel | In Progress | Follow-up of 08-030, needs a live adapter (CLAUDE.md). **PR A (backend), done:** `school_channels` table + RLS (Admin writes; members read; a child-tied channel seen only by those who may see that child) and the HomeSend `school_channel` source (migration `20261026210000`, applied live, `home_send_items` source check widened; `get_advisors` clean for the new table). `channel-repository.ts` (add/reactivate keyed by connection+channel, stop/resume keeping the cursor, record poll). `ingestSchoolChannelMessage` files a channel message as a `school_channel` intake — understood, injection-scanned, idempotent by the channel message key, awaiting a person; read-only, never an auth channel; built with no school→HomeSend dependency (primitives in). Source label in eight languages. Tests: `school-channel.test.ts` 3, `test-school-channels-rls.mjs` 6, per-row-helper guard 5, homesend/school/i18n suites 586. **PR B (UI + poll), remaining:** the sync orchestrator that files a live provider's channel messages (no-op until an adapter ships), the Connect-school channel paste/manage UI, and wiring. Nothing is written back to the portal; every message waits for a person to confirm. |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Kids & School Intelligence as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 08-E01 — School Data & Child Planning:** stories 08-001 through 08-005.
- **Epic 08-E06 — Documents, Communication & Deep Integrations:** stories 08-006 through 08-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 08-001 — Child responsibility
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Define age-appropriate responsibilities.

**Acceptance criteria**
- Given the household state described by the story, define age-appropriate responsibilities .
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-002 — School connector
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Create provider-neutral school/LMS interface.

**Acceptance criteria**
- Given the household state described by the story, create provider-neutral school/LMS interface .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-003 — Assignment ingestion
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Import homework, worksheets, exams and events.

**Acceptance criteria**
- Given the household state described by the story, import homework, worksheets, exams and events .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-004 — Study planning
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Estimate effort and schedule child-friendly work.

**Acceptance criteria**
- Given the household state described by the story, estimate effort and schedule child-friendly work .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-005 — Deadline risk
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Detect likely missed school deadlines.

**Acceptance criteria**
- Given the household state described by the story, detect likely missed school deadlines .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-006 — Document workspace
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P1
**Goal:** Store/link authorized worksheets and school documents.

**Acceptance criteria**
- Given the household state described by the story, store/link authorized worksheets and school documents .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-007 — School summaries
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P1
**Goal:** Turn school communications into actions.

**Acceptance criteria**
- Given the household state described by the story, turn school communications into actions .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-008 — Deep portal automation
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P2
**Goal:** Implement richer provider-specific integrations.

**Acceptance criteria**
- Given the household state described by the story, implement richer provider-specific integrations .
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-010 — Each child's school details
**Epic:** Kids & School
**Priority:** P0
**Goal:** A parent keeps a child's class, class teacher and subject teachers beside the school, on Kids & School.

### Story 08-011 — Activities and classes outside school
**Epic:** Kids & School
**Priority:** P0
**Goal:** Every class a child goes to outside school is one folded row (class, short description, timings); opened, it holds the teacher, the schedule, notes, upcoming competitions and medals.

### Story 08-012 — Today's classes on the calendar
**Epic:** Kids & School
**Priority:** P0
**Goal:** A class that meets today is on the Calendar by default, from its schedule, with nothing to add by hand.

### Story 08-009 — Add a child from a school notice
**Epic:** Kids & School
**Priority:** P2
**Goal:** When a school notice names a child the household has not added yet, let the reviewer add them right there.

**Acceptance criteria**
- The school review offers "add this child" when no child matches, with the name prefilled.
- Adding follows the same guardian rules as the Family screen; the notice is then confirmed for that child.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-028 — A generic school-portal connector catalog
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P1
**Goal:** Make the provider-neutral connector framework extensible and honest: one catalog where any school portal plugs in, the forward path that works for every school today, and no portal claiming a connection it does not have.

**Acceptance criteria**
- A single catalog lists every school-connection option with its availability, so adding a portal is a catalog entry plus an adapter, never a change to a domain module.
- The forward path (HomeSend) is always available and needs no deployment setup; it works for any school.
- A named portal stays off until its own environment variables are set, and unconnectable until a real adapter and its integration tests ship (CLAUDE.md). No portal is `live`, and a merely-named portal never reports as connected.
- The existing school sync route resolves a connector from the catalog, and still answers "not configured" when none is.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- Relevant unit tests pass; core and web typecheck clean.
- Security/privacy: no credentials in code; nothing live.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-029 — The Connect-school screen
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P2
**Goal:** Turn the catalog (08-028) into a user-facing connect flow: pick a provider, sign in or grant where the provider needs it, give a guardian's consent, and map the portal's child ids to the household's children — all read-only, nothing written back.

**Acceptance criteria**
- Kids & School's "Connect school" opens a screen listing the catalog with honest states: the forward path available now (linking to Add homework / forwarding), portals as "setup needed" or "coming soon".
- A connectable portal collects its credential as a secret (never in code or a log), records a guardian's consent, and maps external child ids to members before any sync.
- Words in all eight languages; browser-checked at 360px and desktop.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-030 — Track a school message channel from its link
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P1
**Goal:** After an account is connected, let a household paste a link to a message channel inside the portal (a class group, a notice board) so its messages are tracked and entered into WonderHome — the network-free core of it: recognising the link and codifying how a message becomes an entry.

**Acceptance criteria**
- A provider declares the shape of its channel links; a pasted link is recognised by its host, the channel id extracted, the URL normalised. A host no provider claims, or a path that is not a channel, is refused with a reason — never guessed, because a misrecognised channel would file a stranger's messages against a child.
- A channel message is modelled as untrusted content that becomes a HomeSend review entry (understood, injection-scanned, nothing written until a person confirms), with an idempotency key so a continuous feed never files one twice.
- No live polling; no secrets; no migration.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- Relevant unit tests pass; core and web typecheck clean.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-031 — Store, poll and file a school channel
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P1
**Goal:** Make channel tracking real end to end once a provider's adapter is live: store the channels a household registers, poll each for new messages, and file each through HomeSend — nothing written back to the portal.

**Acceptance criteria**
- A connection's channels are stored with RLS (guardians and Admins manage; scoped to the household), each recognised by 08-030's parser before it is saved.
- A dedicated `school_channel` HomeSend source (migration to the `home_send_items` source check) and a DB-backed `ingestSchoolChannelMessage` that dedupes on the channel key; each message waits for a person to confirm.
- A schedule polls each channel when its provider is live; a provider that is not live stores the channel but polls nothing, honestly.
- UI to paste and manage a channel link; eight languages; 360px/desktop QA.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.