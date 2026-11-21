# A child's exam papers are events wherever events are listed (26-023)

**Asked (owner, 2026-11-21):** "it doesn't create an event for science on 3rd dec, fix this issue with all subjects" — Asmi's Mid-Term Unit Test 2, eight papers, 3–14 Dec, from a timetable sent to HomeSend.

## What was there, and what was missing
Each paper was already drawn on the Calendar (Month, Week, Day and Year all come from `calendarRange`, which merges `school/exams.ts` `examEntries`), used by the clash and duplicate checks and HomeTalk's calendar spans, and reminded the evening before and on the day (`notifications/reconcile.ts` → `examPaperSubject`). It was missing wherever a screen lists `family_events` directly:

| Surface | Read |
|---|---|
| Home: upcoming, today's focus, the next card | `_lib/home-reads.ts` `homeRows` → `listEvents` |
| A child's own home | `_screens/child-home.tsx` → `listEvents` |
| Calendar Day view: Today plan | `calendar/_components/today-plan.tsx` → `listEvents` |
| Family page | `family/page.tsx` → `familyAgenda` |
| HomeTalk "what's going on" fallback | `_lib/hometalk-turn.ts` `answerStatus` → `listEvents` |

## What changed
- `school/exams.ts` `examPaperEvents`: each paper as the child's `school_event` (all day, or at its times on the household's clock), id `exam-<paper>`, `href` to the exam in Kids & School, `detail` the first line of what to study.
- `family/repository.ts` `listEvents(…, { exams: { timeZone } })` and `familyAgenda(…, { timeZone })` merge them in, sorted, within the same window and limit. The five surfaces above ask for them; HomeSend's matching, the REST `GET …/family` (a `family_events` contract), the chat picker and HomeBrain's calendar domain do not (HomeBrain gets exams through its school domain).
- `family/schedule.ts` `eventHref`: every event link goes through it, so a paper opens its exam, never a 404 on `/calendar/events/…`. Home's "ask someone to come" link is hidden for a paper.
- "Only those going" (`calendar-view.ts`) shows for an invited event only. A child's exam or class is seen by the child, their guardians and Admins (`may_see_child`) and reminded through the school reminder source as before.

**Why read live, not a copied `family_events` row:** the HomeEvents design (26-002) projects module records rather than copying them, and the single-door rule (26-018) keeps one record per thing. A copy would need a link column, keeping in step on every paper edit, removal and undo, and suppression of duplicate reminders, and it would still leave a second editor (rule 23). Read live, the owner's existing eight papers appear on every surface as soon as this deploys, with no backfill or migration.

## Verified
- `school/exams.test.ts`: all eight subjects become events, all day on 3 Dec in Kolkata, opening `/school?child=…`, windowed. Family, calendar-view, agenda and page-variant tests pass; typecheck is clean; ESLint is clean on the changed files; `npm run build -w apps/web` was run.
- Not browser-checked: this container has no `apps/web/.env.local` for a signed-in run.

## Open
- No outbound calendar sync exists (Google push or an ICS feed), so papers can't reach an external calendar yet.
