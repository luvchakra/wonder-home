# Responsibilities: group by, group cards, and one autonomy choice per group

Date: 2026-10-26 · PRs #342, #345, #346, #347, #348 and this one

## What the owner asked for, and what the page does now

- **Group by** (#342): a Person / Outcome control above the tabs. Outcome groups by the outcome's area, the part of its key before the dot.
- **Group cards:**
  - Each group label is a thin card, collapsed by default. Tapping its name shows the responsibilities in it.
  - The card carries a dropdown that is always in view and shows the group's autonomy choice in full. It opens the four choices, each with what it lets WonderHome do.
  - Choosing one sets every responsibility in the group (`setGroupAutonomyAction` → `setAutonomyForOutcomes`).
  - A group with an unowned outcome greys out the two choices that need an owner ("ask before acting", "does it, and tells you afterwards") and says why. The server refuses them too.
  - Admins only. Others read the group's mode.
- **Wording** (#346): the four choices read "WonderHome will notify only", "WonderHome does the groundwork, and waits for you", "WonderHome will ask before acting" and "WonderHome does it, and tells you afterwards", in the picker and the explainer, in all eight languages.
- **Help:** the "How much WonderHome may do on its own" section uses those labels and says where to set them. The outcomes section has a paragraph on Group by and the group cards. Both are in eight languages, dated 2026-10-26.

## What went wrong on the way, and the fixes

- **Work never reached `main`** (#341–#343): squash merges plus a reused branch. Fixed by `scripts/branch-sync.sh` (`docs/progress/2026-10-26-branch-sync.md`).
- **"Still the same" after #347:** the dropdown was moved inside the card but stayed behind a second disclosure under the header. On the phone that looked unchanged. The owner's arrow pointed at the card itself, so the dropdown is now on the card and visible without opening anything.
- **A native select cut off long choices** at 360 px (seen in a browser check), against rule 15. It is now a button that shows the choice in full and opens the list.
- **A refused group was half-written** (found by a new test): rows before the refused one were already saved. Every row is now validated before any is written.
- **#346 sat green but unmerged:** auto-merge reported the PR "already clean" and never merged it. It was merged by hand. Check the PR state after enabling auto-merge.

## Verified

- Unit tests:
  - `app/_lib/responsibility-groups.test.ts`: grouping and the shared mode.
  - `core/household/configuration-repository.test.ts`: the bulk write, keeping owner, backup and priority, and a refused group writing nothing.
  - `app/(auth)/configuration-actions.test.ts`: admin check and input rules.
  - `app/_components/responsibility-group.test.tsx`: collapsed by default, the dropdown on the card, the mixed group's question, the read-only view.
- Browser, Chromium at 360 px and at desktop width: the real component on a temporary page (not committed), with the app on the placeholder project.
  - The list toggles from the card name, and groups toggle independently.
  - The dropdown shows the current choice and opens all four choices in full.
  - Choosing posts the mode, the whole group's keys and the household. A failed save shows its error, and the button keeps the stored choice.
  - In an unowned group the two owner-only choices are disabled, with the reason.
  - No horizontal overflow.
- Not verified: a save against the live database. The container has no Supabase keys, so the signed-in path was not driven. The write is covered by the repository and action tests.
- `npm run lint:help-links`, both typechecks, and the household, help and i18n suites pass. The production build and `check:bundle` results are in the PR.

## Open

- The seven non-English texts (choices, help paragraphs, the owner reason) are drafts for a native speaker.
- The row editor and the group dropdown both set the mode (rule 23: one editor per setting). This needs the owner's call.

## Cleanup

No QA accounts or rows were created. The temporary page, the dev server, the screenshots and the drive scripts were removed.
