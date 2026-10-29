# School "Check in" closes the item (2026-10-29)

**Bug (owner, phone):** on School → "Deadlines at risk", a missed item's blue "Check in" did nothing.
**Cause:** the pill was a plain link to `/school?tab=homework`, the page already open, so nothing visibly happened. No handler existed for `check_with_child`.
**Fix:**
- `apps/web/app/_components/school-check-in-button.tsx`: a button that calls `markSchoolWorkAction` (same membership check and `completeSchoolItem` as other school completions), refreshes so the card leaves the list, and shows any error in an alert.
- `agenda-expandable-row.tsx`: uses it for `check_with_child` when given a `householdId` (School page passes it); the expanded body no longer repeats the reason shown in the summary.
- `school/items.ts`: `agoPhrase` says "5 days ago" past 48 hours (rule 9). The engine's reasons are English strings, not catalog words, so there is no per-language copy to change.

**Verified:** `npx vitest run packages/core/src/school/items.test.ts` passes (new `agoPhrase` test). Web typecheck/lint and `ui-check.mjs` could not run: dependencies for `apps/web` are not installed in this container, so CI is the check.
**Open:** the Home dashboard shows these rows with a status chip, not the button; same `laundry.ts` "hours ago" wording left as is.
