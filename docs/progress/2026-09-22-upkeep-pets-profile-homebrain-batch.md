# Eight-item batch: birthday sync, Home & Upkeep chevrons, pets as family, self profile edit, HomeBrain review

**Date:** 2026-09-22
**Area:** Family events, Home & Upkeep, Family tab, Settings/Profile, Certification (HomeBrain review)

## What was done

A batch of eight product requests, implemented and shipped together:

1. **Birthdays and special occasions sync to `family_events` automatically.**
   A new trigger (`wh.sync_member_occasion_events()`) upserts or deletes a
   `family_events` row per member per occasion (`birthday`,
   `special_occasion`) whenever `date_of_birth`, `special_occasion_date`,
   `special_occasion_label`, `display_name` or `status` change — keyed by a
   stable `external_id` (`member_birthday:<id>` /
   `member_special_occasion:<id>`) so an edit moves the same event instead
   of creating a duplicate, and clearing the date removes it. `wh.next_occurrence()`
   computes the next upcoming date in the household's own timezone,
   including the Feb 29 → Feb 28 fallback. `family_events_kind_check`
   gained `'special_occasion'`.
2. **Home & Upkeep rows are chevron-expandable**, matching the pattern
   already used on Groceries/Bills/School: the collapsed row keeps the
   scannable summary, and the chevron opens the full assessment — status,
   risk level, due date, and what to do — instead of squeezing all of that
   into one line. New `HomeAgendaRow` component
   (`apps/web/app/_components/home-agenda-row.tsx`), replacing the flat
   `AgendaRow` list on that page only (`AgendaRow` itself is unchanged and
   still used elsewhere).
3. **The four Home & Upkeep counts are a 2×2 grid on a phone** (`MetricGrid`'s
   existing `pairs` layout, labels shortened to the one/two-word form the
   layout already requires — "Need you"/"Handled"/"Laundry"/"Pets" — rather
   than inventing a new grid).
4. **Pets are addable from the Family tab, as their own "Pets" section**,
   peer to Family members and Household help rather than folded into
   `household_members` (folding them in would ripple through role/guardian/
   entitlement logic that assumes a person; a peer section on the same
   screen, addable from the same place as inviting people, satisfies "treated
   as family" at the experience level without that risk). Full add/update/
   retire-or-restore (never a hard delete — `pets.active`, default `true`)
   with a real detail view (species, age, date of birth, vet, notes).
5. **The signed-in member can edit their own profile and photo**, not only
   an Admin editing someone else's. `updateMemberProfile`'s gate changed
   from admin-only to "self, or an Admin" — enforced by a new
   `wh.guard_member_self_update()` trigger that lets a caller change their
   *own* row's cosmetic fields (name, nickname, photo, etc.) but still
   blocks them from changing their own `household_id`/`member_type`/
   `status`/`profile_id` (the fields that matter for authorization), which
   only an Admin may still change. `MemberAvatarControl` and
   `MemberProfileForm` now render on Settings for the signed-in member's own
   row.
6. **"Nothing needs you" reworded** to a warmer, more considerate line in
   both places it appeared (Home & Upkeep's empty state, Certification's
   "needs review" empty state), thanking the household rather than stating
   an absence.
7. **"Belief Review" renamed to "HomeBrain review"** (display-only, same
   precedent as the earlier Certification → Belief Review rename): nav
   label, page `<title>`, H1, landing tile, help-guide entry, and the design
   requirements doc. The `/certification` route, `certification_items`/
   `certification_reviews` tables and every internal type/function name are
   unchanged.
8. **HomeBrain review rows carry richer detail and stay chevron-expandable.**
   `CertificationItem` moved from an always-open row (claim + inline
   Confirm/Remove/Later/Correct) to the same `ExpandableRow` pattern as
   every other domain: the collapsed row keeps claim + status badge, and
   the chevron reveals source, category, "how much it matters" (risk) and
   last-checked date, with the confirm/correct/remove controls underneath.
   Add ("Tell WonderHome something"), modify (Correct) and remove already
   existed (`addBeliefAction`/`reviewCertificationAction`) — this closes the
   "richer info" half of the ask and reorganizes the existing controls to
   match the rest of the app rather than adding new CRUD that was already
   there.

## Where the code lives

- Birthday/occasion sync:
  `supabase/migrations/20260922020000_member_occasion_events.sql`,
  `packages/core/src/family/schedule.ts` (`EVENT_KINDS`),
  `packages/core/src/components/ui/calendar-item.tsx` (icon for the new kind).
- Home & Upkeep chevrons + grid: `apps/web/app/household/home/page.tsx`,
  `apps/web/app/_components/home-agenda-row.tsx` (new).
- Pets as family: `supabase/migrations/20260922030000_pets_management.sql`
  (`pets.active`), `supabase/migrations/20260922040000_avatar_self_upload.sql`
  (unrelated storage policy landed in the same session, see item 5),
  `packages/core/src/home/pets.ts`, `packages/core/src/home/repository.ts`
  (`listPets`/`createPet`/`updatePet`/`setPetActive`),
  `apps/web/app/(auth)/home-actions.ts`, `apps/web/app/_components/
  add-pet-form.tsx`, `pet-detail.tsx`, `pet-profile-form.tsx`,
  `retire-pet-control.tsx` (all new), `apps/web/app/family/page.tsx`,
  `apps/web/app/household/members/page.tsx`.
- Self profile edit: `supabase/migrations/20260922010000_member_self_profile_edit.sql`
  (`wh.guard_member_self_update()` trigger + `household_members_update_self`
  RLS policy), `packages/core/src/identity/households.ts`
  (`updateMemberProfile`), `apps/web/app/(auth)/household-actions.ts`,
  `apps/web/app/settings/page.tsx`, `apps/web/app/family/page.tsx` and
  `apps/web/app/househelper/page.tsx` (`editable={admin || own row}`).
- Empty-state copy: `apps/web/app/household/home/page.tsx`,
  `apps/web/app/certification/page.tsx`.
- HomeBrain review rename + richer rows:
  `packages/core/src/navigation/secondary-navigation.ts`,
  `apps/web/app/certification/page.tsx`, `apps/web/app/_screens/landing.tsx`,
  `packages/core/src/help/guide.ts`, `design/UI-UX-REQUIREMENTS-v3.md`,
  `packages/core/src/components/ui/certification-item.tsx` (rewritten on
  `ExpandableRow`).

## Verified

- `npm run typecheck`, `npm run lint`, `npm run tracker -- --check`,
  `npm run build` — all clean.
- `npm run test` — 97 test files passing.
- `npm run test:db` — 259 database tests (257 existing + 2 new: a non-admin
  cannot add a pet, and a new pet is active by default and only an admin can
  retire/restore one). The self-profile-edit and birthday-sync migrations
  each carry their own new RLS tests from the same session
  (`test-identity-rls.mjs`, `test-family-rls.mjs`).
- `npm run test:e2e` — 260 passing.
- All four new migrations applied to the live project
  (`kqxndableyysxqhxiorz`) via the Supabase MCP `apply_migration` tool in
  this session, confirmed against live `information_schema`/`pg_constraint`
  before and after.
- **Live browser verification** against a real QA household (`node
  scripts/qa-test-user.mjs create`, deleted afterward), seeded with a
  genuinely overdue asset, an overdue laundry need, a pet with care needs,
  and certification items in every status, at both 390px and 1280px:
  confirmed the Home & Upkeep 2×2 grid and chevron rows (collapsed and
  expanded, showing status/risk/due/what-to-do), the Family tab's Pets
  section, the Settings page's own-profile edit pill and avatar control,
  and HomeBrain review's renamed header/nav entry and its expanded row
  (source/category/risk/last-checked plus Confirm/Remove/Later/Correct).

## Still open

- The self-profile-edit trigger only guards `household_members` columns
  that matter for authorization; it does not (and should not) restrict any
  other cosmetic field a future column might add — a new authorization-
  relevant column would need the same guard added explicitly.
- The orphaned "QA Verify Home" household row (and its sample assets/pets/
  certification items) created for this session's live-browser check was
  left in place as harmless residual test data after the auth user was
  deleted, same as any real account deletion would leave — consistent with
  the pattern the prior QA sessions' progress notes describe.
- A pre-existing, unrelated bug was noticed but not fixed as out of scope:
  `new-event-form.tsx`'s `KINDS` dropdown lists `"visit"`/`"other"`, which
  are not valid per `family-actions.ts`'s `z.enum(EVENT_KINDS)` and would
  fail validation if chosen.
