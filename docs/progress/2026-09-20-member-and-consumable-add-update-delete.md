# A real household seed exposed three add/update/delete gaps — fixed

**Date:** 2026-09-20 · **Kind:** feature (user request, outside the backlog)

## Why

The user asked to seed their own real household in production — their
family, an accountless househelper, a typical playbook, responsibilities,
policies, groceries, bills, meals and a family event — on the explicit
condition that they "should always have options to add, update or delete
the info." Building that seed correctly meant using the app's own tables the
way its own code would, which surfaced three places where that condition
did not yet hold:

1. **No way to add a household member with no account of their own, other
   than a child.** `identity/children.ts`'s `createChildMember` exists
   exactly for "a young child, or a househelper whose work is tracked
   without asking them to use an app" (its own doc comment), but nothing
   implemented the helper half of that sentence. Adding the household's
   real househelper needed a raw SQL insert — there was no UI path.
2. **No way to remove a member at all.** "Make/Remove admin" and "Revoke
   invitation" existed; a plain removal — someone who has left, a helper no
   longer engaged — did not, for any member type.
3. **Groceries had no update or delete.** `createConsumableAction` (added in
   an earlier pass) let a household add something to track; there was
   nothing to correct a typo or stop tracking something once it was there.

## What changed

**Adding and removing a member** — `identity/households.ts`:
- `createHelperMember(supabase, actor, { displayName })` — the same shape as
  `createChildMember`, for the other accountless case: `household_members`
  insert with `profile_id: null`, `member_type: 'helper'`, plus the matching
  `household_roles` grant and a `member.added` audit entry. No new RPC or
  migration needed — the existing `household_members_insert_admin` and
  `household_roles_insert_admin` RLS policies already permit exactly this
  for an administrator; the child-creation path's `SECURITY DEFINER`
  function exists for a harder problem (bundling guardian links atomically)
  that a helper does not have.
- `deactivateMember(supabase, actor, { memberId })` — sets `status:
  'inactive'` and drops the member's roles, never a hard delete: a past
  responsibility, an audit entry, a certification item referencing them
  stays exactly as readable as everything else in this schema already
  assumes. Refuses to remove the Head of Family (ownership transfer is a
  separate decision) and refuses self-removal (leaving is a different
  action from removing someone else). Both refusals are server-side, ahead
  of RLS.
- `addHelperAction` / `removeMemberAction` (`household-actions.ts`),
  `AddHelperForm` (mirrors `AddChildForm`) and `RemoveMemberControl` (a
  `ConfirmationSheet`, since removing someone is the one action here with a
  real consequence) on Members & roles. The remove control is hidden for
  the Head of Family, for a member's own row, and for anyone already
  inactive.

**Editing and stopping tracking of a consumable** — `commerce/repository.ts`:
- `updateConsumable` — changes name, category, unit, quantity and cadence;
  never touches purchase or order history.
- `retireConsumable` — `active: false`, the same soft-removal every other
  domain in this app already uses (a policy stands down, a playbook item
  pauses) rather than a delete that would cascade-orphan real
  `cart_suggestions`/order history (both reference `consumables` `on delete
  cascade`).
- This exposed a real, previously latent bug: `consumables`' unique
  constraint on `(household_id, name)` was table-wide, not scoped to active
  rows the way `policies_one_active_per_name` is. Retiring "Milk" left the
  name permanently unavailable — re-adding it after "stop tracking" would
  have failed with a conflict about nothing currently tracked. Fixed with
  `supabase/migrations/20260920060000_consumables_retire.sql`: the table
  constraint is dropped and replaced with a partial unique index, `where
  active` — applied to production directly (`kqxndableyysxqhxiorz`) since
  this session had a live household to verify it against, and included
  here as the migration file for every other environment.
- `updateConsumableAction` / `retireConsumableAction`
  (`commerce-actions.ts`), and `ConsumableRowControls` — an Edit sheet
  sharing its fields with the existing Add sheet, plus a "Stop tracking"
  button — on each row of Groceries' "What WonderHome tracks" list.

## Verified

`PGHOST=localhost … npm run verify` — typecheck, lint, migration/embed/
boundary/secrets lint, tracker and brand checks, security, unit, DB tests
(including the new migration), build, 252 e2e — all passing.

**Production seed**, done directly against the live database per the
explicit request: the requester's own household (already existed from
earlier manual testing — one adult, one child, a partial playbook, three
policies, one memory) was completed rather than duplicated — a helper
member with a helper profile and a typical weekly availability pattern, the
outcome-key gap in the playbook filled in and linked to the responsibilities
that already referenced it, three more responsibilities, eight more grocery
items, two bills, two planned dinners, one protected family event (a
birthday) and one certification item reflecting the family's own stated
dinner-time preference. An already-pending invitation to a second adult was
left alone rather than churned. Real names are not repeated here; they are
in the household's own database, behind the same RLS as everything else a
household enters itself.

## Still open

- Bills and meals still have create-only manual actions — no update or
  delete. Lower priority than groceries: both are outcome-tracking domains
  by design (a bill is marked paid/waived, a meal marked eaten, not
  freely edited), but a mistaken entry still has no way back short of
  raw SQL. Worth a pass if the household hits it.
- Responsibilities still cannot be deleted outright — an "unowned" row
  already covers "nobody is responsible for this," which is the state that
  matters, but a custom outcome nobody wants tracked at all has no removal
  path either.
- Reactivating a removed member has no UI yet; the data model supports it
  (`status: 'active'` again), so it is a small addition when needed.

## Where

`packages/core/src/identity/households.ts`,
`packages/core/src/commerce/repository.ts`,
`apps/web/app/(auth)/{household,commerce}-actions.ts`,
`apps/web/app/_components/{add-helper-form,remove-member-control,commerce-forms}.tsx`,
`apps/web/app/household/members/page.tsx`, `apps/web/app/groceries/page.tsx`,
`supabase/migrations/20260920060000_consumables_retire.sql`.
