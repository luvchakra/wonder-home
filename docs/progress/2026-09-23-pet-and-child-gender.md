# Gender on every profile: pets, and children as they are added

**Date:** 2026-09-23 · **Area:** Family / household roster · **Type:** small feature

## What was asked

"Both for humans and animals, add a field gender in their profiles."

## What was already there

People already had gender. `household_members.gender` shipped in
20260923100000 and is live. It is shown on every member card
(`MemberDetail`), editable in the profile editor (`MemberProfileForm`, used on
the Family and Househelper tabs and in Settings), and asked on "Add a helper".

## What changed

- **Pets, new.** Migration `20260924130000_pet_gender.sql` adds
  `pets.gender`: optional open text, 1–40 characters, with no RLS change. The
  `pets` policies already cover the whole row, so only an admin can set it.
  Gender is now:
  - asked on "Add a pet";
  - editable in the pet editor, and can be cleared;
  - shown on the pet's Family card.

  The options are `PET_GENDER_OPTIONS` (Female, Male, Female (spayed),
  Male (neutered), Not sure). Rule 20's "Describe another way…" lets a
  household write in an answer that isn't on the list.
- **Children, when added.** "Add a child" was the one human path that did not
  ask for gender. It now does:
  - `addChildAction` records it through the same `updateMemberProfile` that
    the editor uses, so `create_child_member` is unchanged.
  - If that one optional write fails, the child is still added and the form
    says the gender didn't save, rather than reporting the whole addition as
    failed.
- **One picker.** `GenderField` (`apps/web/app/_components/gender-field.tsx`)
  is now the only gender control, used for people and pets alike.
  `MemberDetailFields` uses it too.

## Verified

- Typecheck and lint pass.
- `scripts/test-home-rls.mjs`: 15/15, including a new pet-gender test. It
  checks that gender is optional, that an admin can set and clear it, that a
  non-admin can't change it, and that blank or over-long values are refused.
- Migration applied live via `apply_migration`. `verify:live` passes 136/136
  and now checks `pets.gender` and `household_members.gender`.
- Browser, against the live project, on a QA household:
  - **360px:** added a pet with "Male (neutered)" and a child with "Female".
    Both show on the Family tab, with no horizontal scroll.
  - **Desktop:** changed the pet to a written-in "Intact male", which saved
    and showed; then cleared it back to "Not recorded".
  - The database confirmed each value.
- `npm run verify`: exit 0.
  - Unit tests: 2028.
  - Script tests: 43.
  - DB/RLS tests: 414.
  - Build passes.
  - Playwright: 364.

## Still open

- `Field` derives the input `id` from its `name`, so two forms on
  `/household/members` both render `id="displayName"`. The "Their name" label
  in "Add a child" therefore points at the invite form's input. This predates
  this change and is not fixed here. `GenderField` is unaffected because
  `ComboboxField` uses `useId`.
- Gender is not fed into HomeBrain's grounded facts for people or pets.
  This matches how member gender already works.

## QA cleanup

Ran after PR #117 and PR #118 merged:
- **Account:** QA account `7832775b-a358-4680-b044-b59132503078` deleted with `qa-test-user.mjs delete`.
- **Household:** QA household `5fce589b-6c93-4149-aade-cce47bf3eac4` deleted. Its rows were removed with it: 3 members, 2 pets, 1 consumable, 3 agent runs and 3 tool calls, 1 notification, 1 usage counter, and conversation and audit rows.
- **Stray accounts:** two accounts created by mistake (`5014daae-…`, `1b87ac0e-…`) were deleted immediately. The older QA account `42dc16e3-…` was deleted on request.
- **Local:** scratch scripts and screenshots removed, and no dev server left running.
- **Confirmed:** a SQL check finds no `qa-verify-*` user and no row in either household.

**Left in place:** two "Chakrabarty Family" households with no login members, `5024f9f5-d6e8-42d8-a5eb-44f42f04b5eb` and `4f8bb194-043a-4690-8340-00b9bb5dc076`. Nothing proves this session created them. Each can be removed with `delete from public.households where id = '<id>';` once someone confirms they are test data.
