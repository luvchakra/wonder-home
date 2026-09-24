# WonderHome — Smart Notifications

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 23-001 | Reminders from real records | Done | `notifications/sources.ts` derives reminders from unpaid bills, pending school items, planned meals, the grocery list, pet care and family plans. `notifications/reconcile.ts` brings the table in line (create / update / resolve / expire), is throttled per household, and runs after any signed-in page, before the feed reads and from the daily cron. Rows carry `category`, `source_type`/`source_id` and a window. Live-verified end to end on the real project |
| 2 | P0 | 23-002 | Reminder policies and timing windows | Done | `notifications/policies.ts`: per-category presets as data (bills 3 days + due day, school evening before + morning of, meals when cooking starts from the recipe's time, groceries late afternoon, pets on the day, family an hour before). `planStages` works in the household's zone; stages are bounded (≤10, DB-checked). `reminder_preferences` holds a person's chosen preset |
| 3 | P0 | 23-003 | Idempotency, auto-cancellation and lifecycle trail | Done | The thread key plus the open-per-thread index is the dedupe key, and an unchanged reminder is never rewritten. A finished source resolves its reminder; a moved date reschedules it; a dismissed stage never returns, though a later one can. `wh.log_notification_transition` records every change of state in closed words |
| 4 | P0 | 23-004 | Quiet hours on the household's clock | Done | Fixes the UTC bug in `decide.ts`/`channels.ts`: quiet hours are read in the household's time zone, to the minute. A reminder is deferred, brought forward, or — only when urgent — breaks the quiet. The household's HomeTalk quiet-hours rule is the default for people with no setting of their own |
| 5 | P0 | 23-005 | Notification center: feed, categories, detail, actions | Done | `/notifications` reconciles first, then shows the person's own reminders most pressing first (priority → deadline → newest) under All / Action needed / Upcoming / Updates, with category chips. Each row (`ReminderRow`, an `ExpandableRow`) opens to the live record behind it — a bill's amount, due date, payee and repeat; a school item; a meal and its recipe time; a pet; a family plan — read now through the person's own session, never copied. Mark as paid goes through `finance/repository.ts`'s `markObligationPaid` (a recurring bill rolls to its next due date with history; Admins only), Mark done through `completeSchoolItem`/`markPetCareDone`; the reminder clears by reconciliation, never by editing it. The nav badge counts what is new; opening the feed marks it seen. Browser-verified at 360px and desktop |
| 6 | P0 | 23-006 | Snooze and custom reminders | Done | "Remind me later" on every open row: 15 minutes, an hour, later today, tomorrow morning, or a picked day (the next week) and time on the household's clock (`atLocal`), bounded by the database to 31 days. The confirmation names when it comes back |
| 7 | P1 | 23-007 | Notification settings | Done | `/settings/notifications`: quiet hours to the quarter hour on the household's clock, and per-kind timing (the policy's own presets, picked never typed) with an on/off each; saving reconciles so waiting reminders move at once. The per-channel cards stay below |
| 8 | P1 | 23-008 | Smart batching | In Progress | The grocery list is one reminder per day ("Milk, bread and eggs are running low"). Grouping related school items is still open |
| 9 | P1 | 23-009 | Today at a glance and member-specific view | In Progress | Upcoming is today and tomorrow at a glance, grouped Today / Tomorrow / Later with each reminder's time on the household's clock, and every view is only the person's own (routing picks one responsible recipient). Still open (PR N3): the "For me / Household / Assigned by me" split and the list of responsibilities that route to this person |
| 10 | P1 | 23-010 | Escalation | In Progress | A reminder moves through its policy's stages (bounded, recorded as `escalated`). Escalating to a backup person when nobody acts is still open (PR N3) |
| 11 | P1 | 23-011 | HomeBrain smart digest | Not Started | PR N3: a summary over the same deterministic reminders, never an authority over them |
| 12 | P1 | 23-012 | Timing learned from behaviour | Not Started | Only as a signal, never over an explicit preference |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose

A notification appears because it is useful to this person at this moment, not merely because an event happened. Reminders come from real household records, go to the one person responsible, land at a time that fits the kind of thing they are about, respect quiet hours on the household's own clock, and disappear the moment the thing is done.

Source: `Smart_Notification_System_Master_Implementation.md` (2026-09-24) and its 12-screen mockup. The audit of what already existed, and the decision taken on each gap, is in `design/SMART-NOTIFICATIONS-AUDIT.md`. This module extends module 06 (Actionable Notifications) rather than replacing it.

## Epic Map

- **Epic 23-E01 — Engine:** stories 23-001 to 23-004.
- **Epic 23-E02 — Notification center:** stories 23-005, 23-006, 23-007, 23-009.
- **Epic 23-E03 — Fewer, better interruptions:** stories 23-008, 23-010.
- **Epic 23-E04 — Intelligence:** stories 23-011, 23-012.

## Dependencies

- Module 06 (decision engine, channels, lifecycle).
- The domain modules whose records are reminded about: 08 (school), 09 (groceries), 10 (meals), 11 (bills), 12 (family), 13 (pets).
- `design/SMART-NOTIFICATIONS-AUDIT.md`.

## Invariants

- **Real records only.** No reminder exists without a real record behind it, apart from a person's own HomeTalk reminder.
- **No duplicated domain data.** A reminder never copies a domain record; it names it.
- **The recipient controls state, not content.** A recipient can change a reminder's state; its content is WonderHome's.
- **AI never decides the essentials.** No model decides whether, when or to whom a reminder goes. The engine works with AI switched off.

## Module Completion Rule

The P0 engine (23-001 to 23-004) comes first. The notification center (N2) only shows what the engine decided. Intelligence (N3) only suggests, and every suggestion passes through the same policies.
