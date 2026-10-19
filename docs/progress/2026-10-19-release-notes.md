# Release notes on Get help

**Date:** 2026-10-19 · **Asked by:** the owner ("create a new 'Release Notes' section… updated whenever I confirm that a new version is live")

## What was done

- **A Release notes section on `/help`** (`#release-notes`), after the guide and linked from its contents card. Each release is one folded row (`ExpandableRow`, rule 21): its headline and "Live since {date}". Opened, it lists one line per feature. Newest first.
- **`packages/core/src/help/release-notes.ts`** holds the entries as data: `{ id, date, fromPr, throughPr }`. The words are `help.release.<id>.title` and `.item.N` in the eight help catalogs, counted from English like the guide's paragraphs. So they stay out of client JavaScript (`check:bundle` passes).
- **The first entry, 19 October 2026, covers #201–#242.** That is everything since the guide was brought up to date: the family Calendar, invitations, HomeFood (one list, the catalog, IFCT nutrition, receipts), meals from recipes, HomePlaces, HomeTalk doing what was asked with undo, voice across screens and floating, HomeBrain looking deeper, Kids & School classes, member sign-in and languages, push, What's new and setup, and Settings → Voice. It is written at a high level, in the UI's own labels, in all eight languages.
- **#243 (meal ideas, timetable and exams) is not in it.** It merged today and the owner has not yet confirmed it live, so it starts the next entry (`fromPr: 243`).
- **The guide.** Today and Home's What's new paragraph now points to Release notes, in all eight languages; that section's keywords gain "release notes", "changelog", "version" and "update", and its date is 2026-10-19. #243's features were already in the guide (School ¶7, Meals ¶13).
- **The process is in `CLAUDE.md`** under "Help content changes with the feature". When the owner confirms a version is live, add one entry at the top: that day, `fromPr` one after the last `throughPr`, every user-facing feature in the range, eight languages. Never add an entry for anything not yet confirmed live.
- **`lint:help-links`** now treats the help page's own literal ids (`<section id="release-notes">`) as anchors too (`pageAnchors`), with a test.

## Verified

- `release-notes.test.ts`: entries are newest first, the PR ranges are contiguous, and every language has every item, translated.
- Help tests 77/77, `npm test` (3549 unit + 64 script tests), typecheck, lint, `lint:help-links`, `check:bundle`, `tracker --check`, and the production build all passed.
- Browser at 360px and 1280px with a QA account: the section renders, opens to its 13 items, and there is no horizontal scroll.

## Open / needs a person

- The owner says when #243 (and anything after it) is live. Then the next entry is written.

## QA cleanup

Ran after #244 merged (2026-10-19): QA account `e60c0a74-c849-4aa7-9151-0d022735d72c` and household `19d65b0d-b719-465a-9ac6-329cf83bf549` ("QA Release Home") deleted, plus `1c69d23f-b142-4965-ae80-ce327eeb7f42` and `29283658-3fd7-4d0c-8122-dedd438c032c`, two accounts created by mistake in the same minute and never used. Confirmed by SQL: 0 households, 0 members, 0 auth users left for those ids. Screenshots and helper scripts removed; no server left running.
