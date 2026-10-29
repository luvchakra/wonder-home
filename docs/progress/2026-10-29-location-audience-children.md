# Location sharing: each sharer picks whether the children can see it

**Date:** 2026-10-29
**Owner request (2026-10-29):** "Make it configurable if family's children can see the location online."
**Decision (owner):** each person who shares chooses their own audience. When sharing is on, the sharer picks: adults only (the default, today's behaviour) or adults + children. Adults always see; children see a person's location only if that person opted in. Default stays adults-only, so nothing changes until someone turns it on.

## What changed

- **Data.** `member_location_sharing.visible_to_children boolean not null default false`
  (`supabase/migrations/20261029100000_member_location_visible_to_children.sql`).
  The read policy on `member_locations` is recreated: self and the household's
  adults read exactly as before; a **child** of the household may now read a
  member's position, but only when that member is sharing **and** chose
  `visible_to_children = true`. Helpers are unchanged (self only). Set forms
  only — no per-row helper — so `scripts/test-setup-counts-rls.mjs` stays green.
  The child branch keys the sharing lookup on `member_id` (its primary key), so
  no new index is needed.
- **Safe in either order.** The column defaults false, so every existing row is
  adults-only. Before the migration there is no column and the read is
  adults-only; after it, the read is still adults-only until a sharer opts in.
  Old code and new code both see today's behaviour until someone turns it on.
  `loadLocations` reads the column with a fallback to adults-only when it is not
  there yet, so a deploy is safe before the migration lands.
- **Logic** (`packages/core/src/location/sharing.ts`): `LocationSharing` gains
  `visibleToChildren`; `loadLocations` returns it (resilient to the missing
  column); new `setLocationAudience` updates only the existing row, leaving the
  on/off state alone. RLS decides who may — the sharer, or a child's guardian or
  Admin (`wh.may_set_location_sharing`, the same rule as turning sharing on).
- **Action** (`apps/web/app/(auth)/location-actions.ts`): `setLocationAudienceAction`
  saves the pick under the person's own session.
- **UI**: new `LocationAudienceChoice` (picked, not typed — rule 20 — using
  `ChoiceChips`, 44px targets, saves on pick). Shown on
  `settings/location/page.tsx` when the person's own sharing is on, and in
  `family/page.tsx` under a child whose sharing is on (for the guardian/Admin —
  one editor per person, rules 14/23). The "How it works" line now reflects the
  choice ("The household's adults — and the children too, because you chose
  that."). Safety copy is unchanged and honest: only while the app is open, only
  the latest place, stopping deletes it, never given to the AI.
- **i18n**: new `location.audience.*` keys and `location.how3.children` in all
  eight languages; the help paragraph (`help.guide.family.body.7`) updated in all
  eight.

## Verified

- Typecheck (core + web), web ESLint, `check:bundle` (no guide/AI text in client
  chunks), `lint:help-links`, `lint:migrations`, i18n `translate.test.ts`, and
  `npm run build -w apps/web` all pass.
- `scripts/test-member-locations-rls.mjs` (6 tests) pass, including the new
  matrix: an adult reads all; a child reads only members who opted the children
  in; the default (no opt-in) hides from children exactly as before; who may set
  the audience — the sharer, a child's guardian/Admin, and refusals for a child
  themselves, a non-guardian adult, and an outsider.
- `scripts/test-setup-counts-rls.mjs` passes — the new policy uses set forms, no
  per-row helper.

## Open / needs a person

- **Live migration not yet applied.** `apply_migration` and `execute_sql` both
  timed out waiting for the approval prompt (background task, owner away). The
  change is **not live** until the SQL is run. It is behavior-preserving
  (adults-only) until a sharer opts in, so it is safe to apply before or after
  the deploy. SQL handed to the owner in the session reply; also retried on the
  post-merge deploy check.
- **Signed-in browser check pending the live migration.** The child-visibility
  save path needs the live column, so the end-to-end signed-in check (throwaway
  household, adult + child, confirm the child sees only opted-in locations) is
  pending the migration being applied live. The behaviour is covered by the RLS
  suite above; the control's rendering is covered by the production build.

## Where the code lives

Migration `supabase/migrations/20261029100000_member_location_visible_to_children.sql`;
core `packages/core/src/location/sharing.ts`; action `apps/web/app/(auth)/location-actions.ts`;
UI `apps/web/app/_components/location-audience-choice.tsx`, `apps/web/app/settings/location/page.tsx`,
`apps/web/app/family/page.tsx`; strings under `packages/core/src/i18n/messages/areas/{settings,help}/*`.
