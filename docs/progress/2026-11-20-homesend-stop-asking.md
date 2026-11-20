# HomeSend stops asking (story 14-072, part 3 of "HomeSend on Its Own")

The owner, 2026-11-20: "Okay, review the design of HomeSend once more. I want homesend to be as automanomous as possible. with minimum inputs required from the users. properly define why any input needs to be manual and what are the alternatives." After the review was published: "implement all the suggested features". The evidence: since 14 Nov the live project asked 9 "Needs you" questions; none was answered by a person (8 defaulted, 1 still open). Parts 1 (resolver, pre-trust) and 2 (payment proof, confirm by action, immediate bill update) and the health-records setting are built in their own PRs.

## What changed

1. **"Looks right?" is gone by default.** `hometalk/needs-you-run.ts` no longer asks `homesend_check` for every Checking entry. Admin switch Settings → AI Assistant → "Ask me to confirm entries still Checking" (off; `household/nothing-waits-repository.ts`) brings it back. Open `homesend_check` rows are withdrawn while it is off.
2. **Evidence questions: none by default.** `homesend/checking.ts` `planCheckQuestions` plans only a money amount read with doubt (`amountInDoubt`: a bill or receipt from a photo or file, or an amount not in the words sent). It is asked of the sender in Needs you (`homesend_amount`, "I wasn't sure of the amount: “Electricity · ₹2,140”. Is it right?", Looks right / Leave it Checking, default keep Checking). HomeTalk/WhatsApp chains about anything else are closed (`done: "please_check"`). Plain corrections still work.
3. **Waiting items end without a question** (`homesend/deadlines.ts`): note at once; unreadable after the second read set aside unless the sender is in HomeTalk right now (part 2's "send it again" rule, kept); the same bill again set aside `already_recorded`; a bill/receipt/health document record first couldn't add is added at once as Checking (`add-default.ts` `byRule`), with "Add this bill?" only under "Wait for review". `homesend_waiting` is retired; its open rows are withdrawn.
4. **The daily summary is the main report** (`notifications/notices.ts` `homesendSummaryNotices`): "Added N things today · M are Checking, K set aside. Each one opens in HomeSend, with Undo." From 19:00 household time (`SUMMARY_HOUR`; `notices-sweep.ts` `summaryDue` sweeps a household as its evening begins), silent on a day with nothing, to adults who sent something and every Admin, counts only. In the app: HomeSend's "Today" card (`homesend/daily-summary.ts`).
5. **"Needs you" kinds**: trust a sender; health document for someone else (health session); nightly conflict; doubtful amount; "Add this bill?" under "Wait for review"; matched bill (`hometalk/needs-you.ts` `ASKING_SOURCES`).
6. **Platform admin Overview**: questions per 10 sends, share answered by a person, confirmed without a tap by basis, undone or corrected within 7 days (`homesend/metrics.ts`, migration `20261120170000_homesend_question_measures.sql`).
7. **Docs and help**: design doc §"2026-11-20", `docs/agent-platform.md`, `CLAUDE.md`; help body.9/10/15/16 and two FAQs in eight languages; new words (settings switch, Needs-you prompt, summary, Today card) in eight languages.

## Verified

- Unit tests (touched areas only): `homesend/deadlines` 19, `homesend/checking` + `hometalk/checking-questions` 37, `hometalk/needs-you-run` 12, `homesend/nothing-waits-metrics` 3, `homesend/daily-summary` 1, `notifications/*` 402, `help` + `i18n` 106 — all pass.
- `npm run eval` (deterministic): functional 333/333, Unsafe Action Rate 0, privacy 57/57, understanding 98/98. New NY-09–13; NY-01–07, HS-57/60/92/93 updated to the owner's new decision (a changed product rule, not a lowered bar).
- Typecheck (all workspaces), ESLint on changed files, migration lint, help-links: pass.
- Browser, live project, a QA household: a bill recorded as Checking from a "photo" reading got exactly one `homesend_amount` question, shown on `/ai` with "Looks right" and "Leave it Checking"; tapping "Leave it Checking" answered it and the bill stayed Checking. HomeSend's Today card read "Added 1 thing today. 1 is Checking … 1 was set aside." Settings showed the new switch off. No horizontal overflow at 360 px or 1280 px.
- Cleanup: the QA household and its rows deleted (counts 0 on households, members, items, changes, Needs you, obligations), the QA user deleted, dev server stopped, scratch files removed.

## Open / needs a person

- Migration `20261120170000_homesend_question_measures.sql` must be applied to the live project (the Supabase MCP refuses these sessions; the SQL went to the coordinator). Safe in either order: until it runs, the four new measures read "not measured" and are hidden.
- Story id 14-072 was picked for this part; if a parallel part took it, renumber at merge.
