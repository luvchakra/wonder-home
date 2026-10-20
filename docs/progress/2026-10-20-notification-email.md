# Notifications by email, and the notification backlog (27-001)

**Date:** 2026-10-20 · **Asked by:** the owner: "create .md file in GitHub with all these as notification stories with priority assigned. once created start following it", after a summary of how notifications work today.

## The backlog

`backlogs/27-Notification-Channels.md` holds fifteen stories in three priorities:

- **P0:** 27-001 email for notifications; 27-002 choose the channel per kind of reminder.
- **P1:** 27-003 test a channel and say why one did not arrive; 27-004 a HomeSend item waiting for your OK; 27-005 a guest's reply tells the host; 27-006 a helper who won't come; 27-007 move an unanswered reminder to another channel; 27-008 a morning digest by push, email or WhatsApp; 27-009 email unsubscribe and pausing a rejected address; 27-010 delivery that can be seen and retried; 27-011 WhatsApp goes live (Blocked on a person).
- **P2:** 27-012 grocery order progress; 27-013 a moved or cancelled event; 27-014 weather that changes a plan; 27-015 channels that suit a helper and a child.

It also records what exists today, the invariants every channel keeps, and the order of work. It does not duplicate 26-004 (calendar reminders and a digest option) or 26-005 (calendar notices over WhatsApp); it refers to them.

## 27-001, built

- **The channel.** `notifications/email.ts` is a live email adapter over the platform mailer that already sends invitations. `channelAdaptersFromEnv` uses it only where the deployment has SMTP; otherwise email stays the inert fixture and the settings card says so.
- **The address.** `deliver.ts` reads the confirmed email of the member's own account. It never uses an address an Admin typed for someone: email is the person's to switch on. No confirmed address records a `no_target` failure.
- **The gate.** `emailWorthSending`: critical always, high up to 12 a day, a reminder timed for the person up to 6, anything else not at all, and low never. Quiet hours hold except critical. Counts come from the person's own `sent` events.
- **The message.** The notification's own title and body (what push already carries), an "Open in WonderHome" button that only ever links inside WonderHome, and a line saying why it came and where to change it. Both in the recipient's language, through `notificationEmail.open` and `notificationEmail.why` in all eight catalogs. Every value is escaped.
- **The record.** Each attempt leaves one `sent` or `delivery_failed` event in closed words. A rejected address is marked not retryable and an unreachable server retryable, for 27-010.
- Help: Reminders and notifications ¶7, in all eight languages. CLAUDE.md names the channel and its rules.

## Verified

- `notifications/email.test.ts` (15): the gate, the message and its escaping, only-inside links, the adapter on a good, absent and unusable address, the retry words, live only with a mailer, and `deliverNotification` against a fake database and mailer for the sent, no-address, low-priority, over-ceiling, switched-off and no-mailer cases. All 153 notification tests pass, and so does the full suite.
- Typecheck, lint, help and i18n (106), help links, bundle, tracker.
- **Not seen:** a real email arriving. This checkout has no SMTP credentials and I do not read the production ones. The first real send happens after deploy, when a person turns Email on under Settings → Notifications. 27-003's test button will make that a single tap.

## Still open

The rest of backlog 27. Next is 27-002, choosing the channel per kind of reminder.

## Where the code lives

`packages/core/src/notifications/{email,deliver,channels,push-gate}.ts` and `email.test.ts`; `i18n/messages/areas/settings/*` and `areas/help/*`; `backlogs/27-Notification-Channels.md`.
