# Responsibilities: remove, group by member, and a miscounted "Mine" tab

## What happened

Part of a 14-item user-reported batch across Family, Responsibilities,
Kids & School and Groceries. This note covers the three items that
touch `/household/responsibilities`:

- Add, remove and update an existing responsibility (add/update already
  existed; remove did not).
- Display responsibilities grouped by the member who owns them.
- Fix a count/list mismatch: the "Mine" tab's header said `Mine (5)`
  while six rows were listed underneath it.
- Reword the "How WonderHome helps" section, which used its own
  four labels ("Watches", "Prepares", "Asks first", "Handles it") that
  didn't match the words the responsibility form itself uses to ask the
  question.

## Root causes

**No remove path.** `configuration-repository.ts` had `retirePolicy` and
`setPlaybookItemActive` (both soft-status flips, because `policies` and
`playbook_items` carry an `active` column with history worth keeping) but
no equivalent for `responsibilities`, which has no status column at all.

**Mine-count mismatch.** The segment count and the list used two
different predicates:

```ts
// count
rows.filter((r) => r.primary_member_id === membership.memberId).length
// list, when active === "mine"
rows.filter((row) => row.primary_member_id === membership.memberId || row.backup_member_id === membership.memberId)
```

The count only checked `primary_member_id`; the list also matched rows
where the caller was the `backup_member_id`. Anyone backing up even one
outcome saw a list one row longer than its own header.

**Confusing labels.** The explanatory card above the responsibility list
used different words ("Watches") from the `aiMode` select inside the
add/edit form ("Watch only"), for concepts new to first-time users.

## Fix

- New `removeResponsibility()` in `configuration-repository.ts`: a real
  `delete`, not a status flip — `responsibilities` has no status column
  to flip, RLS (`responsibilities_write_admin`, `for all`) already
  permits it, and `wh.autonomy_for()` already defaults to `'observe'`
  the moment no row exists for an outcome key, so deleting is the
  correct way to free the outcome to be assigned again from scratch.
  Reuses the existing `"responsibility.updated"` audit event with a new
  `{ removed: true }` metadata flag, the same pattern `retirePolicy` uses
  for `{ retired: true }`.
- `removeResponsibilityAction` server action + a `RemoveResponsibilityControl`
  (confirm sheet, destructive) added to the existing edit sheet in
  `responsibility-controls.tsx`.
- `page.tsx`: extracted the shared `isMine` predicate
  (`primary_member_id === memberId || backup_member_id === memberId`)
  and used it for both the segment count and the "Mine" filter, so they
  can no longer diverge.
- `page.tsx`: new `groupByOwner()` groups the shown rows by
  `primary_member_id`, in household-member order, with an "Nobody yet"
  group for unowned outcomes trailing at the end.
- Reworded the explanation card to the same four labels the form itself
  uses: "Watch only", "Prepare, and leave it to me", "Ask me before
  acting", "Act, and tell me afterwards" — eliminating the
  label mismatch rather than inventing a third wording.

## Verified

- `npm run verify` clean: typecheck, lint (app + migrations + embeds +
  boundaries + secrets), tracker/brand checks, security suite, unit
  tests, DB/RLS tests, production build, 256 E2E.
- Browser-verified end to end against a live QA household (created via
  `scripts/qa-test-user.mjs`, deleted after): grouping renders correctly
  at 360px and desktop; the Mine tab's count and list now agree; removed
  a responsibility through the UI and confirmed directly against the
  live database that the row was gone and the audit trail recorded
  `{"event_type":"responsibility.updated","metadata":{"removed":true,"outcomeKey":"groceries.stocked"}}`.
- Re-confirmed the earlier "full-page screenshot vs. fixed tab bar"
  false-positive pattern one more time here (a `mouse.wheel` scroll to
  the real bottom + `scrollingElement` metrics showed no actual overlap)
  — noting it again since it's now recurred twice with the same fixed
  bottom-tab-bar layout.

## What's still open

- The remaining 11 items in the same user-reported batch (Family member
  edit/remove, homework screenshot import, homework/event CRUD,
  chevron-expandable cards for Kids & School and Groceries, Groceries
  dropdown suggestions for name/category/unit) are tracked separately
  and not covered by this note.
- No backlog story number maps to this work — it's UI/UX polish reported
  directly by the household, not a scheduled story.

## Where the code lives

- `packages/core/src/household/configuration-repository.ts` — `removeResponsibility`
- `apps/web/app/(auth)/configuration-actions.ts` — `removeResponsibilityAction`
- `apps/web/app/_components/responsibility-controls.tsx` — `RemoveResponsibilityControl`
- `apps/web/app/household/responsibilities/page.tsx` — `groupByOwner`, `isMine`, reworded explanation card
