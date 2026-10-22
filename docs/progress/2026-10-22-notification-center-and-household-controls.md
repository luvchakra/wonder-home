# Every notification use case tested; the notification center; household notifications for Admins (27-023 to 27-025)

The owner, 2026-10-22: "write test cases for each item in Excel and run the
test cases, fix if any issues found. add notification center where adult can
update their notification choices. also have notification related admin
settings that can control the notification experience of all users."

## 27-023 — Every workbook use case is tested
- **The tests.** `packages/core/src/notifications/use-cases.test.ts` has one
  block per row of the owner's workbook: R01–R08, H01–H03, N01–N09, D01–D05,
  E01–E03 and X01–X02. That is 83 tests against the real source builders,
  planners, push and email gates, health timing, notices, the digest, the
  invitation email and the WhatsApp acknowledgement. Each block checks:
  - default timing, and the other timings a person can pick;
  - who receives it, and the fallback when they cannot;
  - the stored priority;
  - which channels it may reach;
  - the escalation wait;
  - when it ends.
- **Bug: health reminders never left the app.** Appointment and measurement
  reminders were sent as ordinary alerts, and an ordinary Normal alert never
  pushes or emails. Both sweeps now send them as timed reminders.
  `health/reminders-delivery.test.ts` failed before the fix.
- **Bug: lost after quiet hours.** A health reminder held back by quiet hours
  was later delivered in the app only. `deliverDueNotifications` now treats
  health's own reminders as timed for their person. The test in
  `stages.test.ts` fails without the fix.
- **Corrections to the workbook.** Where it described the code wrongly, it now
  matches the code:
  - **D02** stays in the app;
  - **N01** goes to the head Admin when the sender cannot confirm;
  - **N08** is a child's "Done" waiting for a grown-up;
  - **R06** is also Normal for a medicine;
  - **H01** is Normal for all three.

## 27-024 — The notification center
- **One row per kind.** Settings → Notifications opens with a row for each kind
  (`_components/notification-center-card.tsx`, the kit's `ExpandableRow`, rule
  21). The collapsed row says in words whether it comes, when, and where.
- **Opening a row** offers "Get these", "When" and "Where" (the channels beyond
  the app). Each change saves at once.
- **One kind at a time.** Each save writes only that kind
  (`saveReminderKindAction`), so a kind nobody touched keeps following the
  household's starting timing.
- **Two cards removed.** It replaces the separate reminder-timing card and the
  "What goes where" card; both were removed.
- **What the household decided is shown, never offered back.** A kind an Admin
  turned off reads "Turned off for the whole household by an Admin". A channel
  the household turned off is not listed.

## 27-025 — Household notifications for Admins
- **Where.** Manage Household → Household notifications
  (`/household/notifications`), for Admins only.
- **What an Admin sets for everyone:**
  - each kind of reminder on or off, and its starting timing;
  - which channels beyond the app may reach anyone;
  - whether an unanswered bill, school or pet reminder takes the second-channel
    step, and then the backup step;
  - the household's quiet hours, for anyone without their own.
- **Storage.** Two versioned, audited `policies` rows
  (`notifications/household-settings.ts`); "Quiet hours" is the row HomeTalk
  already writes, so no migration was needed. A save writes only what changed,
  and keeps a timing only when it differs from the policy's own.
- **Enforcement is on the server.**
  - `reconcile.ts`: kinds off, starting timing, both unanswered steps, quiet
    hours.
  - `deliverNotification`: a channel the household turned off carries nothing
    but a critical alert.
  - `loadReminderPreferences` starts from the household's timing.
- **Applying a change.** The write marks every household due through the
  #309 trigger, so the next five-minute tick applies it.

## Verified
- **Unit tests:**
  - notifications, health, help, i18n, household and web: 1,828 tests pass;
  - `household-settings.test.ts`: parsing, own-then-household-then-policy
    timing, channel holding, delivery with a channel off, and the reminder pass
    with a kind off and with a starting timing.
- **Gates:** typecheck, ESLint on the changed files, the security suite
  (12/12), `lint:help-links`, `lint:embeds`, a production build and
  `check:bundle`.
- **Browser** (a production build at 360px and 1280px, QA household
  `78c84500-1009-48bc-b9cc-c644aedba6e7`):
  - **Admin:** turning Groceries off and setting Bills to "On the due day" saves
    and holds after a reload. The person's notification center then shows
    Groceries as turned off by an Admin, and Bills on the household's timing
    until they pick their own.
  - **Person:** turning School off and picking a timing of their own both save
    and hold.
  - **Stored rows:** version 4 keeps only the real choice; unchanged quiet hours
    wrote no new version.
  - **Layout:** no sideways scroll and no page errors. Two layout fixes came
    out of the browser check:
    - The Admin page's kind names first wrapped badly on desktop ("Grocerie…"),
      so each name now has its own line.
    - A dropdown cut "When it's time to start cooking" at 360px, so each timing
      is now a chip (`ChoiceChips`, given a controlled mode for this, noted in
      `design/DESIGN-NOTES.md`), and a long one wraps.

  This used a local-only push key pair, removed afterwards.

## Still open (needs the owner)
- **D02:** should a child's or helper's request push and email, rather than wait
  in the app? (`conversation/referral.ts`, `reason: "reminder"`).
- **WhatsApp (27-011),** set aside by the owner.

## Cleanup
The QA account and household were deleted after the merge, the local key pair
was removed from `.env.local`, and the local server was stopped.
