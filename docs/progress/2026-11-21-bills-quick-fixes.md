# Bills: quick fixes on a row and "Remind me on…" (11-023)

2026-11-21 · fourth of the owner's seven Bills follow-ups.

## What changed
- **Fix one value in place.** In a bill's details, an Admin taps the pencil beside **Due**, **Amount** or **Who handles it**, changes that one value and saves.
  - It goes through the editor's own write (`updateObligation`).
  - Like the editor, it confirms a Checking entry.
  - It is audited as `finance.bill_changed` with the field's name, and reminders are reconciled after the response.
  - Everything else stays in the row's editor, so nothing has two editors (rules 14 and 23).
- **Remind me on…** Anyone who gets a reminder about the bill picks a day, up to a month ahead.
  - Only their own waiting reminders about this bill move (filtered by `recipient_member_id`, plus `source_type` obligation and `source_id`).
  - They come back at 9:00 that day on the household's clock, through `snoozeNotification`, the same snooze the reminder itself offers. The reconcile keeps a snooze the person chose.
  - If nothing is waiting, it says "No reminder about this bill is waiting for you."

## Verified
- `finance/bill-reminders.test.ts` (3): the time zone, the one-month bound, the recipient-only filter and the empty case.
- Typecheck, lint, help tests and the build pass. No migration.

## Open
Nothing.

## Code
- `packages/core/src/finance/bill-reminders.ts`
- `apps/web/app/(auth)/bill-quick-actions.ts`, `_components/bill-quick-fix.tsx`, `bills/page.tsx` (`Fact` takes a `fix`)
