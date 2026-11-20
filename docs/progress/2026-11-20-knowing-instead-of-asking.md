# Knowing instead of asking (HomeSend review, part 1) — 2026-11-20

The owner, 2026-11-20: "I want homesend to be as autonomous as possible, with minimum inputs required from the users", then "implement all the suggested features" on the review page ("HomeSend on Its Own"). This is part 1 of three parallel builds: **knowing instead of asking**. Part 2 (payment proof, confirmed by action) and part 3 (daily summary, quieter questions) are other sessions; the health-records Admin setting is a fourth.

## What changed

1. **The resolver runs for every kind** (`homebrain/history-fill.ts` `fillFromHistory`, called first in `home-send-review.ts` `prepareReview`). One wave reads the context (people, bills, school, places, groceries), every rule kind (not only school and activity) and what this sender's earlier items became (`homesend/sender-history.ts`). It fills an unknown kind (`sender_area`), a bill's or receipt's payee, a bill's category, a grocery's name and a place. All callers that add on their own (`addIfAllowed`, the review's own add, "Add all anyway", bulk add) use the filled kind and reading.
2. **Decision 3, blanks from history.** A bill missing its amount or day takes the payee's usual: the median of its bills and paid months on record (two or more, one currency), and the next such day on or after it arrived (`usualBill`, `nextOnDay`). The payee comes from the sender when its earlier bills all had one. Anything filled this way is **always Checking** (`ConfirmationInput.filledFromHistory`). "Why?" lines are kept on the item (`understanding.filled`) and shown on its Checking row; they never state the amount. The "Add this bill?" default (`add-default.ts`) fills a single bill the same way. **A filled value never changes a record on file:** reconciliation uses only what was read (caught by eval HS-106 while building: a usual amount and day had turned a reminder into "Update the existing bill?").
3. **Which child.** The resolver now also reads the class a notice names (`schoolGrades` on members, from enrolments), a teacher on one child's timetable or class (`teachers` on timetable days), a subject only one child has, and this sender's earlier notices. Still unsure, a school notice is recorded for **every child at the one school it can be placed at**, each its own change of the same item, all Checking, undone together (`childrenAtSchool`, `subject-fill.ts` `everyone`, `home-send-auto.ts`). A rule taught two children is still asked.
4. **Every answer teaches** (`homebrain/teach-from-entry.ts`). A person's "Looks right", "Add", "Update" or "Keep" in Needs you teaches the sender's kind, a bill's category and a school notice's child, after the response. A default teaches nothing; a health document never does. Review confirms of an event or bill with a picked person teach `sender_person`.
5. **Decision 4, known senders pre-trusted** (`homesend/sender-pretrust.ts`, only on "Ask once"). An exact address the records know (a member's or teacher's email; a child's school domain; a payee's address or a domain named like a payee) is added to the allowlist with a `basis` and shown as "Trusted: in your contacts / a child's school / a payee on record". Remove turns pre-trust off for that address (`pre_trust_off`), so it is asked again. Webmail domains never count on their own. A default still never trusts.
6. **Attachments** from a trusted sender go through the same add-on-arrival step as a photo, always Checking. Untrusted senders' attachments are still never fetched.
7. **Voice notes** below the transcript floor (0.75) are read on and recorded as Checking (`UNSURE_TRANSCRIPT`); paying or buying words keep the 0.9 floor and are shown back, as before.
8. **Clean-up:** `settingsPage.ai.autoAdd.detail` rewritten in all eight languages for record first.

Also fixed: a leftover merge-conflict marker in `docs/progress/README.md` on `main`.

## Invariants kept

Paying never happens (nothing here creates a payment; HS-106 checks a guessed amount never edits a bill). A rule never crosses households or carries money, approval or permission (new lessons go through `lessonsFrom` / `safeRuleText`; the usual amount is computed each time, never stored as a rule). Content stays untrusted (pre-trust changes who is read, not how). Health: nothing is filled for a health document and no health lesson is learned; the health session's subject rules are untouched. HomeSend still touches only its own tables (X-003): domain reads go through `homebrain/household-records.ts`.

## Verified

- Typecheck clean for `packages/core` and `apps/web`; `lint:boundaries`, `lint:service-role`, `lint:migrations`, `lint:embeds`, `lint:knowledge` pass.
- `npx vitest run` over homebrain, homesend, hometalk, context, whatsapp, evaluation, i18n, settings-search: all pass (see the PR for counts). New: `history-fill.test.ts` (16), `teach-from-entry.test.ts` (16), `sender-pretrust.test.ts` (5), webhook decision-4 tests (4), voice tests (6), a confirmation test.
- Eval: HS-106–HS-110 and HB-40–HB-47 added; HB-20 updated to the owner's new rule (two children at the named school go on both calendars, Checking, instead of a question). Unsafe Action Rate stays 0.

## Migration (not applied by this session)

`supabase/migrations/20261120150000_homesend_sender_pre_trust.sql`: `homesend_email_allowlist.basis`, `homesend_email_senders.pre_trust_off`, and an index on `home_send_items (household_id, sender_address, created_at desc)`. Safe in either order: before it, known senders are read for that one email only and nothing is written; the list shows no basis; the sender-history read is only slower. The Supabase MCP refuses these sessions, so the SQL went to the coordinator to apply.

## Open

- Mail held from a new sender and released by "Trust" still has only its text read; its attachments are not re-fetched.
- An email's text and its attachment can each be added on arrival; the review's duplicate check runs for each in turn, so a rare double is possible and Undo removes it.
- The review form has no "who" picker for events and bills, so the new `sender_person` teaching from review confirms has nothing to read yet.

## Cleanup

No QA accounts, households or Storage files were created; nothing to remove.
