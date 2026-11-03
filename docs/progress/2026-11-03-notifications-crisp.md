# Notifications: crisp rows, grouped, in sections (2026-11-03)

The owner, from a phone screenshot of `/notifications`: "too many things going on in the notifications. make it crisp and useful". The screen showed 37 large cards. Each card had a detail box, a primary and a secondary button, and a third row with "Remind me later" and "Not needed". Three "A school notice is waiting for your OK" cards and one HomeSend card were near-duplicates. A bill card said its amount and due date twice.

## What changed

- **Alike reminders are one row** (`apps/web/app/_lib/reminder-groups.ts`). Everything HomeSend is waiting on becomes one row ("4 things sent to HomeSend are waiting for your OK"), because one visit to HomeSend answers all of it. Any other reminders of the same kind, with the same wording and the same place to act, become one row with "N like this". Grouping is display-only: each reminder keeps its own row in the table, its own state and its one recipient.
- **Rule 4 rows** (`_components/reminder-row.tsx`). Each row has a tinted tile, the name, one line that says the key fact once (`₹300 · due yesterday`, an event's or appointment's time, a meal's ready-by), and one thing to do. That is Mark as paid / Mark as done when the row is a single record with a done action, otherwise its Open link. "Remind me later" and "Not needed" moved into a ⋯ menu, which is a native `<details>` with no new client state. Tapping the row opens the rest (rule 21): the remaining details, why it came when it did, View bill, and the list of items in a group. The bill's amount and due date left the detail box, since the row line already says them.
- **Sections by what the reader decides** (rule 17): **Overdue** (its record's date or the reminder's latest time has passed), **Waiting for your OK** (HomeSend items, approval notices, and a child's or helper's requests with their own Approve and Decline), and **Today** (everything else that is due). Each heading shows its count once. I chose this over Today / This week / Later because everything on the "now" list is already due today. The decision a person makes differs between something late, something waiting for a yes, and the rest. Coming up (by day) and Done this week stay as they were, with alike rows grouped.
- **Urgent** only for open, high-priority money or health (bills, appointments), stated in words.
- **Filters**: one horizontally scrolling line at any width, "All" by default. A chip appears only for a category with something open.
- **Intro**: "Kunal, 5 things need you today." It counts rows, not stored reminders.
- **Snooze / Not needed on a group** apply to each reminder in it. The server actions now take repeated `notificationId` fields (1–50, uuid), and each still goes through the person's own session and the recipient guard, one by one. The done action (the shared `markObligationPaid` flow, school, pets, check-in) is unchanged and is only offered on a single-record row.

## Stale items

`/notifications` runs a reminder pass before it reads, but the pass was throttled to once per five minutes by `reconciled_at` alone. A bill paid, or a HomeSend item confirmed, a minute after a pass stayed on the screen until the throttle lapsed. `wh.mark_reminders_due` already moves `next_due_at` to now on such writes, but the page's claim ignored that. Now `claimReconcile` also takes the pass when `next_due_at <= now` and the last pass is more than 15 seconds old (`reconcileClaimFilter`, tested). `home_send_items` never had the trigger, so migration `20261103120000_home_send_items_mark_reminders_due.sql` adds it (after insert, update of status, or delete). It adds a trigger only, so it is safe in either order.

## Verified

- Typecheck (all workspaces), ESLint on the changed files, `lint:help-links`, `lint:migrations`, `lint:boundaries`.
- Unit tests: `reminder-groups.test.ts` (n HomeSend items → one row with a count and one action; alike vs different; a single bill → Mark as paid with View bill behind the tap; several alike → Open; section order; Urgent only for money/health; a bill's fact said once and left out of the details), `reminder-views.test.ts`, `notifications/stages.test.ts` (the claim filter), i18n and help suites.
- 360 px and 1280 px in Chromium, using the real row component and fixture data on a throwaway local page that was not committed. There was no horizontal overflow. The same eight reminders measured 2,481 px tall before and 989 px after. The ⋯ menu opens within the screen at both widths, and the bill row expands to Paid to / Repeats / View bill.
- No e2e spec clicks the notification buttons by name (checked `e2e/`), so none needed changing.

## Open / needs a person

- The Supabase connector in this session cannot see the `wonderhome` project, so the migration is **not applied live** from here. The owner runs the SQL from the PR (dashboard → project `wonderhome` → SQL Editor). The page-load claim fix works without it for everything except HomeSend items, which the five-minute delivery clock still sweeps.
- For the same reason, no QA household was seeded on the live project. The signed-in check with about 30 real notifications is the owner's look on a phone. No QA data was created, so there is none to clean up.
