# HomeSend: a calm page, and two one-tap clears (14-064)

**Date:** 2026-11-03 · **Story:** 14-064 · **Owner request:** "this page is so busy, redesign this page entirely, minimize options here … give a button to clear everything in one go, it bypasses all checks." Then: offer both "Archive all" and "Add all anyway", each behind its own confirm.

## Why the owner saw 17 waiting + 4 failed
All of them arrived before direct add (#510) shipped at 13:00 UTC today, so none was eligible to be added directly; the daily tidy (#513) kept them because no rule applied and the AI wasn't sure enough to archive. From now on new items are added directly or as "Checking". The page was still built as a review queue.

## What changed
- **Opening sentence (rule 7)** carries the counts: "14 things need a word from you. 4 couldn't be read." No count badges on the sections.
- **"Send something"** is one compact row (photo · file · paste · link) that opens on tap; a file dropped on it on a computer is still read. The big drop zone and the channel tabs (All / WhatsApp / Uploads) are gone — one list.
- **Sections by what the reader decides (rule 17):** "Needs a word from you" (Checking entries with an open HomeTalk question → **Answer**; waiting items → **Add** when one yes settles it, else **Check**), "Couldn't be read" (→ **Try again** or **Fill in**), "Added recently" (last 7 days, folded, Looks right / Undo), and the Archived link.
- **One plain reason per row**, no "70% sure" (it's in the detail, in words: "HomeSend wasn't sure: 70% sure."). Tick boxes appear only after **Select**.
- **Identical items fold**: five "Swag Labs product listing" are one row "×5"; its detail offers "Archive all 5" (`homesend/inbox-view.ts` `groupIdentical`).
- **Unreadable items get a short name** from source and file type ("A pasted web page", "A photo", "A PDF" — `failedTitleKey`); the raw text shows only inside the row's detail.
- **Archive all** (Admins): every waiting and unreadable item set aside in one server action after one confirm ("Archive 21 items? You can restore any of them for 30 days."); Undo puts back exactly those; audited `homesend.archived_all` / `homesend.restored_all` with counts.
- **Add all anyway** (Admins): every waiting item added through the governed write a person's confirm uses, each marked Checking with its confidence, HomeTalk's questions planned, its own Undo. Never bypassed: "Add money / health entries directly" off keeps those waiting; email from outside the household keeps waiting; nothing is paid; unknown-kind and unreadable items are never added. The confirm states, in words, how many are added and how many keep waiting and why. One run per minute per household (`homesend.add_all`); audited `homesend.added_all_anyway` (counts) and `homesend.added_anyway` per entry.
- Shared `Alert` is now a `div` (with `data-wh-alert`): an Undo form inside a `<p>` was invalid HTML and broke hydration. `e2e/auth.spec.ts` selects by the attribute.
- No migration: reuses the 30-day archive columns and direct add's "unconfirmed" state.

## Verified
- Unit: `inbox-view.test.ts` (grouping, derived failed titles, add-anyway guards and counts); homesend, security, i18n, help suites green; typecheck, ESLint on changed files, service-role and input-boundary lints, `lint:help-links`.
- Browser at 360 px on a QA household seeded like the owner's (17 waiting incl. 5 identical, 4 failed with scraped text, 2 Checking): page height ~3,600 → ~1,800 px, no horizontal overflow, rows one action each; Archive all moved 21 and Undo put 21 back; the Add-all confirm listed the guards correctly. Add all anyway itself could not run locally (no service-role key in the container for the rate-limit grant); `e2e/screens.spec.ts` covers it nightly with the real key (counts, guards, audit, the one-a-minute refusal, Archive all + Undo).
- Help: HomeSend section paragraph 12 and FAQ "What do Archive all and Add all anyway do?" in eight languages; section labels in the guide renamed to the new ones.

## Cleanup
QA user `3e6d9a44-2f5e-41ed-881e-10bcd2597a15` and household `ffbdd951-a4b8-4b12-b865-5acfeb2b702b` deleted after verification (see the PR).

## Code
`apps/web/app/home-send/page.tsx`, `apps/web/app/_components/home-send-inbox.tsx`, `home-send-clear.tsx`, `apps/web/app/(auth)/home-send-clear-actions.ts`, `packages/core/src/homesend/inbox-view.ts`, `repository.ts` (`archiveWaitingHomeSendItems`, `restoreHomeSendItems`).
