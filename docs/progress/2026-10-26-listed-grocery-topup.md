# A Pre Approved grocery already on the list is topped up; HomeSend says why something waits (25-038, 14-052, I-24)

**Date:** 2026-10-26 · **Stories:** HomeFood 25-038, AI Orchestration 14-052 · **Design:** `docs/hometalk-homesend-design.md` §4.7, §7, I-24

## Why

Three reports from the owner, 2026-10-26:

1. At 8:47 PM IST "2 litres mustard oil" on WhatsApp got "It's waiting in HomeSend for you to check" ("its pre approved, still issue"). On the live project the item scored 97%, high and verified; groceries were Pre Approved; no bar was set (95%); Mustard oil was already on the shopping list. `decideConfirmation` held anything reconciliation found on record: I-4's duplicate rule, kept on purpose then.
2. "Science project model · 70% sure · every detail is in what you sent". `sureWhy` returned "verified" whenever the check found every detail, whatever the score.
3. Mustard oil waited at 97% with only "Review": the row never said why.

## What changed

- **Decision** (`homesend/confirmation.ts`). A grocery already on the shopping list (`onShoppingList`, read in `home-send-review.ts`), said with an amount, goes through the same decision as anything new. Pre Approved and above the bar, it is `auto_apply` with `topUp`. With no amount it waits for the person to choose. Wait for Approval or below the bar, it waits. A decision that holds something that would otherwise be added on its own carries `wait`: `on_list`, `wait_for_approval` (with the area) or `below_bar` (with the bar). Bills, school items, events, and a tracked grocery that is not on the list keep the duplicate rule. Bills, health documents, receipts, photos and files still always wait.
- **The write** (`home-send-writes.ts` `addGrocery`). This is the same governed write and Undo as before: an `adjustListEntry` with its own key, recorded as an `updated` change. It now picks the item HomeTalk's add would pick (`trackedGrocery` → `findGrocery`: its name or alias, then the one item holding every word, then the closest spelling), so look-alikes never get a third entry. It returns what it added and what the list holds now.
- **Replies.**
  - WhatsApp: "✅ Added 2 L more *Mustard oil* (now 3 L) (97% sure — every detail is in what you sent) — … You can undo it in HomeSend." When it waits on the list: "*Mustard oil* is already on your shopping list, so it's waiting in HomeSend for you to choose. 🛒" Something new held by the setting or the bar says which.
  - All of it is in `whatsapp.*`, in eight languages, and never echoes an amount when it waits. `addIfAllowed` now returns the wait as well as an addition.
  - HomeTalk (`handedBackText`, `file_with_homesend`) says the same in English.
- **Reason matches score** (`homesend/auto-add.ts` `sureWhy`). "Verified" applies only in the 97% band. Every detail found but a medium reading, or a voice note not clearly heard, is "the AI wasn't sure". This fixes the app rows, "What I found", WhatsApp and HomeTalk at once.
- **Row reason.** `waitRowWords` gives "already on the shopping list", "groceries set to Wait for Approval", "school work set to Wait for Approval" or "below your bar of N%" (`homesend.inbox.wait.*`, eight languages). The page words it on the server, and it takes the place of where the item came from, so there is still one line of reason (principle 4).
- **Help.** HomeSend ¶8 in eight languages.

## Verified

- Typecheck (all workspaces); web ESLint on changed files: 0 errors; help links; import boundaries; tracker check.
- Touched suites: 2,001 / 2,001 pass, including the acceptance file (195). New cases: AT-F08–F11, AT-L01–L16, AT-M01–M03, AT-H08–H11, AT-J05–J06. AT-B06 was narrowed, and AT-J02/J03 now expect the reason (`docs/testing/2026-10-26-hometalk-homesend-acceptance.md`).
- `npm run eval` (deterministic): 196 / 196, Unsafe Action Rate 0 / 23.
- `npm run build -w apps/web` and `check:bundle`.
- Browser, production server on the live project with a throwaway account, at 360 px and 1280 px:
  - the Needs your review rows read "already on the shopping list", "below your bar of 95%" and "groceries set to Wait for Approval";
  - the 70% school item reads "the AI wasn't sure";
  - no sideways scroll;
  - "Add anyway" on a listed 2 L item took the single Mustard oil entry from 1 L to 3 L, with no second item.

## Open / for a person

- The owner's own list (household `91ade341…`) was not changed. It holds one *Mustard oil* entry (1 L to buy) and a separate *Rai (black mustard seeds)* entry. These two are probably the "2 entries" seen. The milk at 2.502 L and eggs at 32 pcs from the earlier test may still be there. The owner can tidy these on Groceries.
- The waiting item `94b6bcd5…` from 8:47 PM still waits. Under the new rule its review now decides "add on its own", but nothing re-decides old items. The owner can tap Add anyway, or send it again.
- **Cleanup:** see the PR thread for the final state of QA account `a9dc0bd2-326f-46de-a65f-bc1f0431b47a` and household `8c5ff19b-a392-4be5-b3dd-cf854713d65b`.
