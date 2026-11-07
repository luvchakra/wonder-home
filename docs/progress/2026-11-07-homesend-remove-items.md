# HomeSend: remove each item on its own, and Delete for good (14-065)

**Date:** 2026-11-07 · **Owner request (2026-11-03):** "give option to individually delete each item".

## What changed
- **Remove** on every row (Needs a word, Answer rows, Couldn't be read, Added recently, `×N` groups): swipe (the Groceries `SwipeToDismiss`), a Remove button in the row's detail and in the review sheet, and a ⋯ menu on desktop only. It archives with reason `removed_by_person`, instantly, with an Undo bar. A group asks once, saying how many.
- An item that had **added an entry** is removed together with it, through the existing governed undo (`undoHomeSendDocumentAction`); if that fails the item stays. Restore brings such an item back as "undone".
- **Delete for good** in Archived (confirm), plus Admin "Delete all archived": deletes the intake row and its (and its attachments') stored files. An item with a live entry on record is kept and counted. Audited `homesend.removed` / `homesend.deleted` (id only).
- **Permissions:** the item's adult sender or any Admin (`homesend/remove.ts`); children and helpers refused on the server; new RLS delete policy (archived rows, Admin or sender).
- Words in eight languages, FAQ "How do I remove one HomeSend item…" and the section's `updated` date.

## Migration
`20261103230000_homesend_remove_items.sql`: adds `removed_by_person` to the reason check and the delete policy. Additive, safe in either order. Applied live by the coordinator session after the first `apply_migration` approval timed out; verified (policy exists, check includes the value).

## Verified
Typecheck; ESLint on changed web files; vitest homesend/security/i18n (820 pass, incl. `remove.test.ts`, `remove-repository.test.ts`); `scripts/test-homesend-rls.mjs` 74/74 on a local Postgres (delete policy: not-archived, other household, non-sender non-Admin refused; Admin and own-item allowed).

## Open
360 px browser check on a QA household was not run in this container (no service-role key / dev environment) — please swipe a row and try Delete for good. No QA data was created.
