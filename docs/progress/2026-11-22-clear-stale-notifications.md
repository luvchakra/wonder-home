# Notifications clear themselves when decided or stale

Owner, 2026-11-22 (via the coordinator): "keep clearing notifications as decisions are taken and notifications are stale or not applicable anymore".

## What was missing
- Approving or declining a HomeTalk proposal (`decideAction`) never resolved its "waiting for a yes" reminder; only expiry and a referral's `closeApproval` did.
- Health appointment and measurement reminders (`health/reminders.ts`, `routine-reminders.ts`) are made outside `reconcile.ts`, so nothing ever resolved them: a completed or cancelled appointment, a logged measurement or a removed routine left its reminder open.
- Replies to an event that had ended stayed open until their own `expires_at`.

## What changed
- `notifications/resolve.ts` `resolveNotifications`: the one way WonderHome clears a notification, `resolved` with `resolved_reason` (`decided`, `superseded`, `source_gone`, `settled`, `past`, `expired`, `duplicate`), kept in history. Migration `20261122230000_notification_resolved_reason.sql` adds the column; the writer retries without it, so either order is safe.
- Decisions clear at once: `decideAction` (decided / expired), `closeApproval`, `proposal-supersede.ts` (superseded), `proposal-expiry.ts` (expired); a Needs-you answer runs the household's sweep in `after()`.
- `notifications/stale.ts` `sweepStaleNotifications` on the delivery clock (`/api/v1/notifications/dispatch`): proposals/approvals no longer waiting; appointments completed, cancelled or removed; routines moved on, paused or removed; event replies/changes for an ended event; anything past its own `expires_at`; the older of two open about the same thing for the same person. Bounded (500 a pass); a failed read clears nothing of its kind.
- Never cleared: money and health for `past` or `expired` (only when the record shows them settled); a proposal or approval still waiting; Needs-you questions (their own default and deadline).
- Docs: `docs/notifications.md`. Help: Notifications body 17 in all eight languages.

## Verified
- `stale.test.ts`: each reason, the never-clear cases, the pre-migration retry. Notifications, conversation proposal, help and i18n suites pass (539 tests); typecheck, ESLint on changed web files, `lint:help-links`, `lint:migrations`.
- Dry run on live (read-only): the owner's household had 8 open notifications, 1 stale (`duplicate`: the preparation reminder for the 23 Oct appointment, beside its day-of one); across all households, the same 1. Kept by the never-clear rule: two past health appointment reminders whose appointments are still `confirmed`/`proposed`, and a 24 Oct measurement reminder whose routine was never logged.

## Open / needs a person
- Migration `20261122230000` must be applied to the live project; until then reasons are not stored (clearing still works).
- Whether a health appointment reminder should clear once the appointment is a day past is the owner's call; today it stays until the appointment is marked done or cancelled.
