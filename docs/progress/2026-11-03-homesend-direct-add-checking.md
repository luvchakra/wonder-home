# HomeSend adds directly; below the bar it is "Checking" (14-060)

**Date:** 2026-11-03 · **Story:** 14-060 (P0) · **Decision note** for the owner's change to how HomeSend works.

## The decision (owner, 2026-11-03)

> "add the entry directly in WonderHome without asking for a review. If the confidence is less than the threshold set in settings then send a message in HomeTalk and WhatsApp to clarify the confusion; when the user answers, update the entry automatically till you reach the threshold defined."

- **A.** Below the bar (Settings → "How sure HomeSend must be to add on its own"): the entry is added now, marked unconfirmed ("Checking" in words, rule 3); reminders derived from it wait until it reaches the bar; answers update it in place; over the bar the badge goes. Above the bar: added directly, no review.
- **B.** Text from every channel and photos and files are added under this flow. Bills, receipts and health documents keep following "Add money / health entries directly": off, they still wait. Paying never happens; ordering is never by voice.
- **C.** WhatsApp clarifying questions may include details (amount, date, health detail) for HomeSend clarifications only, only to the item's sender on their verified, linked identity. WhatsApp stays an input channel, never an authorization channel.

The work is split into three PRs, each mergeable on its own:

| Story | What | State |
|---|---|---|
| 14-060 | Data model, direct add, the unconfirmed state, "Looks right", reminders held | This PR |
| 14-061 | Clarifying questions from evidence that raise a Checking entry over the bar, one question shared by HomeTalk and WhatsApp (decision C) | Next |
| 14-062 | Checking on each record's own screen, one "questions waiting" reminder, eval cases for the loop | After 14-061 |

## What this PR does

- **Decision** (`homesend/confirmation.ts`). Where the outcome is Pre Approved, a complete reading becomes `auto_apply`. Above the household's bar it is confirmed. At or below the bar, or read from a photo or file, it carries `unconfirmed: true`. Everything that waited for a reason other than the bar still waits: a missing required detail, who it is for, a likely duplicate, several things, instructions aimed at WonderHome, an email nobody in the household sent in, Wait for Approval, and money or health with the Admin's switch off.
- **Write path** (`apps/web/app/(auth)/home-send-auto.ts`). It is the same governed write a person's confirm uses (`autoApplyHomeSendItem` → `createNew` / `recordReceipt`), with the same Undo. Each change row now records `auto: { state, confidence, source }`, audited as `homesend.auto_added` (with confirmation state, score and source). A person's own confirm and bulk "Add selected" stay `homesend.applied` and confirmed.
- **Data model** (`supabase/migrations/20261103150000_homesend_unconfirmed_entries.sql`). `homesend_changes` gains `confirmation_state` (`unconfirmed` | `confirmed`, default `confirmed`), `confidence` (0..1), `confirmed_at` and `confirmed_by_member_id`, with a partial index on live unconfirmed rows and an index on the new foreign key. The state sits on HomeSend's own link row (item ↔ record), not on each domain table. X-003 keeps HomeSend writing only its own tables, and no domain table changes shape. A trigger keeps confirming one-way and in the caller's own name, and stops a member editing the score by hand. Undoing an entry someone else confirmed still works.
- **Safe in either order.** An insert that names the new columns retries without them when the database doesn't have them yet. Readers (`withConfirmation`, `unconfirmedEntityIds`) fall back to "confirmed / nothing held".
- **Confirming** (`homesend/changes.ts` `confirmHomeSendEntry`). This moves every live unconfirmed write of an item (a receipt's lines together) to confirmed. It runs through the member's own client, so RLS decides, and is audited `homesend.confirmed` with how: `person`, or `answers` with the new score (used by 14-061).
- **Reminders held** (`notifications/reconcile.ts`). A bill or school item still being checked gets no reminder of its own. Once confirmed, or if its change is undone, the next pass reminds as usual.
- **Inbox** (`_components/home-send-inbox.tsx`). Under Recently handled, a Checking entry shows a "Checking" badge (attention tone, in words) and a "Looks right" button beside Undo (`confirmHomeSendEntryAction`).
- **Replies.** HomeTalk (`handedBackText`), WhatsApp (`addedReply`, new `whatsapp.added*Checking` keys in eight languages) and the HomeSend notice say "marked Checking until it's confirmed, so its reminders wait". This PR doesn't change what WhatsApp may echo: decision C arrives with the clarifying questions in 14-061.
- **Words.** The Settings bar description and the help guide's HomeSend section (summary, paragraphs 1, 3 and 4) are updated in all eight languages, with new keywords and the 2026-11-03 date. `CLAUDE.md`'s HomeSend invariant and `docs/agent-platform.md` are updated too.

## Expectations changed by the decision (not to get green)

These tests and eval cases encoded the old rule ("below the bar or from a file → waits"). They now expect the owner's rule:

- `confirmation.test.ts`, `hometalk-homesend-acceptance.test.ts`: AT-A07/11–17/31/33/34/36/37, AT-B05, AT-L04/L08, AT-M02 and AT-N105/107/108/110/x17 now expect "checking". A new `outcomeOf` helper tells a Checking add from a confirmed one.
- `auto-add-repository.test.ts` AT-K02/04/05, `whatsapp-intake.test.ts` AT-H03/H10, `file-with-homesend.test.ts` AT-J02 and `waiting.test.ts`.
- Golden eval HS-24 (an invented reading), HS-25 (a photo), HS-26 (a 93% voice note) and HS-37 (a health report file with the health switch on) now expect `add_checking`. The runner reports an unconfirmed add as its own observed action, so it is never mistaken for a sure one.

## Verified

- Unit: `packages/core/src` (5,510 tests, all pass after the updates). New: `homesend/unconfirmed.test.ts` (state written, pre-migration fallback, held list, confirm once / in own name / never another household) and `notifications/unconfirmed-hold.test.ts`.
- Web: `cache-headers`, `client-writes`, `middleware-matcher`, `_lib` tests pass.
- DB: `scripts/test-homesend-rls.mjs` passes 68/68 on a fresh local database built from all 210 migrations. The new tests cover the default for existing rows, outsider sees nothing, never confirmed in another's name, the score never edited by hand, one-way, undo after another member confirmed, and the value checks.
- Deterministic evaluation passes 211/211. Unsafe Action Rate is 0/25, and every gate that can pass here passes (operations is "not yet", as before). Targeted `--cases HS-24,HS-25,HS-26,HS-37` passes 4/4. No live provider run yet: this PR changes the decision after the reading, not the reading. The one configured run is planned last, with 14-062's loop cases.
- Typecheck, web ESLint, the repo lints (migrations, embeds, knowledge, boundaries, service role, secrets, help links, tracker), `npm run build -w apps/web` and `check:bundle` all pass.
- Not run here: the signed-in 360 px check with a QA household, because this container has no `apps/web/.env.local` (no service-role key for `qa-test-user.mjs`). No QA data was created, so there is nothing to clean up. `npm run brand -- --check` and one `test:scripts` case (e2e cleanup env check) fail identically on `main` in this container. They are unrelated.

## Open, or needs a person

- **The migration goes live after the deploy is READY.** If `apply_migration` is refused, the owner runs it by hand (SQL in the PR).
- **Wait for Approval still waits.** The household's own autonomy setting is kept: "added directly" applies where the responsibility is Pre Approved. If the owner wants HomeSend to add even under Wait for Approval, that is a one-line change, but it removes an Admin control.
- **An email nobody in the household forwarded** (not member-initiated) still waits. There is no sender to ask, and no member the write would be attributed to. 14-061 can route its question to the forwarding address's owner if the owner wants that.
- **HS-24 (a reading naming something never said)** is now added as Checking, not held. Until 14-061 asks about it, it waits on "Looks right" or Undo.
- Also fixed: leftover merge-conflict markers in `docs/progress/README.md` on `main`. All entries are kept.
