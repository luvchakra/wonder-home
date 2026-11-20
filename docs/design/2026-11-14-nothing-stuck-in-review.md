# Nothing stuck in review

The owner, 2026-11-14: "think of redesign of HomeBrain, HomeSend and HomeTalk as a cohesive unit so that minimum intervention is required to input information in the app, ensure its not stuck in review. and minimum info is pending for review". The coordinator session wrote the redesign and published it as a page; the owner's reply was "implement". This file is that page, kept in the repository, plus what part A built.

Whatever a family sends, says or forwards, WonderHome records it straight away. A person hears only about the few things that truly need them, and never waits on WonderHome to finish.

## Where we were (14 Nov, live project, test households left out)

| | |
|---|---|
| Sent to HomeSend by the 3 households using it | 92 |
| Needed a person to add or dismiss them in review | 37 |
| Still waiting, 9 of them for more than a week | 16 |
| Added as Checking 7 to 30 days ago and never confirmed | 10 |

The 16 waiting were 11 pasted texts HomeSend couldn't read, 4 it couldn't tell what they were, and 1 bill held because money entries need an Admin switch. The 10 Checking entries were 4 bills, 4 grocery items and 2 purchases, and their reminders were held. On HomeTalk, 48 of 54 actions ran straight away; 3 proposals (2 calendar events, 1 setting) were never answered.

## Four reasons things get stuck

1. **Things that aren't household information enter the review list.** Pasted web pages and unreadable text are a quarter of everything sent. They wait until someone dismisses them or the 30-day tidy sets them aside.
2. **Checking became a second review list.** An entry added below the confidence bar, or from a photo, stays unconfirmed until someone confirms it. Its reminders are held meanwhile, so a Checking bill never reminds anyone.
3. **Rules hold items with no way out.** Money and health switches, outside senders, "Wait for Approval" areas and unknown kinds keep an item waiting, with no deadline and no default.
4. **The app asks what it could work out.** Which child, which area, which vendor: the household's own records usually answer these.

## One stream for every door

Doors: paste, share sheet, WhatsApp, forwarded email, photo or file, HomeTalk typed or spoken.

1. **Understand.** HomeSend reads it: one reading for every door, with one confidence score.
2. **Resolve.** HomeBrain fills the gaps (who, which child, which area, which vendor) from the household's memory and past answers.
3. **Record.** It becomes something: an entry, an update, a household note, or set aside with a plain reason. Always with Undo.
4. **Verify.** Overnight, HomeBrain confirms what evidence supports and raises only real conflicts.
5. **Learn.** Every answer and correction becomes a rule for that household; never asked twice.

## Six rules the three parts share

- **Record now, act with permission.** Writing down a date, a bill or a grocery need is reversible, so it never waits. Paying, ordering, messaging someone outside the household, booking and deleting still need a person.
- **Nothing waits without a deadline.** Every question carries a default it applies by itself after 24 hours. Nothing stays in "Needs you" for more than 48 hours.
- **Know before asking.** HomeBrain answers from the household's people, schools, vendors, places and past answers before anyone is asked.
- **Verify after, not before.** Evidence confirms entries; only a duplicate, a clash or an unusual amount reaches a person.
- **One list, one way to correct.** Everything that needs a person sits in one "Needs you" list, answered with one tap or one sentence in HomeTalk or WhatsApp.
- **Everything sent becomes something.** "Couldn't tell what it is" and "couldn't read it" stop being places to wait.

## What happens to each thing you send

| When it is | Before | After |
|---|---|---|
| A clear reading in a Pre Approved area | Added. Below the 95% bar it is Checking, its reminders held. | Added. Below the bar it is Checking with its reminders on, marked "not yet confirmed" (decision 3). |
| A photo or a file | Checking, with one "Looks right?" question. | Checking with reminders on; a question only for a missing or clashing detail. |
| A bill or a receipt | Waits, unless an Admin turned on "Add money entries directly". | Recorded as Checking, with a "check before paying" reminder. Paying never happens (decision 2). |
| A health document | Waits, unless the same switch is on. | Filed as Checking in that person's health record, seen only by them, their guardians and Admins (decision 2). |
| An area set to "Wait for Approval" | Waits for approval before anything is recorded. | Recorded. Approval applies when an action follows (decision 1). |
| HomeSend couldn't tell what it is | Waits, with nowhere to go. | Kept as a household note anyone can find by asking HomeTalk, or set aside if it isn't household information. |
| Unreadable text or a pasted web page | Waits as "Couldn't be read" until someone acts or 30 days pass. | Read again another way. A page that isn't household information is set aside at once with the reason. Otherwise one ask to resend, set aside after 24 hours. |
| An email from an unknown sender | Waits. | One "Trust this sender?" question; no answer in 3 days sets it aside (decision 5). |
| A missing detail | Up to 3 questions; the entry waits. | HomeBrain fills it from memory; if it can't, one question with tap answers and a default after 24 hours (decision 4). |
| "Add milk" or "dentist Tuesday 4 pm" in HomeTalk | Lists added; calendar events wait for a Yes. | Recorded straight away with Undo. A Yes is asked only for actions. |
| An answer or a correction | "Which child" remembered per sender. | Every answer and correction becomes a rule. |

## The five decisions (all going ahead; each can be switched back)

1. **Record first.** "Wait for Approval" applies to actions (paying, ordering, messaging, booking), not to writing information down. *(Part B.)*
2. **Money and health are recorded as Checking.** Replaces the 2026-11-03 rule that they wait unless an Admin switch is on. Paying never happens. *(Part B.)*
3. **Checking keeps its reminders.** A Checking entry reminds as usual, marked "not yet confirmed", instead of holding its reminders until someone confirms it. *(Part A.)* Admin switch: Settings → AI Assistant → "Remind about entries still Checking".
4. **Every question has a deadline.** A question applies its stated default after 24 hours. Nothing waits more than 48 hours. *(Part A.)* Admin switch: Settings → AI Assistant → "Apply a question's default after a day".
5. **Outside senders are trusted once.** *(Part B.)*

## What stays exactly as it is

- Paying and ordering never happen on their own, and never by voice.
- WhatsApp is input only, never an approval.
- Everything sent is treated as untrusted; instructions inside it are ignored (`homesend/injection.ts`).
- Children's privacy and who can see health information do not change.
- Every automatic entry says where it came from, can be undone, and is in the audit log.
- The Unsafe Action Rate stays at zero, as a release gate.

## How we'll know it works

| Measure | Before | Target |
|---|---|---|
| Things sent that needed a person | 37 of 92 | Fewer than 1 in 10 |
| Items waiting in a household | Up to 15 in one household | At most 3 open, none older than 48 hours |
| Checking entries older than 7 days | 10 | None without a stated reason |
| Entries undone or corrected within 7 days | 2 undone of 42 added | Under 1 in 20 |
| Unsafe actions | 0 | 0 |

These are on the Platform admin Overview ("Nothing waits", `public.platform_nothing_waits`, `homesend/metrics.ts` `parseNothingWaits`).

## Build plan

Three sessions build side by side and merge one after another.

- **Part A — Nothing waits** (this file's implementation notes below; decisions 3 and 4).
- **Part B — Record first**: HomeTalk records straight away with Undo; approval for actions only; money and health as Checking; trusted senders; plain corrections (decisions 1, 2, 5).
- **Part C — HomeBrain knows**: memory resolves gaps before any question; every answer and correction becomes a rule; the nightly check confirms or flags; each kind's bar follows the household's own accuracy.

## Part A, as built

**Every item ends as something** (`packages/core/src/homesend/deadlines.ts`, pure; run by `hometalk/needs-you-run.ts`):

1. Not household information (two or more web, ad or newsletter signs; or four links and one sign) that HomeSend couldn't read or place: archived at once, reason `not_household`. A reading that found something is never set aside by its footer.
2. Couldn't be read: read once more another way (a failed item through the read-again queue, a failed reading through the classify retry); an hour later, if still unreadable, its sender is asked once to send it again (`homesend_resend`, default "set aside" → `not_resent`); with nobody to ask (an email), set aside.
3. Read, but HomeSend couldn't tell what it is: kept as a **household note**.
4. Anything else waiting: one question (`homesend_waiting`), default "keep as a note" (a possible duplicate: "keep what's on record"). A bill, receipt or health document waiting on the Admin's switch is left to part B, which records it as Checking; a default never turns money or health into a note.

**Where household notes live.** A note is the HomeSend item itself, archived with reason `kept_as_note`: its words stay on HomeSend's own table where they arrived (X-003), with their source, audit trail and Restore. They are not copied into HomeBrain's `memories`, where untrusted content would read as a belief with a confidence. HomeTalk finds them because its context reads HomeSend items (`context/repository.ts` adds `listHouseholdNotes`, the 30 newest, however old; `context/builders.ts` says "A household note, sent to HomeSend on …" with its summary).

**Every question has a default and a deadline** (decision 4). One table, `needs_you_items` (migration `20261114231500_needs_you.sql`): the question as a closed code, its tap answers, `default_answer`, `default_at` (24 hours after the thing was sent) and `expires_at` (48 hours). The background step `clock.homesend-deadlines` (GitHub clock every ten minutes; the Vercel delivery tick takes it back when the heartbeat goes stale) applies due defaults through the same switch a person's tap uses (`hometalk/needs-you-answer.ts`), audited `needs_you.defaulted`, and closes anything still open at 48 hours. It also closes HomeTalk proposals still waiting after 48 hours as not done (never approved). A default never pays, orders or approves, never undoes, and never confirms money or health.

**Checking keeps its reminders** (decision 3). `notifications/reconcile.ts` reminds about a Checking entry as usual through `notYetConfirmed` (`notifications/sources.ts`): "… Not yet confirmed." and, for a bill, "… Not yet confirmed — check before paying." (`reminder.checking.*`, eight languages). Each Checking entry gets one "Looks right?" (`homesend_check`): default "keep as read" (confirmed, `how: "default"`), but a bill, receipt, purchase or health record stays Checking with the question closed (`keep_checking`, audited `homesend.kept_checking`). A person acting on the entry (Mark paid, editing a bill, school item, event or health record) confirms it (`homesend/changes.ts` `confirmByAction`, `how: "acted"`).

**One "Needs you" list** (`hometalk/needs-you.ts`, `needs-you-repository.ts`). HomeSend's questions, HomeTalk proposals still waiting for a yes, and pending approvals, from one read (`loadNeedsYou`), ranked by consequence (money due within a week, then school deadlines, then dated things) then age; three shown at once. Each row has its tap answers and says its default and when it applies. It shows at the top of HomeTalk (`/ai`) and on Home (`_components/needs-you.tsx`); answers go through `(auth)/needs-you-actions.ts` in the member's own name, audited `needs_you.answered`. The daily summary and the "need a word" notice open `/ai#needs-you`.

**For parts B and C.** Add a question with `askNeedsYou(client, { householdId, source: "sender_trust" | "conflict" | …, subjectTable, subjectId, recipientMemberId, prompt: { code, title }, answers, defaultAnswer, consequence, dueOn, askedAt })`, and register what an answer or the default does with `registerNeedsYouHandler(source, handler)` (or add a case to `applyNeedsYouAnswer`). Words: `needsYou.prompt.<code>`, `needsYou.answer.<value>`, `needsYou.default.<answer>` in the HomeSend area catalogs, eight languages. A source with no handler is closed `expired` at 48 hours, never left open.

**The HomeSend page** is the send box, "Added recently" with Undo, and "Set aside" (the ten newest with their reasons and Restore; the rest behind "See everything set aside"). The review sections are gone.

**One daily summary** replaces the grouped "waiting" and "questions" notices (`notifications/notices.ts` `homesendSummaryNotices`, thread `homesend:summary:<day>`): "WonderHome added N things today · M need a word — they're at the top of HomeTalk." Before the migration the older notices still speak.

## 2026-11-20: "Looks right?" is gone by default

The owner, 2026-11-20: "Okay, review the design of HomeSend once more. I want homesend to be as automanomous as possible. with minimum inputs required from the users. properly define why any input needs to be manual and what are the alternatives." The review ("HomeSend on Its Own") found that of the 9 "Needs you" questions asked on the live project since 14 Nov, none was answered by a person: 8 defaulted and 1 was still open. A question nobody answers is a delay, not a safeguard. The owner's reply to the review: "implement all the suggested features". Part 3 of that build ("stop asking") changed this design as follows; parts 1 (memory resolver, pre-trusted senders) and 2 (payment proof, confirmation by action, immediate bill update) have their own notes.

**When a manual step is justified.** Money leaves the house (paying, ordering, booking, messaging outside); a stranger gets access (trusting a new email sender); someone else's health record. Anything else is recorded with what is known, marked Checking, with Undo, and confirmed by evidence or by a person acting on it.

**What changed.**

- **"Looks right?" is not asked** (the review's decision 1). `hometalk/needs-you-run.ts` no longer creates a `homesend_check` row for every Checking entry. Questions about an entry come from the nightly check (`homebrain_conflict`: a clash, a duplicate, an unusual amount) or from a doubtful money amount. Settings → AI Assistant → "Ask me to confirm entries still Checking" (off by default; policy `ai_autonomy` of that name, `household/nothing-waits-repository.ts`) restores the 2026-11-14 behaviour. While it is off, open `homesend_check` rows are withdrawn.
- **Evidence questions: three become none.** `homesend/checking.ts` `planCheckQuestions` plans nothing by default; fields it can't read stay blank and labelled. One question is kept: a bill's or receipt's amount read with doubt (from a photo or a file, or not found in the words sent; `amountInDoubt`). It is asked of the sender only and shown in Needs you (`homesend_amount`: "I wasn't sure of the amount: “Electricity · ₹2,140”. Is it right?", Looks right / Leave it Checking), with the 24-hour default of keeping it Checking. HomeTalk and WhatsApp chains about anything else are closed (`understanding.checking.done = "please_check"`). Plain corrections ("No, it's on the 12th", `correct_entry`) still fix the entry in place.
- **Waiting items end without a question.** A waiting item's question (`homesend_waiting`) and "send it again?" (`homesend_resend`) are no longer asked; their open rows are withdrawn. Read but incomplete: kept as a household note at once. Unreadable after the second read: set aside (`unreadable`). The same bill or health document again: set aside `already_recorded`. A bill, receipt or health document record first couldn't add (an amount or date missing, several records) is added at once as Checking (`add-default.ts`, `byRule`, source `record_first`); "Add this bill?" is asked only under the Admin's "Wait for review".
- **"Needs you" kinds** (`hometalk/needs-you.ts` `ASKING_SOURCES`): trust a sender; a health document for someone else (the health-records session owns that rule); an unusual amount or conflict (`homebrain_conflict`); a doubtful money amount (`homesend_amount`); "Add this bill?" under "Wait for review" (`homesend_add`); an ambiguous bill match (`homesend_update`).
- **The daily summary is the main report.** `notifications/notices.ts` `homesendSummaryNotices`: "Added 6 things today · 2 are Checking, 1 set aside. Each one opens in HomeSend, with Undo." Once a day from 19:00 on the household's clock (`SUMMARY_HOUR`; the five-minute notice tick sweeps a household as its evening begins, `notices-sweep.ts` `summaryDue`), silent on a day with nothing, to each adult who sent something (their own) and every Admin (the household's). The notice carries counts only, so nothing an entry says reaches a lock screen; the lines are in the app: HomeSend's "Today" card (`homesend/daily-summary.ts` `todayCounts`) above "Added recently" (each with Undo) and "Set aside" (each with Restore). During the day an open Needs-you question still speaks in the same thread.
- **Measures** (Platform admin Overview, migration `20261120170000_homesend_question_measures.sql`, safe in either order): questions asked per 10 sends (target under 0.5); the share a person answered (at least half, or the question goes); entries confirmed without a tap, by basis; entries undone or corrected within 7 days (under 1 in 20).

Eval: NY-01–04 now run with the Admin's switch on; NY-05–07, HS-57, HS-60, HS-92 and HS-93 follow the new endings; NY-09–13 are new (a doubtful amount asked; a school notice and a health document not asked; a bill added at once; "Add this bill?" only under "Wait for review").
