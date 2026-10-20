# WonderHome — Notification Channels and Events

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 27-001 | Notifications reach people by email | Done | The owner, 2026-10-20. `notifications/email.ts`: the email channel sends through the platform mailer (`channelAdaptersFromEnv`, live only where the deployment has SMTP; production has) to the confirmed email of the member's own account, by `emailWorthSending` (critical always; high up to 12 a day; normal only as a reminder, up to 6; low never) and quiet hours. The message is the notification's own title and body, an "Open in WonderHome" button and a why line, in the recipient's language (`notificationEmail.*`, 8 languages). Each attempt is a `sent` or `delivery_failed` event. Tested with a fake mailer (`email.test.ts`, 15); a real send is first seen after deploy, when a person turns Email on under Settings → Notifications. |
| 2 | P0 | 27-002 | Choose the channel for each kind of reminder | Not Started | Today a channel is on or off per person. A person says "bills by WhatsApp, school by push, everything else in the app". |
| 3 | P1 | 27-003 | Send me a test notification, and say why one didn't arrive | Not Started | A button per channel in Settings → Notifications, and a plain reason when it fails (no device, quiet hours, not set up). |
| 4 | P1 | 27-004 | A HomeSend item waiting for your OK tells you | Not Started | A photo, forward or voice note that needs a confirm reaches the person who can confirm it. |
| 5 | P1 | 27-005 | A guest's reply to an invitation tells the host | Not Started | One thread per event, so ten replies are one updating notification. |
| 6 | P1 | 27-006 | A helper who won't come tells the adults | Not Started | From Househelper's "away" days; tells the one who looks after that duty, then the backup. |
| 7 | P1 | 27-007 | An unanswered reminder moves to another channel | Not Started | Escalation across channels per policy, not only to a backup person. |
| 8 | P1 | 27-008 | A morning digest by push, email or WhatsApp | Not Started | Opt-in. The same rows as the in-app "HomeBrain summary · Today". Shares scope with 26-004's daily digest option. |
| 9 | P1 | 27-009 | Email: unsubscribe, and stop on a rejected address | Not Started | Follows 27-001. One tap turns email off; an address the server rejects repeatedly is paused and said so. |
| 10 | P1 | 27-010 | Delivery that can be seen and retried | Not Started | Per-channel results for an Admin, retry with backoff for the failures marked retryable. |
| 11 | P1 | 27-011 | WhatsApp goes live | Blocked | Needs a person: a Meta business account, an approved message template and the deployment's keys. The code is complete and tested. |
| 12 | P2 | 27-012 | A grocery order's progress tells the person who placed it | Not Started | Placed, shipped, delivered, as one thread. |
| 13 | P2 | 27-013 | A moved or cancelled event tells those going | Not Started | Only a change by someone else; never an echo of your own edit. |
| 14 | P2 | 27-014 | Weather that changes a plan tells the person it affects | Not Started | Speaks only when it changes a decision (washing that won't dry, an outing in rain). Never a forecast readout. |
| 15 | P2 | 27-015 | Channels that suit a helper and a child | Not Started | A helper with a phone and no email gets WhatsApp; a child's quiet hours follow their age. |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose

A notification should reach the right person, once, by the way they chose, at a moment that suits them, and say what to do. The engine that decides whom and when is built (modules 06 and 23). This module is the other half: the channels beyond the app, the events that deserve a notification and do not have one yet, and how a person controls what goes where.

## Where things stand (2026-10-20)

- **Built and live:** the in-app list; reminders from bills, school work, meals, the grocery list, pet care and family events; custom reminders and snooze; quiet hours on the household's clock; batching; escalation to a backup person; browser and phone push (Web Push; production has its keys, and each person turns it on per device).
- **Built, not live:** WhatsApp (sending, delivery reports, STOP, linking a number) waits on Meta's account and template.
- **Built 2026-10-20 (27-001):** email for notifications, through the platform mailer that already sends invitations.
- **Alerts that exist:** an agent action waiting for approval, a payment or refund outcome, a health appointment, an overdue checkup.

## Epic Map

- **Epic 27-E01 — Channels:** 27-001, 27-009, 27-011, 27-015.
- **Epic 27-E02 — Control:** 27-002, 27-003.
- **Epic 27-E03 — Events that deserve a notification:** 27-004, 27-005, 27-006, 27-012, 27-013, 27-014.
- **Epic 27-E04 — Reach and trust:** 27-007, 27-008, 27-010.

## Dependencies

- `CLAUDE.md` (Smart notifications; External providers: WhatsApp)
- `backlogs/06-Actionable-Notifications.md`, `backlogs/23-Smart-Notifications.md`
- `packages/core/src/notifications/` (`deliver.ts`, `channels.ts`, `push-gate.ts`, `web-push.ts`, `whatsapp.ts`), `packages/core/src/email/mailer.ts`
- Related and not duplicated here: 26-004 (calendar reminders and a digest option) and 26-005 (calendar notices over WhatsApp).

## Invariants

- **One door out.** Nothing is pushed, mailed or sent to WhatsApp from anywhere but `deliverNotification`, so every send passes the same recipient, quiet-hours and gate checks.
- **The row comes first.** The in-app notification is the delivery. A channel failing never fails a notification.
- **A channel earns the interruption.** Push, email and WhatsApp each have a ceiling per person per day by priority; critical alone ignores quiet hours; low never leaves the app.
- **Closed words only.** Each attempt leaves one `notification_events` row (`sent` or `delivery_failed`, with a code), and never a message body, an address or a provider's prose.
- **Inert until real.** A channel is live only when its credentials, authentication and tests exist. A screen never offers a channel that cannot send.
- **AI decides none of it.** Whom, when and by which channel is rules and the person's own settings; the engine works with AI switched off.
- **Words in the recipient's language,** and an external channel carries the notification's own words and no more.

## Stories

### Story 27-001 — Notifications reach people by email
**Epic:** 27-E01
**Priority:** P0
**Goal:** A person who turns email on in Settings → Notifications gets their reminders and alerts in their inbox, by the same rules as push.

**Acceptance criteria**
- The email channel sends through the platform mailer when the deployment has one, and stays inert (and out of Settings) when it does not.
- The address is the member's own account's confirmed email, never one an Admin typed for them: a person's email is theirs to switch on. A member without one gets a recorded `no_target` failure.
- An email goes only when it earns it: critical and high always (within a daily ceiling), normal only when it is a reminder timed for this person (a lower ceiling), low never. Quiet hours hold except for critical.
- The message is in the recipient's language, with a plain-text and an HTML part, one button back into WonderHome, and a line saying why they got it and where to change it.
- Each attempt leaves a `sent` or `delivery_failed` event in closed words.

### Story 27-002 — Choose the channel for each kind of reminder
**Epic:** 27-E02
**Priority:** P0
**Goal:** For each kind of reminder (bills, school, meals, groceries, pets, family, appointments, system), a person picks which channels carry it.

**Acceptance criteria**
- Settings → Notifications shows kinds against the channels that are live, as tick boxes, with sensible defaults (in-app always on).
- Channel selection reads the choice, then quiet hours and the gate. A channel unticked for a kind never carries it, except a critical alert, which always goes where the person allowed any critical alert.
- A new kind of reminder appears in the grid without a screen change.

### Story 27-003 — Send me a test notification, and say why one didn't arrive
**Epic:** 27-E02
**Priority:** P1
**Goal:** A person can prove a channel works, and when it did not, find out why in plain words.

**Acceptance criteria**
- A "Send a test" action per live channel, to that person only, rate limited.
- A failed or skipped send is explained: no device registered, quiet hours, channel off for this kind, daily ceiling reached, or not set up here.

### Story 27-004 — A HomeSend item waiting for your OK tells you
**Epic:** 27-E03
**Priority:** P1
**Goal:** Something sent into HomeSend that needs a person's confirm reaches the person who can confirm it, without them opening HomeSend to find out.

**Acceptance criteria**
- One notification per waiting item, to the sender when they may confirm it, otherwise to an Admin; it resolves when the item is confirmed, undone or fails safely.
- "Failed safely" items say so.
- Nothing about the item's content beyond its title appears on an external channel.

### Story 27-005 — A guest's reply to an invitation tells the host
**Epic:** 27-E03
**Priority:** P1
**Goal:** The host of an event hears when a guest replies, without refreshing the event.

**Acceptance criteria**
- One thread per event; later replies update it ("Anya and 2 others are coming; 1 can't").
- Goes to the event's owner only. Replies never create a notification for the guest.

### Story 27-006 — A helper who won't come tells the adults
**Epic:** 27-E03
**Priority:** P1
**Goal:** When a helper marks a day away, the person who relies on them hears the same day.

**Acceptance criteria**
- Recipient by the responsibility's owner, then the backup, then an Admin.
- One thread per helper per day; undoing the absence resolves it.

### Story 27-007 — An unanswered reminder moves to another channel
**Epic:** 27-E04
**Priority:** P1
**Goal:** A reminder nobody has answered reaches the person a second way before it reaches anyone else.

**Acceptance criteria**
- A policy can say "if unanswered after N, also send by X". The step is bounded and happens once.
- It never repeats beyond `maxRemindersFor`, and it stops as soon as the reminder is resolved or answered.

### Story 27-008 — A morning digest by push, email or WhatsApp
**Epic:** 27-E04
**Priority:** P1
**Goal:** A person who wants one calm message a day gets today's reminders in one place.

**Acceptance criteria**
- Opt-in per channel, at a time the person picks on the household's clock.
- Built from the same rows as the in-app summary; empty days send nothing.
- When on, the individual reminders it contains stay in the app and do not also buzz.

### Story 27-009 — Email: unsubscribe, and stop on a rejected address
**Epic:** 27-E01
**Priority:** P1
**Goal:** Email is easy to turn off and does not keep trying an address that never works.

**Acceptance criteria**
- Every notification email has a link that turns email off for that person, signed and single-purpose.
- An address the mail server rejects several times in a row is paused and the person is told in the app.

### Story 27-010 — Delivery that can be seen and retried
**Epic:** 27-E04
**Priority:** P1
**Goal:** An Admin can see whether notifications are reaching people, and a transient failure gets another try.

**Acceptance criteria**
- A per-channel view of the last days: sent, failed and why, in counts.
- A failure marked retryable is retried a bounded number of times with backoff, through the existing jobs queue.

### Story 27-011 — WhatsApp goes live
**Epic:** 27-E01
**Priority:** P1
**Status:** Blocked, on a person.
**Goal:** Reminders and alerts reach people on WhatsApp.

**Acceptance criteria**
- A Meta business account and number exist, the message template is approved, and the deployment has `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_BUSINESS_NUMBER`.
- A real send and a real delivery report are seen end to end, and STOP is honoured.

### Story 27-012 — A grocery order's progress tells the person who placed it
**Epic:** 27-E03
**Priority:** P2
**Goal:** Placed, shipped and delivered are one updating notification to the person who ordered.

### Story 27-013 — A moved or cancelled event tells those going
**Epic:** 27-E03
**Priority:** P2
**Goal:** When someone else changes or cancels an event, the people going hear about it.

**Acceptance criteria**
- Not sent for the editor's own change. Visibility rules apply: someone who cannot see the event is never told it exists.

### Story 27-014 — Weather that changes a plan tells the person it affects
**Epic:** 27-E03
**Priority:** P2
**Goal:** Rain on the day of an outing, or washing that will not dry, is said once, to the person it matters to.

**Acceptance criteria**
- Only when it changes a decision; never a forecast readout. Off unless the household has weather switched on.

### Story 27-015 — Channels that suit a helper and a child
**Epic:** 27-E01
**Priority:** P2
**Goal:** A helper with only a phone number and a child with school-day hours get notifications that fit.

**Acceptance criteria**
- A helper without an email is offered WhatsApp, not email. A child's quiet hours default by age and are set by a guardian.

## Module Completion Rule

Work in priority order, P0 first: 27-001 (done), then 27-002. Then the P1 stories in table order, except 27-011, which waits on a person and is never worked around. P2 stories follow. A story that adds a notification kind also adds its `reminder.*` words in every language, its policy entry, and its place in the settings grid (27-002).
