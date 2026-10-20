# Notification events, the cross-channel step, the digest, delivery you can see (27-003 to 27-015)

**Date:** 2026-10-20. **Backlog:** `backlogs/27-Notification-Channels.md` — every story is Done except 27-011 (WhatsApp go-live), which waits on a person.

## What was done

- **27-003 Test and why.** Under each channel in Settings → Notifications the person sees whether a reminder will reach them there and, if not, the plain reasons (`notifications/channel-check.ts`): switched off, no device or address, inside quiet hours, today's ordinary ceiling used, not set up here, the last attempt failed. "Send a test" (email, WhatsApp; push keeps its button on that phone) goes to that person only, now, through `sendTestNotification`; its failure is a reason in their language.
- **27-009 Unsubscribe and a refused address.** Every notification email has a signed one-tap link (`unsubscribe.ts`) and the `List-Unsubscribe` headers; `/email-off` asks before changing anything and `POST /api/v1/notifications/email-off` is the mail app's own one-click. Three refusals in a row pause the channel with a closed `paused_reason`; Settings says why.
- **27-010 Retry and the Admin view.** A failure the channel marks retryable is queued on the job queue (at most 3 tries, one waiting per notification and channel, nothing sent that has since settled). Manage Household → Notification delivery shows counts per channel for seven days.
- **27-004/005/006/012/013/014 Notices.** A new layer beside reminders (`notices.ts`, `notices-sweep.ts`): derived from records, one thread per record, idempotent, resolved when the record settles: a HomeSend item waiting (or failed safely), guests' replies, a helper away, an order's progress, an event moved or cancelled by someone else (recorded by a database trigger into `family_event_changes`), and rain that changes a plan where Weather is on. Run from the reminder pass and, for any household whose records changed, by the delivery clock.
- **27-007 Cross-channel step.** `channelEscalation` on bills, school and pets: an unanswered last reminder is also sent once by email or WhatsApp before it reaches the backup.
- **27-008 Morning digest.** Per channel, at a time the person picks; once a local day; empty days send nothing; the ordinary reminders in it stay in the app.
- **27-015 Helper and child.** No email offered without a confirmed account email; a child's quiet hours follow their age until a guardian sets them in Family.
- **Also fixed:** "which are the next long weekends coming up" (live) was answered with the calendar; it is now read as the long-weekend question (HT-120).

## Why

The channels beyond the app existed but gave a person no way to know whether they worked, and the events that deserve a notification mostly had none. Everything keeps the module's rules: one door out (`deliverNotification`), the row first, a channel earns the interruption, closed words only, no AI in the decision.

## Verified

- Unit tests: notifications 251, with new suites for channel checks, the notice builders and the sweep (with an in-memory database), retry, escalation, the digest, child quiet hours, unsubscribe and email health; `npm run eval` 137/137 (HT-120 added), unsafe 0/18.
- `scripts/test-notification-notices-rls.mjs` (8): the change trigger, the unreadable log, the source types, the digest constraints. It caught that a notice needs a `source_id`.
- Live project: migrations `notification_email_pause`, `notification_notices`, `notification_digest`, `family_event_changes` applied; `npm run verify:live` 324/324. The real sweep ran against the live schema on a QA household (five notices created, none repeated, three resolved or rewritten as records changed), and a real digest was built and sent through a fake adapter.
- Browser at 360px and 1280px: Settings → Notifications (check, test, digest), `/email-off`, Manage → Notification delivery, Family → child's quiet hours.

## Open or needs a person

- **27-011** WhatsApp go-live (Meta account, approved template, `WHATSAPP_*` keys).
- A real email send is first seen after deploy (the sandbox cannot reach SMTP). Set `WONDERHOME_LINK_SECRET` (or rely on `CRON_SECRET`, which production has) for the unsubscribe link.
- A removed absence resolves its notice on the next page-open or daily pass, not within five minutes (a deletion leaves nothing for the clock to see).

## Where the code lives

`packages/core/src/notifications/` — `channel-check.ts`, `unsubscribe.ts`, `email-health.ts`, `retry.ts`, `retry-handler.ts`, `delivery-report.ts`, `notices.ts`, `notices-sweep.ts`, `channel-escalation.ts`, `digest.ts`, `child-quiet.ts`; Settings → Notifications, `/email-off`, `/household/delivery`, Family.
