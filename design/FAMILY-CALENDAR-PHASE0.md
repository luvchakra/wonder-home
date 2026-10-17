# Family Calendar — Phase 0 design

**Status:** Phase 0 deliverable. It is waiting for the product owner's approval; nothing below is built yet.
**Implements:** *WonderHome Family Calendar — Claude Code Implementation Requirements* (the "spec", §1–§13) and its four-screen mockup (Month, Day, Year, Event detail).
**Date:** 2026-10-18

The spec's §12 asks for eight deliverables (a)–(h). They are sections 1–8 below. Section 9 lists the decisions only the owner can make.

---

## 1. (a) What exists today

**Summary:** WonderHome has a real family-events store, free/busy maths, conflict detection, invite links and a calendar-connector contract. It has **no calendar view**. "Calendar" today means two things: the "Upcoming" list on `/family` and the single-day timeline on `/today`.

### 1.1 Events

**Tables** (`supabase/migrations/20260917165018_family_time_and_social.sql`):
- `family_events`
  - `kind`: family_time, outing, birthday, gathering, appointment, school_event, travel, special_occasion.
  - `status`: proposed, planned, confirmed, happened, cancelled.
  - Other columns: `protected`, `owner_member_id`, `location`, `notes`, `integration_id`/`external_id`.
- `event_participants`
- `schedule_conflicts`, which only the server writes.
- `gift_plans`
- `wh.busy_windows`, exposed as `public.busy_windows`.

**Access rules (RLS):**
- Every member reads every event.
- Writes are limited to the owner, unowned rows, or an Admin.

**Other event-related pieces:**
- **Invite links:** `event_invite_links` and `event_guests` (`20261017190000`). The event page is `/family/events/[id]`.
- **Occasions:** the trigger `wh.sync_member_occasion_events` writes one birthday or special-occasion row per member. Two defects:
  - it builds the date at midnight in the database's time zone, not the household's;
  - it is rolled forward only when the member row changes.
- **Health appointments** (`20260922090000`) create a shared event only when their scope is `household_operational`.

**Code:**
- `packages/core/src/family/`:
  - `repository.ts`: `listEvents`, `createEvent`, `availability`, `familyAgenda`, `applyCalendarPlan`.
  - `schedule.ts`: `commonAvailability`, `mayScheduleOver`, `detectConflicts`.
  - `event-detail.ts`: the event page's reads and writes.
- `availability()` and `mayScheduleOver()` are **unused in production**.

**Gaps in the event model:** no per-event visibility, all-day flag, time zone, recurrence or category; no holidays anywhere.

### 1.2 Dated data in other domains

There are already permission-gated readers for each domain:
- `context/repository.ts` `CONTEXT_ADAPTERS`, with a 7-day horizon;
- `context/privacy.ts` `filterForViewer`;
- `apps/web/app/_lib/agenda.ts` (`householdAgenda`).

| Domain | Table · dates | Reader | Who may see |
|---|---|---|---|
| School | `school_items.due_at`/`ends_at`, kind exam/event/…; `school_communications.action_due_at`; `study_sessions` | `school/repository.ts` `listSchoolItems`, `listCommunications` | RLS `wh.may_see_child`: the child, their guardian, an Admin |
| Meals | `meals.on_date`, `ready_by`, `cook_member_id` | `meals/repository.ts` `listMeals({from,to})` | Any member (the app hides meals from children) |
| Bills | `obligations.due_on`, `recurrence` text | `finance/repository.ts` `listObligations` | RLS `wh.may_see_finance` (no children or helpers) + `finance.view` |
| Health | `health_appointments.starts_at/ends_at`, `privacy_scope`; `health_checkups.next_due_on`; routines | `health/appointments.ts` `listAppointments`, `checkups.ts` | RLS `wh.may_see_health` (subject, guardian, consent; no Admin bypass) |
| Helpers | `member_availability` (weekly pattern), `availability_exceptions.on_date` | raw queries (Househelper page, Home), `household/helpers.ts` `isExpectedOn` | Any member |
| Home & upkeep, pets | `service_requests.scheduled_for`, `home_assets` warranty/AMC/service dates, `pet_care_needs.due_on`, `laundry_needs.needed_by` | `home/repository.ts` | Any member |
| Responsibilities | `outcomes.due_at`, `routines.next_due_at` (no task table) | `household/configuration-repository.ts` | Members read |
| Groceries | `orders.expected_at`, `inventory_balances.use_by` | `commerce/*` | Members read |
| Reminders | `notifications.scheduled_for` | notifications | Recipient only |

### 1.3 Connectors, HomeTalk, notifications

- **Calendar connector:** `family/calendar-connector.ts` and `calendar-sync.ts` give a one-way import contract with a fixture only. No provider is registered (`integrations/registry.ts`). There is no Google, Outlook or ICS code and no OAuth.
- **HomeTalk:**
  - Intents: `plan_event`, `adjust_schedule` (school items only) and `set_reminder`.
  - `putOnCalendar` (`conversation/executor.ts`) creates an event with **no participants, no conflict check and no duplicate check**. No route moves or cancels an event.
  - Voice: Gemini/Alexa get `calendar_read` only; changes stay in the app.
- **Notifications:** `notifications/sources.ts` `familySubject` reminds **the event's owner only**. WhatsApp is the official Cloud API adapter, with intake into HomeSend; nothing is sent outward about events.
- **UI kit:** `CalendarItem`, `Timeline`, `SegmentedControl`, `Sheet`, `ExpandableRow`, `ChoiceChips`. There is no date library.
- **Swipe:** `navigation/use-primary-swipe-nav.ts` swipes between the primary areas, but stays out of horizontal scrollers and inputs.
- **Tests:** `schedule.test.ts`, `event-detail.test.ts`, connector and sync tests. There are no RLS tests for calendar tables and no test of `putOnCalendar`.

---

## 2. (b) What appears on the calendar, and from where

Per spec §2: **the calendar is a projection.** It never copies a record. Every entry links back to the record it came from, and editing happens there.

| Source | Shown as | Default | Opens | Reader (reuse) |
|---|---|---|---|---|
| Family events (native) | Timed or all-day block; proposed entries dashed | On | `/family/events/[id]` (edit there; the calendar's own form writes `family_events`) | `listEvents` (extended) |
| Birthdays & occasions | All-day, yearly | On | Member or event page | **Projected from `household_members` dates** (fixes the time-zone and roll-forward defects) |
| School | Exams and events as timed blocks; homework/projects as "due" markers (not blocks) | On (for whoever may see that child) | `/school` item | `listSchoolItems` |
| Meals | A light block at `ready_by`, only for planned meals | Off (filter) | `/meals` | `listMeals` |
| Bills | A "due" marker, amount hidden in shared views | On for `finance.view` | `/bills` | `listObligations` |
| Health | Appointments only; "Busy" unless the viewer may see it | On (the subject's own) | `/health` | `listAppointments` |
| Helpers | "Rekha away" on exception days; regular visits as a light all-day marker | On | `/househelper` | the availability tables (a new small reader) |
| Upkeep | Booked service visits only (`service_requests.scheduled_for`) | On | `/household/home` | `listServiceRequests` |
| Responsibilities | Outcomes with a `due_at` | Off (filter) | `/responsibilities` | outcome reader |
| Groceries | Expected deliveries only (`orders.expected_at`); **never items or use-by dates** | On | `/groceries` | `listOrders` |
| HomeSend | Not shown until reviewed. Once applied, the item appears through its domain row | — | — | — |
| Public holidays | Read-only all-day, labelled with its source | On (region) | — | New, see §3.3 |
| Google/Outlook | Not in this project (spec phase 6) | — | — | — |

Two distinctions stay visible on every entry (spec §4 "Critical"):
- A **due date** (a marker, "Due") versus a **scheduled time** (a block).
- **Proposed** (dashed outline, the word "Proposed") versus **confirmed**.

---

## 3. (c) Architecture and schema changes

### 3.1 The projection contract (`packages/core/src/calendar/`)

```ts
type CalendarEntry = {
  id: string;            // stable: `${source}:${sourceId}` or, for a recurrence instance, `${source}:${sourceId}:${yyyy-mm-dd}`
  source: "event" | "occasion" | "school" | "meal" | "bill" | "health" | "helper" | "upkeep" | "outcome" | "order" | "holiday";
  sourceId: string;
  title: string;         // already reduced to what this viewer may see ("Busy", "Bill due")
  start: string; end: string | null;   // instants; a "due" marker has end null
  allDay: boolean; timezone: string;
  kind: "block" | "due" | "marker";
  category: "family" | "school" | "meals" | "health" | "personal" | "work" | "household" | "holiday";
  memberIds: string[];   // who it is about / attending
  status: "proposed" | "confirmed" | "cancelled";
  visibility: "household" | "participants" | "private";
  href: string;          // owning screen
  can: { edit: boolean; move: boolean };   // decided by the source's own rules
};
```

- `calendarRange(supabase, viewer, {from, to, members?, sources?})` runs only the adapters this viewer is entitled to. Each adapter reads through the **member's own client**, so RLS still decides what is visible. It then:
  1. expands recurrence inside the range (bounded to 62 days for month and 366 days for year density);
  2. drops duplicates by stable source identity (for example, a health appointment that also has a `family_events` row shows once);
  3. sorts the result.
- **There is no materialized table at first.** Each view reads a bounded range: month ≈ 6 weeks, year = counts only, through a light `calendarDensity()`. A cache comes only if measured p95 says so (spec §7).
- **Year view** asks only for per-day counts by category, never titles.

### 3.2 Migration `…_family_calendar.sql`

**Changes to `family_events`:**
- `all_day boolean default false`
- `timezone text` (defaults to the household's)
- `category text` (picked from the categories above)
- `visibility text check in ('household','participants','private') default 'household'`
- `recurrence jsonb`: a small, validated subset: `{freq: daily|weekly|monthly|yearly, interval, byWeekday?, until?, count?}`
- `series_id uuid` and `occurrence_date date`, for an edited single occurrence.

**New table `event_exceptions`:** `event_id`, `occurrence_date`, `cancelled bool`, and override fields. Same access rules as the event.

**New RLS on `family_events` SELECT:**

```
visibility = 'household'
or owner = me
or (visibility = 'participants' and I am a participant)
or (visibility = 'private' and owner = me)
```

Admins do not bypass `private`, matching health.

**New table `public_holidays`:** `region`, `subregion`, `on_date`, `name`, `kind`, `source`, `source_version`. Read-only to sessions and seeded by a migration (see D3).

**New table `calendar_preferences`:** per member, holding `default_view`, `filters` (jsonb) and `holiday_region`. Only that member reads and writes it.

**Occasions are projected, not stored:** occasions are read from `household_members` dates in the household's time zone. The sync trigger is retired, and its rows are kept as history and hidden by `external_id`.

**Rollback:** every change is additive and nullable. Retiring the trigger is a `drop trigger`, with the function kept.

### 3.3 Public holidays

There is no provider today. The recommendation (D3): a **curated, versioned dataset** in the repo, seeded into `public_holidays`. It holds India's gazetted national holidays plus state lists for the regions a household picks, for 2026–2027. Each row names its source (for example "Government of India, DoPT holiday list 2026"). It is read-only, labelled "Holiday · source", and switchable off. A live API (for example Calendarific) needs a key, cost and a contract, and stays out until approved.

---

## 4. (d) Screens (mobile and desktop)

The approved mockup is followed with WonderHome's own tokens:
- **Primary indigo, not green, commits** (rule 3).
- The tab bar stays as rule 6 defines it. **Where the calendar lives is D1.**

| Screen | Mobile (360–430px) | Desktop |
|---|---|---|
| **Month (default)** | Month and year title with a picker, ‹ › arrows, a Today pill, search, and one `+`. A segmented Month · Week · Day · Year control. A 7-column grid; each cell holds the date and up to 3 coloured dots (category), with "+N" beyond that. Tapping a day opens its agenda under the grid: time, tile, title, who. Tapping an entry opens its source. | The same grid with **titles in the cells** (two rows, then "+N more"), and the day's agenda as a right-hand panel. |
| **Day** | A week strip at the top (swipe or arrows). An all-day lane, then a time grid from 6 am to 11 pm with overlapping blocks side by side. Each block shows time, title and who, with a tinted card and its category tile. A "due" marker is a thin row in the all-day lane. | The same, wider, with the agenda panel. |
| **Week** | On a phone, 7 day columns with dots and blocks compressed. **Below `sm` it shows as 7 stacked day sections**, never a squeezed grid (rules 15 and 19). | A 7-column time grid. |
| **Year** | 12 mini-months, 2 per row on a phone and 3–4 on desktop. Days are tinted by density, never with titles. Tapping a month opens Month, and tapping a day opens Day. | — |
| **Entry detail** | The source's own page. For a family event that is `/family/events/[id]`, which gains a "Related" list (school calendar, transport, reminders). Entries from other modules open their module. | — |
| **Add** | A sheet: title, date, start/end or "All day", who (chips), category. A "More" section holds repeat, visibility, location, notes and reminder. Creating checks conflicts first and shows them in words. | The same sheet as a side panel. |
| **Filters** | A chip row: members, categories, sources, "Only mine", "Confirmed only". Remembered in `calendar_preferences`. | The same, in the sidebar. |

**Gestures:**
- Pinch on the calendar surface moves Year ↔ Month ↔ Week ↔ Day, using pointer events with a distance threshold and keeping the focused date.
- It is **never** used for page zoom: `touch-action: pan-y` sits only on the calendar grid.
- The buttons always exist, and reduced motion turns the transition off.
- The grid opts out of the primary-area swipe (`data-swipe` exclusion), so a horizontal swipe changes the month there.

**States:** loading skeleton, empty ("Nothing planned"), a permission line ("Some entries are hidden"), "Some sources could not be read", and offline. Every state is said in words.

---

## 5. (e) HomeTalk

Every calendar action goes through the existing engine, grounding, approval and executor. There is no new brain.

| Spec case | Today | Change |
|---|---|---|
| A "Put a family dinner next Saturday" → time? who? | `plan_event` without participants or conflict check | `plan_event` gains `participants` ("all adults", names → member ids through the Wave 1 resolver). It asks one question at a time, time first and then who. The preview shows date, time, who, and **conflicts from `busy_windows` + `detectConflicts`**. Approval follows the outcome's autonomy. The executor writes participants. |
| B "What do we have next week?" | `answerStatus` reads events only | It answers from `calendarRange` for the viewer, so everything they may see appears and nothing private. The reply says "Some entries are private" when entries were hidden. |
| B "Which day is free for the dentist?" | `availability()` unused | New intent `find_free_time` → `availability()` over the members named. It says plainly when another member's calendar is not visible. |
| C "Move the dentist appointment to Friday" | `adjust_schedule` handles school items only | `adjust_schedule` grounds against calendar entries. A family event moves after approval. A health appointment asks: "Change only WonderHome's record? I can't change the clinic's booking." It never claims the clinic was told. |
| D School circular | HomeSend plan + receipt | Unchanged path. School items it creates appear on the calendar automatically. The reply lists what was created, updated or skipped (existing `homesend/talk.ts`). |
| "Cancel/undo that" | — | `cancel_event` (approval, reversible); undo through the event's own `setEventCancelled`. |

- Each new action gets a `REPLY_CLASSES` entry, a `voicelink/capabilities.ts` placement (app only for changes), and golden cases in `conversation/evaluation.test.ts` and `npm run eval`.

---

## 6. (f) Privacy and threats

- **Visibility is enforced in RLS and in each adapter, never only in the UI:**
  - `private` and `participants` events are filtered by RLS;
  - health uses `may_see_health`, finance `may_see_finance`, children `may_see_child`.
- **What other viewers see.** A health entry seen by someone without access reads "Busy" or is left out (D4). Bill titles are shown only with `finance.view`.
- **Children** see family events they are part of, their own school entries, and holidays. They never see bills or others' health.
- **Untrusted text.** Imported or HomeSend text is untrusted. It reaches a model only fenced (`homesend/injection.ts`), and event titles from outside are never instructions.
- **Approvals.** Sensitive actions (inviting others, changing an event others attend, anything outward) go through the approval binding (`conversation/approval.ts`) and are recorded.
- **Notifications** say no more than the recipient may see.
- **Threat model.** `security/THREAT-MODEL.md` gains a calendar section: cross-household leakage, private-event inference from free/busy (it reveals only "busy"), recurrence blow-up (range-bounded), holiday data integrity (versioned and sourced).

---

## 7. (g) Phases (one PR each)

| Phase | Scope | Size |
|---|---|---|
| **C1 — Foundation** | Migration §3.2 + RLS tests; `calendar/` contract and `calendarRange` with the event, occasion and holiday adapters; recurrence subset; the calendar route with Month (default), Day, Week and Year views, day agenda, filters and preferences; add/edit sheet with conflict check; buttons, keyboard and screen reader; pinch zoom; 8 languages; help | L (largest) |
| **C2 — Module adapters** | School, meals, bills, health, helpers, upkeep, outcomes and orders adapters, each with its own visibility tests and deep links; "Busy" handling; dedupe | M |
| **C3 — HomeTalk** | `plan_event` with participants and conflicts; `find_free_time`; `adjust_schedule` and `cancel_event` for events; read answers from the projection; evaluation cases A–D | M |
| **C4 — Notifications & holidays polish** | Reminders to participants (not just the owner), a daily digest option through existing policies, deduped with domain reminders; holiday region in Settings → Language & region | S–M |
| **C5 — WhatsApp** | Only if wanted: event notices to a consenting helper or member through the official template (shared with Groceries' Send to Cook) | S, needs template approval |
| **C6 — Google/Outlook** | Only after a separate approval (spec phase 6) | — |

---

## 8. (h) Tests

- **Unit:**
  - recurrence expansion (DST, month-end, leap day, `until`/`count`, exceptions);
  - range bounds;
  - dedupe by identity;
  - adapter visibility per role (adult, child, helper, Admin, health subject);
  - conflict wording;
  - pinch thresholds.
- **RLS (`scripts/test-calendar-rls.mjs`):**
  - private and participant events across members and households;
  - exceptions;
  - preferences;
  - holidays are read-only.
- **HomeTalk:** golden cases A–D, plus ambiguity, unauthorized and stale-approval cases.
- **Browser:** 360px and desktop for all four views, the day agenda, add with a conflict, filters, a child's view and a finance-less view; no overflow; keyboard-only navigation; reduced motion.
- **E2E (nightly):**
  - month default;
  - view switching keeps the date;
  - an entry opens its source;
  - an edited source moves on the calendar.

---

## 9. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Where does the calendar live?** The mockup puts "Calendar" in the tab bar. Rule 6 fixes the bar as Home · Today · HomeTalk · Family · More. | **Rename the Today tab to Calendar.** Today's timeline becomes Calendar's Day view, and Month opens by default with a "Today" shortcut, so no tab is added and nothing is duplicated. *(Alternative: keep Today and put Calendar in the Family area and sidebar.)* This changes CLAUDE.md rule 6's wording. |
| D2 | **Plan:** the calendar is a projection, but `family.events` is Pro/Max only. | Calendar viewing, holidays and native family events on **every plan**; nothing else changes. |
| D3 | **Holidays source** | A curated, versioned India national + state dataset in the repo, labelled with its source. A live holiday API later, by decision. |
| D4 | **Someone else's health appointment** | Show nothing by default. "Busy" only where that person shares their health with the viewer at "practical" level. |
| D5 | **Private family events** | Add `visibility` (household / people invited / just me). The default stays household, as today. |
| D6 | **Meals and responsibilities on the calendar** | Off by default and switchable in filters, to avoid flooding (spec §2). |
| D7 | **Pinch zoom** | Build it in C1 with the guards above. *(Or defer to after C2 if you prefer to ship buttons first.)* |
