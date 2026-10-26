# Smart notifications

Reference detail moved verbatim from CLAUDE.md (2026-10-24, token-economy pass). The summary rules followed on 2026-10-25 and are the next section; `CLAUDE.md` keeps only the invariants. Read this file only when you change `packages/core/src/notifications/` or a source a reminder reads.

## Summary rules (from CLAUDE.md)

Detail: `docs/notifications.md`. Reminders are about real records, never fired-and-forgotten text.
- Derived from records (`sources.ts`) and reconciled idempotently (`reconcile.ts`). Timing is on the household's clock (`timing.ts`); never read `getUTCHours()` for a person's day.
- One recipient per reminder (`plan.ts`). A recipient changes only its state (seen, done, dismissed, snooze), never its content; a trigger enforces this.
- Acting on the thing goes through the domain's own service, never a notification write.
- Only `deliverNotification` pushes (`notifications/web-push.ts`, `push-gate.ts`), mails (`notifications/email.ts`, to the account's confirmed email) or sends anything. Every email uses `email/layout.ts` `renderEmailLayout`. Muting (`notification_channel_mutes`) is honoured, but critical always goes.
- Notices (`notices.ts`) are one thread per record, built with a test. A new kind is a new source plus a policy entry, with `reminder.*` wording in every language, never a new writer of `notifications`.


Smart notifications (module 23, `packages/core/src/notifications/`) are
reminders about real records, never lines of text fired and forgotten.
- **Sources.** `sources.ts` derives each reminder from a record a domain
  already keeps: an unpaid bill, pending school work, a planned meal, the
  grocery list, pet care, a family plan.
- **Reconcile.** `reconcile.ts` brings the notifications table in line
  with those records (create, update, resolve, expire; idempotent). It runs
  after any signed-in page (throttled), before `/notifications` reads, and
  from the daily cron.
- **Timing.** `policies.ts` defines when each kind lands, as per-category
  presets a person picks from (`reminder_preferences`). Every time is on
  the household's clock (`timing.ts`); never read `getUTCHours()` for a
  person's day.
- **Recipient.** One person (`plan.ts`): the record's owner, then the
  responsibility's owner, a child's guardian, the backup, then the Admin.
- **What a person may change.** A recipient changes a reminder's state
  (seen, done, dismissed, snoozed forward up to 31 days), never its
  content; a trigger enforces this, and every transition is recorded.
- **Actions.** Acting on the thing itself goes through the domain's own
  service. The reminder resolves because its source changed, not because a
  notification wrote to a domain table.
- **Push** (story 23-015, `notifications/web-push.ts`, `push-gate.ts`). A
  member turns push on per device in Settings → Notifications
  (`push_subscriptions`, their own rows only; `public/sw.js` shows it). A
  push goes to the one recipient's devices only when it earns the buzz
  (`pushWorthSending`): critical always, high and timed reminders within a
  daily ceiling, low never; quiet hours hold except for critical. Every five
  minutes pg_cron calls `/api/v1/notifications/dispatch`
  (`deliverDueNotifications`), so a reminder lands at its time. The same tick
  moves reminders to their next stage (`advanceDueStages`, at most 40 a tick,
  under the page load's five-minute claim), so "this morning" never waits for
  someone to open the app. It takes only households whose
  `notification_reconciliations.next_due_at` has come: each pass sets it to the
  next moment anything changes by itself (`nextReminderCheck`, at most six
  hours away), and a trigger moves it to now when a record a reminder reads
  changes or a person closes a reminder. A source table a reminder reads gets
  that trigger (`wh.mark_reminders_due`). An event's
  on-the-day reminder is Normal (it may push); the evening before stays Low. Health
  appointment and measurement reminders run on the same tick, on the household's
  clock, each sent once. Notifications offers push for this phone (`PushNudge`)
  only where it would work and is not on yet. It is inert
  until a deployment sets `WONDERHOME_VAPID_PUBLIC_KEY` and
  `WONDERHOME_VAPID_PRIVATE_KEY` (optionally `WONDERHOME_VAPID_SUBJECT`) and
  the database holds the cron secret in Vault as `cron_secret`. A device the
  push service calls gone is forgotten. Never push from anywhere but
  `deliverNotification`.
- **Email** (story 27-001, `notifications/email.ts`). The same `deliverNotification`
  sends it, through the platform mailer (`email/mailer.ts`, GoDaddy SMTP) where the
  deployment has one, to the confirmed email of the recipient's own account, never one
  an Admin typed. It earns an inbox by `emailWorthSending` (critical always, high up to
  12 a day, a reminder timed for the person up to 6, low never) and holds for quiet
  hours except critical. Each attempt is a closed-word `notification_events` row. Never
  mail a notification from anywhere but `deliverNotification`.
  Every WonderHome email, an invitation included, goes through `email/layout.ts`'s
  `renderEmailLayout`: a whole document with its language and charset, a preview line, a
  greeting by first name, and a footer naming WonderHome, why it came and where to change
  that. A bare card from the same mailbox went to Gmail's spam (2026-10-23).
- **What goes where** (story 27-002, `notifications/routing.ts`). A person keeps one
  kind of reminder off one channel (`notification_channel_mutes`, their own rows only);
  no row means allowed. `deliverNotification` is given the reminder's `category` and
  skips a muted channel, except for a critical alert, and the in-app list cannot be
  muted. Only channels that are on and reach someone here are offered, in Settings →
  Notifications, in the Notification center: one row per kind that opens to
  its on/off, timing and channels (`notification-center-card.tsx`). The backlog for the
  channels and the events still to come is `backlogs/27-Notification-Channels.md`.
- **The household's own rules** (story 27-025, `household-settings.ts`). Admins set,
  under Manage Household → Household notifications, which kinds the household uses,
  the timing everyone starts from, which channels beyond the app may reach anyone, the
  second-channel and backup steps, and household quiet hours. Kept as versioned
  `policies` rows, enforced in `reconcile.ts` and `deliverNotification`. A person's own
  choices narrow these and never widen them; a critical alert still goes.
- **Can I trust it?** (stories 27-003, 27-009, 27-010). Under each channel
  in Settings → Notifications a person sees whether a reminder will reach them
  there and the plain reasons it may not (`channel-check.ts`, closed reasons:
  off, no device or address, quiet hours, today's ceiling, not set up, the last
  attempt failed), and "Send a test" goes to them alone through
  `sendTestNotification`. Every notification email carries a signed one-tap
  unsubscribe (`unsubscribe.ts`, `/email-off`, which asks first, and the
  `List-Unsubscribe` one-click endpoint); three refusals in a row from the mail
  server pause email with a closed `paused_reason` (`email-health.ts`). A
  failure the channel marks retryable is queued on the job queue
  (`retry.ts`, `retry-handler.ts`: three tries, one waiting per notification and
  channel, never for what has since settled). Every drain knows the kind
  (`drainJobs` falls back to `notificationJobHandlers`). Admins read counts
  per channel under Manage Household → Notification delivery
  (`delivery-report.ts`).
- **Notices** (stories 27-004 to 27-014, `notices.ts`, `notices-sweep.ts`). A
  notice is about something that happened and is still true, derived from a
  record exactly like a reminder: one thread per record, idempotent, resolved
  when the record settles, never fired and forgotten. Today: a HomeSend item
  waiting for a yes or failed safely (the kind of thing only), a guest's reply
  (one updating thread, to the owner), a helper away, an order's progress, an
  event moved or cancelled by someone else (recorded by a database trigger into
  `family_event_changes`; never to the editor, never to anyone off the event),
  and rain that changes a plan where Weather is on. The sweep runs from the
  reminder pass and, for any household whose records changed, from the
  delivery clock. A notice needs a `source_id` and a `reminder.*` message in
  every language. A new notice is a builder with a test, never a new writer.
- **An AI key that stopped working** (the owner, 2026-10-26, `ai/key-alerts.ts`,
  `notices.ts` `aiKeyNotices`). Every model call goes through
  `ai/provider-clients.ts`, which shows the answer to `key-alerts.ts`: a
  refusal about the key itself (out of credits, out of quota, not valid) is
  recorded by the key's SHA-256 fingerprint in `ai_key_alerts`; a call that
  works resolves it. A live voice session's close reason comes back from the
  page (`/voice/gemini/closed`). The notice pass matches fingerprints to the
  household's own keys (`household_ai_key_alerts`) and tells the Admin, high
  priority so it is emailed. Out of credits and a rejected key are told at
  once; a quota refusal only after ten minutes, since a per-minute limit says
  the same words. No provider reports a balance in advance, so this tells at
  the first refusal, not before.
  WonderHome's own key (`WONDERHOME_AI_KEY`) belongs to no household: the
  delivery clock emails the platform's owners and operators once per alert
  (`ai/platform-key-alert.ts`, stamped `platform_notified_at`), and the
  platform-admin AI operations read shows it while it is open (14-048).
- **A second way, a summary, a fit** (stories 27-007, 27-008, 27-015). A bill,
  school or pet reminder unanswered past the policy's wait (`channelEscalation`,
  always shorter than the backup's) is also sent once by email or WhatsApp,
  claimed by an `escalated` event first (`channel-escalation.ts`). A person can
  have one morning digest per channel (`digest.ts`): once a local day, the same
  rows as the in-app summary in their language, empty days send nothing, and a
  channel carrying one holds ordinary reminders back to the app. A child's
  channels and reminders keep their age's quiet hours until a guardian sets
  their own (`child-quiet.ts`); someone with no confirmed account email is not
  offered email.
- **Fewer interruptions.** A child's school things due the same day are one
  reminder (`school_day`, `batchSchoolDays`), as urgent as the most urgent
  item in it. A policy that escalates tells the responsibility's backup
  once, only after the last reminder has gone unanswered for the policy's
  wait (`isUnanswered`, `planEscalation`). Nothing repeats beyond
  `maxRemindersFor`.
- **Smart, but never in charge.** The day's summary on `/notifications` is
  built from the same rows. Learned timing (`learning.ts`) is off unless a
  person turns it on. It learns only from them acting on a reminder, needs
  five consistent times, never overrides a timing they chose, and is claimed
  on a row only when it actually moved it.
- **In each person's language** (story 22-006). A reminder's words are a
  `reminder.*` catalog key plus typed values (`notifications/message.ts`),
  kept in `notifications.message`. `title`/`body` are the English record,
  rendered from that same message. `/notifications` and delivery beyond the
  app render it in the recipient's language and formats. A name or item is
  never translated, and an unreadable message shows the stored English.
- **New kinds.** A new kind of reminder is a new source plus a policy
  entry, with its wording as `reminder.*` keys in every catalog, never a
  new writer of `notifications`.
