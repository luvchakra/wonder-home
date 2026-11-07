# HomeSend: zero touch (design note, 14-066)

**Date:** 2026-11-07 · **Owner request:** "design and implement HomeSend in a more user friendly and intuitive way; least input from user should be expected." Earlier this week: "make it crisp", "add directly without asking for a review", "clear everything in one go".
Written before code. Measure: **taps per item from "sent" to "in the right place"** (the OS share sheet's own two taps are the sending, not counted).

## Principles
1. **Sending is the only work.** Whatever arrives is read and put in place; the person hears "Got it — added as X" with Undo, never a form.
2. **Infer before asking.** Who it's for, which category, which day and whether it's already on record are worked out from the content, the household's records and what the household has told HomeSend before.
3. **Never ask the same thing twice.** An answer or a correction becomes a learned default (sender → child, school → child, shop → category), with provenance, visible and clearable by an Admin.
4. **When a question is unavoidable: one, one tap.** Chips with the household's names or days, in HomeTalk and on WhatsApp; several waiting become "3 quick ones"; at most one WhatsApp message an hour per person unless they open the app.
5. **The page is a record, not a queue.** It says everything is in place, or how many quick questions are left.
6. **Safety does not bend.** Learned defaults only fill who/category gaps the household's own records allow; they never widen permissions, cross a household, approve money or pay. Wait for Approval, outside-sender email, untraced readings and the money/health switch behave exactly as before.

## The item journey
Arrives (share sheet · WhatsApp forward · email forward · paste or drop · HomeTalk "send this") → `ingest*` reads it (OCR on arrival, injection screened) → resolve people (content name → matched record → **learned default** → **child's school named in the content** → the only child) → reconcile (duplicate / moved date) → completeness → decision: added (confirmed or Checking) · one question · waits (by rule) · couldn't be read → one grouped notice if anything is left → the daily tidy.

## Where input stays unavoidable, and why
- **Two children, a sender never seen before, no name or school in it**: one chip tap. Guessing a child is the "wrong child" risk; after the first answer the sender is learned.
- **Wait for Approval outcomes, bills/health with the switch off, email from outside the household**: owner decisions, one tap ("Add").
- **A reading naming something not in what was sent**: never added (`verify.ts` untraced); one tap to look.
- **Couldn't be read**: one action (Try again / Tell me what it is).

## Tap budget (before → after)
| Path | Before | After |
|---|---|---|
| Complete item, Pre Approved (any channel) | 0 (no confirmation shown on share) | 0, with "Got it" + Undo |
| School notice, 2+ children, known sender/school | 2 (Answer → chip) or 3 (Check → pick → Add) | **0** |
| School notice, 2+ children, first time | 2–3 | 1 chip |
| Desktop paste | 3 (Send something → Paste → Read this) | **0** (Ctrl+V on the page) |
| Moved date matching one record strongly | 2 (open → Update) | 0 (updated, Undo) — PR 2 |
| Photo/file added as Checking | up to 3 answers | 1 ("Looks right") — PR 3 |
| Wait for Approval / money with switch off | 1–2 | 1 |

## Delivery (each PR mergeable alone)
1. **Learned defaults + school match** (this PR): `homesend_learned_defaults`, applied in `prepareReview`, learned on answers and picks, Settings → AI Assistant → "What HomeSend has learned" (Admin view/clear), eval cases, help.
2. **One-tap sending + record page**: share lands with a "Got it" toast and Undo; paste anywhere on the page; email "Add to contacts" vCard; first-time three-line explainer; strong-match moved dates update in place.
3. **Questions**: one confirm for photo/file Checking, batching, one WhatsApp question an hour per person.

## Part 1 shipped: learned defaults (this PR)
- **What:** `homesend/learned.ts` `inferSubject` runs in `prepareReview` (so in direct add, the page, bulk and HomeTalk alike) and in the eval runner. It fills "Who is this for?" for a school or class notice from, in order: the school the notice names (`schoolNames` on each child's context item, from enrolments), what the household told HomeSend about that outside sender (`homesend_learned_defaults`), or the one child at school. A name the notice uses always wins; a sender whose notices went to two children becomes `mixed` and is asked again; health documents are never inferred. Learned on a HomeTalk/WhatsApp answer (`answerIntakeQuestion`) and a review-form pick (`home-send-actions.ts`), as the member, RLS-checked to the same household. Settings → AI Assistant → "What HomeSend has learned": every member sees it; an Admin forgets one or all (audited `homesend.learned_forgotten`).
- **Taps:** a school notice for one of several children, from a known sender or naming a child's school: 2–3 → 0. First time from a new sender: 1 chip, then 0.
- **Verified:** typecheck; ESLint on the changed app files; `learned.test.ts`; homesend/hometalk/conversation/evaluation suites (1,756 tests); eval HS-48–52 plus HS-02/04/11 (still "ask" where nothing settles it); `test-homesend-rls.mjs` 75/75 (new: same household only, written as yourself, never pointing across households, only known kinds, only an Admin forgets); `test-setup-counts-rls` (set-form policies); `security` 12/12; lint:migrations, service-role, boundaries, embeds, help-links; `tracker --check`.
- **Open / needs a person:** the live migration (`20261107233500_homesend_learned_defaults`; renamed from 20261107233000 after merge, because #531's `child_trivia` already carried that timestamp and the live history keys on the version; `lint:migrations` now refuses two files with one timestamp): the Supabase approval timed out twice in this session, so the owner was given the SQL. Until it runs, nothing is learned and HomeSend asks as before. The browser check of the Settings card at 360 px follows once the table is live. Parts 2 and 3 are below in Delivery.
- **Cleanup:** no QA accounts, households or Storage files were created for part 1.
- **Code:** `packages/core/src/homesend/learned.ts`, `learned-repository.ts`, `apps/web/app/(auth)/home-send-review.ts`, `home-send-actions.ts`, `consent-actions.ts`, `apps/web/app/_components/homesend-learned.tsx`, `apps/web/app/settings/ai/page.tsx`, `packages/core/src/hometalk/intake-questions.ts`, `supabase/migrations/20261107233500_homesend_learned_defaults.sql`.

## Part 2 shipped: one-tap sending (second PR)
- **What:** a share from the phone's share sheet (and one staged before sign-in) is put in place on arrival through `addIfAllowed`, exactly as an upload or WhatsApp forward is. Before, it always waited for a tap. It lands on `/home-send?shared=<id>`; the page reads the item itself and says "Got it — X is added" with Undo, or that it needs a word, couldn't be read, or is being read. On a computer, paste (Ctrl/⌘+V) anywhere on the page sends a copied file, screenshot, text or link with no form (typing into a field keeps its own paste). The email address card has "Add to contacts" (a vCard). While a household has never sent anything, a three-line explainer with "Connect WhatsApp" and "Add to share sheet" replaces the empty state, so it is shown once with nothing stored. Help paragraph 14 in eight languages.
- **Taps:** share sheet, complete Pre Approved item: 1 (open the waiting item, Add) → 0, with "Got it" + Undo. Desktop paste: 3 → 0.
- **Verified:** typecheck; ESLint on the changed files; `home-send-channels.test.tsx` (vCard); help + i18n; production build. In the browser on a QA household on the live project: 360 px first-time screen (explainer, no overflow, old empty card gone); a share-target POST redirected to `?shared=<id>` and the page said "Got it — … needs a word from you" (no model key in the container, so the reading waited rather than being added; the add step is the same one WhatsApp already uses); desktop paste created an item in "Needs a word from you"; the paste hint shows on desktop only.
- **Then part 3** (below).

## Part 3 shipped: fewer questions (third PR)
- **Moved dates in place.** `reconcile.ts` marks an update proposal `clear` only when the name is the same (≥95% alike), it is for the same person (or nobody on both sides), only the day changed, and no second record would also need a decision. `confirmation.ts` then lets it through every rule an add meets (Pre Approved, member-sent, over the bar, words of its own, no instructions) and returns `auto_apply` with `update`; `autoApplyHomeSendItem` moves the record with `reviseExisting` (the same write as a person's "Update") and records an `updated` change with `previous`, so Undo puts the old day back. An amount change, a photo or file, a reading below the bar, or Wait for Approval is still offered as before. Said as "📅 X was already on record, so I moved it to its new day" (no date or number on WhatsApp); the share toast says "Got it — X … moved to its new day. Undo if that's not right." No new review decision: it is recorded as `auto_added`, so no migration.
- **One tap for a photo or file.** `checking.ts` plans `confirm_all` first ("Here's what I read: BESCOM · ₹2,140 · 10 Nov. Looks right?"); a yes confirms it at 100%; a no walks the details (at most two more, three in all); a skip ends in one "please check". `questionsLeft` counts it as one. The inbox's own "Looks right" button was already one tap.
- **Batched.** After an entry is settled, the sender's next waiting question follows in the same reply ("📥 Next, **Water** (2 more after this): …"); WhatsApp leads with "N quick ones about what you sent — first, X:".
- **One WhatsApp question an hour.** `hometalk/question-cadence.ts`: a question started because something was sent is recorded with `cadence: "send"`; another is not started on WhatsApp within the hour — the reply says it will come after the one already asked. The next question after an answer is a reply, not counted. In the app nothing is held.
- **Taps:** moved date, clear match, Pre Approved: 2 → 0 (Undo). Photo/file in Checking: up to 3 answers → 1. Five forwards in a row: up to 5 questions → 1, then one per answer.
- **Verified:** typecheck; ESLint on the changed app files; unit tests for reconcile, confirmation, checking, checking-questions (incl. batching, never another member's entry), question-cadence; homesend/hometalk/whatsapp/conversation/notifications/evaluation/i18n/help suites; deterministic eval 258/258 after rebasing on main, unsafe 0; eval HS-53/54; lint:service-role, boundaries, help-links; check:bundle; production build. Browser (production build, live project, QA household seeded with a moved bill and a photo bill in Checking): at 360 px and 1280 px `/home-send?shared=<id>` says "Got it — Electricity was already on record, so it moved to its new day. Undo if that's not right." with Undo beside it, the Checking photo counts as "1 question waiting in HomeTalk", and nothing overflows. The in-app question itself is opened by a HomeTalk turn or WhatsApp, which the seed skipped; its words are covered by the unit tests.
- **Cleanup:** one QA account and two QA households (one from a failed first seed run) were created and deleted; a service-role count shows 0 households, members, bills, HomeSend items and changes left, and the account is gone. The server was stopped and the scratch scripts were deleted.
- **Open:** an item's first *intake* question held by the hourly limit is not chained on WhatsApp after the next answer; it is asked in HomeTalk and counted in the grouped "waiting" notice (backlog note on 14-066).
