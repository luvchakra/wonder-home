# What goes where: the channel for each kind of reminder (27-002)

**Date:** 2026-10-20 · **From:** backlog 27 (`backlogs/27-Notification-Channels.md`), the second P0 story, asked for by the owner.

## What was built

- **Data.** `notification_channel_mutes` (migration `20261020100000_notification_channel_mutes.sql`). One row is one kind of reminder kept off one channel for one member; no row means allowed. The kinds are the nine notification categories and the channels are push, email and WhatsApp, both as closed lists in the table. A member reads and writes only their own rows, by the set form of the membership check. A new kind or channel needs no row and no migration.
- **Delivery.** `deliverNotification` takes the reminder's `category`, from `createNotification` and from the delivery clock (which now reads it with each due notification). A channel the person keeps that kind off is skipped, for push, email and WhatsApp alike. Two things are never muted: the in-app list, which is the record, and a critical alert.
- **Settings.** Settings → Notifications → "What goes where" (`ChannelRoutingCard`): each kind against the channels the person has switched on and that reach someone in this deployment, as tick boxes. Everything starts ticked. A tick saves at once, rolls back with an error line if it fails, and the kind's name always has its own line so nothing is cut at 360px. With no channel on, the card says to turn one on first.
- **Words and help.** `channelRouting.*` in all eight languages; Help "Reminders and notifications" ¶8. CLAUDE.md names the rule.

## Verified

- **Unit:** `routing.test.ts` (11): everything allowed by default, one kind off one channel, in-app and unknown kinds never muted, closed lists, add and remove, a repeated mute, refusing a bad kind or channel. `email.test.ts` gained three delivery cases: a muted kind is skipped and another is sent, a critical alert ignores a mute, and no kind named sends as before. The notifications suite passes 164, and so does the full suite.
- **Database:** `test-notification-mutes-rls.mjs` (6): own rows only, nothing across members or households, nothing written for someone else, closed lists, in-app refused, the same mute is one row.
- **Live project:** the migration was applied through the Supabase MCP and `verify:live` passes 319/319, with two new checks.
- **Browser, a QA household against the live project, with stand-in push and mail settings so both channels showed:** at 360px and 1280px the card listed every kind with Push and Email; unticking Bills by Email saved, and after a reload that box was clear while Push stayed ticked; no sideways scroll and no page errors.
- Typecheck, lint, migrations lint, help and i18n, help links, bundle, tracker, a production build, and the evaluation.

## Not seen

A real muted reminder failing to arrive on a real phone or inbox. The decision is tested at the delivery function with fake channels, and the setting is tested end to end; the first real email or push arrives after deploy, once a person has turned a channel on.

## Still open

27-003, next: a test notification per channel, and a plain reason when one did not arrive (a mute is now one of the reasons it can give).

## QA cleanup

Ran after the work was verified. The QA account `934573dd-49b4-4105-929d-2748848e6ce4` and household "QA Routes Home" (with its preference rows) were deleted, the dev server was stopped, and the scratch scripts were removed. SQL found no household, mute or QA account left.
