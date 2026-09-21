# Admin instead of Head of Family, Belief Review, and a real person record

**Date:** 2026-09-21
**Area:** Identity/roles copy, certification rename, Family/Househelper screens, new person fields

## What was done

A batch of eight product/UX requests, implemented and shipped together:

1. **"Head of Family" retired as a visible concept.** The household still has
   exactly one owner internally — the DB's `household_roles_one_head_per_household`
   unique index, the `assign_admin` permission, and the "can't remove the
   owner" rules are all untouched — but nothing in the UI shows a two-tier
   "Head of Family" vs "Administrator" label any more. `describeRoles()` and
   `roleLabelFor()` collapse both to **"Admin"**, and every explanatory
   sentence that used to name the head specifically now says "the
   household's owner" (the wording, not a role name, since the concept
   itself stays out of the UI). This was confirmed a genuine authorization
   question before touching it — a research pass found the uniqueness
   invariant, the exclusive `assign_admin` permission, and the "owner can't
   be removed"/"owner's own deletion request is refused" rules — so the
   user was asked whether to keep the single-owner invariant (display-only
   rename) or fully flatten admin access; they chose to keep the invariant.
2. **Certification → Belief Review.** Nav label, page heading, `<title>`,
   landing tile, and the help-guide entry all say "Belief Review" now. The
   `/certification` route, the `certification_items`/`certification_reviews`
   tables, and every internal type/function name (`CertificationItem`,
   `certificationHealth`, …) are untouched — the module already spoke
   "belief" internally, so only the visible label needed to change.
3. **Sidebar illustration below "Get Help" was cropped.** `nav-drawer.tsx`
   forced `HomeIllustration` into a fixed `h-14` box with `overflow-hidden`;
   every other call site sizes it by width only. Removed both.
4. **The Home greeting's 👋 now actually waves** (`wh-hand-wave` keyframe in
   `ui-theme.css`, a brief rotate-side-to-side on mount, respecting
   `prefers-reduced-motion`).
5. **Each responsibility under "Family status" is now a link** to
   `/household/responsibilities?outcome=<key>`, which auto-opens that row's
   existing detail sheet — not a dead query param: `ResponsibilityRow` gained
   an `autoOpen` prop the page now threads through.
6. **Today's "Plan something" opens the real form.** It used to be a
   `PillLink` to `/family` — a page that never actually let you plan
   anything from that link. It's now the same `NewEventForm` component
   Home's own "Plan something" already uses (a sheet with the actual
   add-event form), reused rather than duplicated.
7. **Family and Househelper screens' member rows are full-width and expand
   in place**, replacing the 2-column `PersonCard` grid (now deleted — its
   only usage) and the Househelper page's always-open per-member cards.
   Both use the existing `ExpandableRow` pattern (previously only on Home's
   own summaries).
8. **New person fields**: nickname, relationship (free text — "stepfather"
   and "grandmother" don't fit an enum), occupation, school/work location,
   and a special-occasion label+date, added to `household_members`
   (migration `20260921070000_household_member_profile_fields.sql`, no RLS
   change needed — the existing admin-only `household_members_update_admin`
   policy already covers new columns on an existing row). Deliberately
   **not** added: a manual "older/younger sibling" field. `siblingOrder()`
   derives it from `date_of_birth`, which the household already keeps, so
   it can never disagree with the birthdate on file. An Admin edits all of
   this through a new sheet (`MemberProfileForm`), opened from each
   expanded row's detail (`MemberDetail`) — the first time any of these
   screens supported editing a member after creation at all, closing a real
   "every entity can be added, updated and removed" gap (CLAUDE.md rule 12).

## Where the code lives

- Role/label rename: `apps/web/app/_lib/member-role.ts`,
  `packages/core/src/identity/views.ts`, and ~25 files with the retired
  copy (households.ts, credentials.ts, voice/repository.ts,
  billing/repository.ts, brain.ts, help/guide.ts, and the settings/privacy/
  household pages that explained who could do what).
- Belief Review: `packages/core/src/navigation/secondary-navigation.ts`,
  `apps/web/app/certification/page.tsx`, `apps/web/app/_screens/landing.tsx`,
  `packages/core/src/help/guide.ts`.
- Sidebar fix: `packages/core/src/components/shell/nav-drawer.tsx`.
- Wave animation: `packages/core/src/ui-theme.css`,
  `apps/web/app/_screens/home-dashboard.tsx`.
- Responsibility links: `apps/web/app/_screens/home-dashboard.tsx`,
  `apps/web/app/household/responsibilities/page.tsx`,
  `apps/web/app/_components/responsibility-controls.tsx`.
- Today's modal: `apps/web/app/today/page.tsx` (reuses
  `apps/web/app/_components/new-event-form.tsx`, unchanged).
- Expandable member rows: `apps/web/app/family/page.tsx`,
  `apps/web/app/househelper/page.tsx`.
- New fields: `supabase/migrations/20260921070000_household_member_profile_fields.sql`,
  `packages/core/src/identity/households.ts` (`HouseholdMember`,
  `MemberProfileUpdate`, `updateMemberProfile`, `siblingOrder`),
  `apps/web/app/(auth)/household-actions.ts` (`updateMemberProfileAction`),
  `apps/web/app/_components/member-detail.tsx`,
  `apps/web/app/_components/member-profile-form.tsx`. New audit event
  `member.profile_updated` (`packages/core/src/api/audit.ts`,
  `packages/core/src/security/sensitive-actions.ts`).

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:migrations`,
  `npm run lint:embeds`, `npm run lint:boundaries`, `npm run lint:secrets`,
  `npm run tracker -- --check`, `npm run brand -- --check`,
  `npm run security` — all clean.
- `npm run test` — 1321 unit tests / 96 files (7 new for `siblingOrder`).
- `npm run test:db` — 235 database tests (233 existing + 2 new, asserting
  an Admin can set the new columns and an outsider cannot — the outsider
  test had to be sequenced before an existing test that legitimately makes
  the same profile an administrator of the household later in the file,
  since `scripts/test-identity-rls.mjs` shares one database across its
  whole `before()` block).
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- **Live browser verification** against a real household (a confirmed test
  account created directly via the Supabase admin API, per the user's
  instruction not to exercise the public sign-up flow): confirmed the wave
  animation renders, the sidebar/Family-page illustration is no longer
  clipped, "Belief Review" reads correctly on the nav, the page heading and
  the landing tile, Today's "Plan something" opens the real add-event sheet,
  and the household-setup copy says "You will be the household's Admin."
  at both 360px and 1280px.

## Still open

- **The new migration is not applied to the shared Supabase project this
  session's dev server points at** (`kqxndableyysxqhxiorz` — the same
  production project 19-008's recovery runbook already flagged). Browsing
  to `/household/members`, or expanding a Family/Househelper row, currently
  throws `listMembers failed: 42703` (undefined column) there until someone
  applies this migration — expected, not a code defect: the same open
  question 19-008 already raised (this session still cannot confirm how
  migrations reach that project) applies here, so this session did not
  write to it directly. The Family/Househelper expandable-row detail panel
  and the edit form could not be exercised live end-to-end for that reason;
  their correctness rests on the unit tests, the new RLS tests, and code
  review, not a live click-through.
- The test household and member rows created for the live-browser check
  ("QA Verify Household", "Kunal QA", plus the auth user) were cleaned up
  (auth user deleted); the orphaned household row itself was left as
  harmless residual test data, same as any real sign-up would leave.
