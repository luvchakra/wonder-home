# Event-day pushes, a push prompt, and health reminders on the household's clock (27-018 to 27-020)

These are the remaining fixable items from the owner's notifications review
(2026-10-22). PR #307 already moved reminder stages onto the five-minute clock
and kept one reminder per occasion. The full inventory, with every use case,
trigger, channel and known issue, is in the workbook sent to the owner for
review: `WonderHome-Notifications-Use-Cases.xlsx`.

## 27-018 — An event earns its push on the day
**Found:** "Field trip to Bounce is today at 7:30" stayed inside the app.
Every school-event and family-event reminder was `low`, and `low` never earns
a push or an email (`push-gate.ts`).

**Fix:** the stage decides the priority (`sources.ts` `schoolSubject`,
`familySubject`).
- **The evening before** stays `low`: a quiet heads-up in the app.
- **On the day** it is `medium`, stored as `normal`. That earns one push
  (4 normal a day) and one email (6 a day) as a reminder timed for the person.
- Other school work keeps its existing priority.

## 27-019 — Offer push where reminders are read
**Found:** only one device had push turned on.

**Fix:** `_components/push-nudge.tsx` shows a "Get reminders on this phone"
card on Notifications, after any requests and the day's summary.
- **It shows only when push would work and is not on yet.** The deployment has
  a full key pair, the browser can push, permission was never refused, and
  this device is not subscribed. Otherwise it renders nothing (rule 10).
- **"Not now" waits 30 days** on that device (localStorage).
- **One flow, not two.** It shares Settings' flow: the device logic is now
  `usePushDevice` in `push-device-card.tsx`, which the Settings card also uses.

## 27-020 — Health reminders on the household's clock, at their time
**Found:**
- Appointment and measurement reminders ran only in the daily sweep (8:30 IST).
- They read "today" in UTC. So "Today's the day" could arrive after an early
  appointment had begun, or a day early when the appointment is near midnight.

**Fix:**
- **Local day and time.** `dueRemindersFor` and `routineDueNow` read the
  household's local day:
  - advance and preparation reminders from 09:00;
  - the day-of reminder from 07:00, or two hours before an early appointment,
    and never after it starts;
  - a measurement from 09:00.
- **On the clock.** Both sweeps run on the five-minute dispatch tick, and the
  tick reports `health`. The daily sweep stays as a backstop.
- **Sent once.** Each reminder is sent once, whatever became of it: the sweep
  reads every earlier send (any status) by thread key, in one query. The thread
  keys keep their old format, so what the daily sweep already sent is not
  repeated.

## Verified
- **Unit tests** for the event priority by stage, `dueRemindersFor` (including
  the UTC-versus-IST case) and `routineDueNow`. Health and notifications: 408 +
  139 tests pass.
- **Live reads.** The new selects ran read-only against the live project and
  returned each household's timezone. Embed lint passes.
- **Browser.** A production build signed in as a QA household, at 360px and
  1280px:
  - the nudge shows, with no horizontal scroll;
  - "Not now" hides it, including after a reload;
  - a browser that refused permission is never offered it;
  - the Settings card still says "Off for this device" with Turn on.

  The check used a local-only key pair, removed afterwards.
- Typecheck, lint, the security suite, `npm run eval`, `check:bundle` and a
  production build. (See the PR for the run.)

## Still open (needs the owner)
- **WhatsApp (27-011)** needs a Meta business account, an approved template
  and keys.
- **Two older households** belong to the owner's other sign-ins:
  - `luvchakra@gmail.com`: "Asmi Family", 18 Sep, last sign-in 26 Sep;
  - `kunalc.iit@gmail.com`: "Chakraborty Family", 21 Oct.

  Both are left until the owner says which to remove.
- **Scale.** At larger scale the five-minute stage pass would want a stored
  "next stage at" time per household.

## Cleanup
The QA account and household were deleted, the local key pair was removed from
`.env.local`, and the local server was stopped.
