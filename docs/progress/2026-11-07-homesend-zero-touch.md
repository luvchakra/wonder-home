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
- **Open / needs a person:** the live migration (`20261107233000_homesend_learned_defaults`): the Supabase approval timed out twice in this session, so the owner was given the SQL. Until it runs, nothing is learned and HomeSend asks as before. The browser check of the Settings card at 360 px follows once the table is live. Parts 2 and 3 are below in Delivery.
- **Cleanup:** no QA accounts, households or Storage files were created for part 1.
- **Code:** `packages/core/src/homesend/learned.ts`, `learned-repository.ts`, `apps/web/app/(auth)/home-send-review.ts`, `home-send-actions.ts`, `consent-actions.ts`, `apps/web/app/_components/homesend-learned.tsx`, `apps/web/app/settings/ai/page.tsx`, `packages/core/src/hometalk/intake-questions.ts`, `supabase/migrations/20261107233000_homesend_learned_defaults.sql`.
