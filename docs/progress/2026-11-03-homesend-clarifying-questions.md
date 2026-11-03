# HomeSend asks to raise a "Checking" entry over the bar (14-061)

**Date:** 2026-11-03 · **Story:** 14-061 (P0) · Part 2 of the owner's HomeSend direct-add series (part 1: 14-060, PR #510).

## Owner decisions applied (2026-11-03)

1. **Wait for Approval keeps waiting.** Only Pre Approved outcomes are added directly. This was already true in `confirmation.ts`; the matrix tests AT-A20/A24 keep it.
2. **An email nobody in the household forwarded keeps waiting.** Already true (`memberInitiated`); `whyItWaits` → "came by email".
3. **A reading that names something not in what was sent adds nothing.** It is no longer added as Checking. It waits in HomeSend for review. This changes part 1's behaviour, and the change is made here.
   - `verify.ts` `checkReading` now keeps `untraced`: what the reading *names* that the words don't contain (a name, amount, payee, shop or date). That is different from details left out, which `completeness.ts` already asks for.
   - `confirmation.ts` returns `prepare` with `wait.reason: "untraced"`. The inbox says "read something that isn't in what was sent" (`homesend.why.untraced`) and WhatsApp says `whatsapp.wait.untraced`, both in eight languages.
   - A photo or a file is not untraced: it has no words to check, so it is still added as Checking (decision B).
   - Readings stored before the field existed are decided as before.
   - Golden HS-24 now expects `prepare`.

## The clarifying loop

- **Questions come from evidence** (`homesend/checking.ts`, pure), one at a time, at most three:
  - Read from a photo or file: each key detail the reading holds is confirmed ("Did I get the amount right: **₹2,140**?").
  - A useful detail the reading lacks (`completeness.ts`) is asked.
  - Otherwise (heard at 93%, or a medium reading) the entry is confirmed by its name.
  - Duplicate candidates (`reconcile.ts`) never reach an add: a match still waits for a person, so none is asked about here.
- **Answers to pick.** "Yes, that's right" / "No, it's different" / "Skip", or the detail's own choices (days, record types, amounts), plus free text.
- **One question, shared by HomeTalk and WhatsApp.** The state lives on the item itself (`home_send_items.understanding.checking`, HomeSend's own table, so X-003 holds). Answering in either channel moves it on. A stale copy in the other channel is told "already answered on WhatsApp ✅", then shown the question that waits now. A stale answer settles nothing twice.
- **Reading an answer.** It goes through the conversation engine: the clarify action is `check_homesend_entry` (`conversation/clarify.ts` `answerCheckDetail`), and a yes/no to an open check answers it, not a proposal (`engine.ts`). The executor then reads the value with HomeTalk's deterministic readers (`hometalk/detail-answers.ts`). No model reads an answer, so there is no model text for `homebrain/validate.ts` to check. Other guards:
  - A new request mid-check is read as that request (HT-174).
  - An unreadable value gets one polite second ask, then is left as it is.
  - A "no" asks for the correct value (HomeTalk's own question for that detail).
- **Applied in place** (`hometalk/checking-questions.ts` `applyInPlace`) through the domain's own update, on the one record this item added, as the member (RLS decides): `updateObligation`, `updateSchoolItem`, `updateRecord`, and `updateConsumable`. A grocery is renamed only when this item created it; one the household already tracked is never renamed by an answer. A detail that can't be changed here is noted on the item, and the reply points to the record's own screen.
- **Confidence recomputed**, in arithmetic someone can explain (principle 9): the reading's score plus each settled answer's share of the gap to 100%. From 90% with three questions, two answers reach 96.7%. As soon as the score is strictly over the household's bar, the entry is confirmed: `confirmHomeSendEntry` with how "answers" and the new score, Checking goes, reminders start. Answering every question reaches 100%. Skips leave it Checking, with one "please check" line (💡 Looks right or Undo in HomeSend), never a fourth question.
- **Untrusted input.** An answer `injection.ts` flags is never applied, and the same question stays open. Only the item's sender is asked and may answer; another member is refused. The item is read inside the caller's household, so another household's item is never found. An answer never pays, orders, approves or changes a permission (HT-175).
- **WhatsApp (decision C).** After a Checking add, the reply carries the first check (`whatsapp/intake.ts` → `openCheckQuestion`), with the reading said back, only to the sender on their verified link (`findActiveIdentity`). It is left open in their WhatsApp conversation, and the reply answers it. In the app, the question follows the "Added" line in HomeTalk (`executor.ts` `firstCheckQuestion`).
- **Registered everywhere a new action must be:** `INTENT_ACTIONS`, `REPLY_CLASSES` (`check_homesend_entry: child, financial, health`), the voice matrix (new `homesend_checking` capability, low risk; `scopes.ts` "none"), `warmth.ts` (🔍), the proposal risk ("draft"), grounding and intent exclusions, `choices.ts`.

## Not in this PR (14-062, next)

- **The inbox states** "Added · checking 1 question" / "Added", Undo/correct on each record's own screen, and one grouped "questions waiting" reminder.
- **Questions for items from the app or email reaching WhatsApp.** An item sent in the app is asked in HomeTalk. One from WhatsApp is asked on WhatsApp. A question for an app item is not pushed to WhatsApp on its own (outside the 24-hour window it would need a template). The grouped reminder in 14-062 goes through `deliverNotification`.
- **Writing it up:** CLAUDE.md bullets, the Settings bar text, the help guide and FAQ in eight languages, and e2e.

## Verified

- Unit: all of `packages/core/src`, 5,538 tests pass. New ones:
  - `homesend/checking.test.ts` (19: plan, arithmetic, please check, splitting answers)
  - `hometalk/checking-questions.test.ts` (7: confirm then correct in place then confirmed; a WhatsApp answer resolves the HomeTalk copy; injection ignored; another household and another member refused; no then skips then please check; unreadable value)
  - `whatsapp-intake.test.ts` AT-H11 (the first check sent on WhatsApp and left open)
  - `confirmation.test.ts`, `verify.test.ts`, `waiting.test.ts` (decision 3)
- Web `_lib`, `cache-headers` and `client-writes` tests pass.
- Evaluation: targeted first (`--cases HS-24,HS-25,HS-26,HS-37` 4/4; `--cases HT-172..175` 4/4). Then the full deterministic run: 215/215, Unsafe Action Rate 0/25, every gate that can pass here passes (operations "not yet", as before). No live provider run: nothing here reaches a model.
- Typecheck, ESLint on the changed files, and `npm run build -w apps/web` pass.
- No migration: the state rides on an existing jsonb column, so nothing is needed on the live database.
- No QA account or data was created, so there is nothing to clean up. As in 14-060, this container has no `apps/web/.env.local`, so the signed-in browser check waits for 14-062's e2e.
