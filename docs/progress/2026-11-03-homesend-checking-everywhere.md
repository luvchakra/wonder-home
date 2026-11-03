# HomeSend "Checking", everywhere it shows (14-062)

**Date:** 2026-11-03 · **Story:** 14-062 (P1) · Part 3 of the owner's HomeSend direct-add series (14-060 #510, 14-061 #511).

## What this PR does

- **Inbox states.** Under Recently handled, a Checking entry reads "Added · checking 1 question" (or N questions) while HomeTalk still has questions about it (`homesend/checking.ts` `questionsLeft`). Once none waits it reads "Checking" (it waits on "Looks right" or Undo). Confirmed entries read "Added". Words are in eight languages (`homesend.history.checkingOne/Many`).
- **On each record's own screen (rule 12).** The bill (Bills rows), the school item (every Kids & School list), the health record (Health records rows) and the grocery (its detail page) show a "Checking" badge while HomeSend's entry for it is unconfirmed (`unconfirmedEntityIds`, one bounded read in each page's existing `Promise.all`, on the partial index from 14-060). Each screen keeps its own edit and remove, and "Looks right" and Undo stay in HomeSend.
- **One grouped "questions waiting" reminder** (`notifications/notices.ts` `homesendQuestionNotices`, swept with 14-059's grouped HomeSend notice):
  - one notice per sender, "3 HomeSend questions waiting", saying "Answer in HomeTalk or on WhatsApp";
  - it names only a count, never what an entry says;
  - it goes only to the reachable sender the questions are for;
  - it is rewritten as questions are answered, and resolves by itself when none is left or the entry is undone (thread `homesend:questions`);
  - `reminder.homesend.questions.*` words are in eight languages, with plurals.
  - It goes out through the normal delivery pipeline (`deliverNotification`), so a sender with WhatsApp linked can be reached about an app or email item too.
- **Held reminders released on confirm.** "Looks right" and an answer that raises an entry over the bar now run the reminder pass right after the response (`after(() => reconcileRemindersNow(…, { force: true }))`), so the entry's own reminders start at once instead of at the next clock pass.
- **Words.**
  - CLAUDE.md: the HomeSend invariant and the WhatsApp exception (decision C), citing owner, 2026-11-03.
  - `docs/agent-platform.md` and `docs/external-providers.md`.
  - The Settings bar description, in eight languages.
  - The help guide: a new HomeSend paragraph (body.10) and a new FAQ "What are the questions HomeTalk asks…", in eight languages, plus new keywords. The section is dated 2026-11-03.
- **e2e:** `e2e/help.spec.ts` checks the guide paragraph, the FAQ and that a question about the checks lands on HomeSend.

## Verified

- Unit tests pass for homesend, notifications, help, i18n, hometalk and web `_lib` (1,164), plus cache-headers and client-writes. New: two `notices.test.ts` cases (one grouped notice counting questions and naming nothing; silent once answered, finished, undone or unreachable).
- `npx playwright test e2e/help.spec.ts -g "HomeSend checks"` passes at both mobile and desktop.
- Typecheck, ESLint on the changed files, `lint:help-links`, `npm run build -w apps/web`, `check:bundle` and `tracker --check` pass.
- No migration: the question state is the jsonb from 14-061, and the badge reads 14-060's columns.
- No QA account or data was created. This container has no `apps/web/.env.local`, so the signed-in 360 px check of the badges is still owed; see "Needed from a person".

## Needed from a person

- A signed-in look at 360 px: HomeSend → Recently handled shows "Added · checking 1 question" after a photo is sent, and the bill or school row shows "Checking".

## Where the code lives

`homesend/checking.ts` (`questionsLeft`), `notifications/notices.ts`, `notifications/notices-sweep.ts`, `_components/home-send-inbox.tsx`, `bills/page.tsx`, `school/page.tsx`, `health/page.tsx`, `groceries/[itemId]/page.tsx`, `(auth)/home-send-actions.ts`, `_lib/hometalk-turn.ts`.
