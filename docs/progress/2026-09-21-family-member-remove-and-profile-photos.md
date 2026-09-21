# Remove a family member from the Family tab, and profile photos

## What happened

Two more items from the same 14-item user-reported batch:

- Item 1: "in family tab, for each person, give option to edit their
  details, including their profile pictures." Editing text details already
  worked (`MemberProfileForm`, inside the `ExpandableRow` panel); profile
  pictures did not exist anywhere in the product.
- Item 2: "add option to remove a family member." The control already
  existed (`RemoveMemberControl`), but only on `/household/members`
  ("Manage Household" → "Members & roles") — not on the Family tab itself,
  where item 1 asked for it.

## What shipped

**Remove, on the Family tab itself.** `RemoveMemberControl` is now rendered
inside `MemberDetail`'s expanded panel (the same place `MemberProfileForm`
already sits), guarded exactly like the existing `/household/members` row:
not the household's owner, not the caller's own row, active status only.
`MemberDetail` gained a required `currentMemberId` prop for that guard —
made required rather than optional so a future caller can't silently skip
it and reintroduce a self-removal bug (a real risk here: the prop defaults
to `undefined`, and `member.id !== undefined` is always true, which would
have shown "Remove" on every row, including your own).

**Profile pictures**, end to end:
- `household_members.avatar_path` (migration `20260921090000`) — lives on
  `household_members`, not `profiles`, for the same reason
  nickname/relationship/occupation do: a child or a househelper with no
  account of their own has no `profiles` row to hang a photo off.
- A private `avatars` Storage bucket, one object per member at a
  deterministic path (`<household_id>/<member_id>`, no extension —
  `contentType` is set at upload time and served back from the object's own
  metadata, so re-uploading a different image type never leaves an
  orphaned old file at a different path). RLS policies on `storage.objects`
  gate by the first path segment: `wh.is_member()` for read, `wh.is_household_admin()`
  for write/delete — the same helper functions the rest of the schema
  already uses, so no new authorization primitive was needed.
- `avatar_path` is never handed to the client. `listMembers` mints a
  short-lived (1 hour) signed URL per member with photos, batched in one
  `createSignedUrls` call rather than one request per member, and that's
  the only form a photo URL ever takes outside the database.
- `updateMemberAvatarAction` / `removeMemberAvatarAction`
  (`household-actions.ts`): admin-gated, validate content type
  (jpeg/png/webp) and a 5MB cap before touching storage.
- `Avatar` (`packages/core/ui/avatar`) now takes an optional `imageUrl` and
  falls back to initials on a missing photo or a failed image load — never
  a placeholder face. Needed `"use client"` (an `onError` handler in a
  component's own output isn't allowed from a Server Component), so this
  is the first client-marked component in the shared avatar/pill/card tier.
- `MemberAvatarControl` (`_components/member-avatar-control.tsx`): a hidden
  file input that submits itself the instant a photo is chosen, plus a
  "Remove photo" pill that only appears once one exists — CLAUDE.md rule 12
  (add, update, *and* remove) applied to photos specifically, not just
  member records.

## Bugs found and fixed along the way

- **CSP blocked the photo entirely.** `img-src` was `'self' blob: data:` —
  never widened for the Supabase project origin, because nothing had ever
  needed to load an image from Supabase before. `connect-src` already
  computed `supabaseOrigin` for exactly this purpose; `img-src` just never
  used it. Fixed in `packages/core/src/security/headers.ts`.
- **`test:db` couldn't apply the migration.** `storage.buckets` /
  `storage.objects` don't exist on the bare `postgres:16` instance
  `scripts/setup-test-db.mjs` builds from committed migrations — they're
  Supabase-managed schemas, the same reason `auth.users`/`auth.uid()` are
  already shimmed there. Extended `supabase/tests/supabase-shim.sql` with a
  minimal `storage` schema (`buckets`, `objects`, `storage.foldername()`,
  RLS enabled) so the product migration's own `insert into storage.buckets`
  and `create policy … on storage.objects` run unmodified against both the
  shim and the real project.
- **The live migration itself needed one edit before it would apply.**
  `alter table storage.objects enable row level security` failed with
  `must be owner of table objects` — the migration role can create policies
  on `storage.objects` (the documented, supported pattern) but can't
  re-enable RLS that Supabase's own `supabase_storage_admin` already turned
  on. Removed that one statement from the migration (left a comment saying
  why) before applying; the shim above still runs it once, as the local
  superuser building the throwaway test database, since nothing else does
  in a bare Postgres instance.

## Verified

- `npm run verify:live`: 75/75 (added `household_members.avatar_path` to
  `SHIPPED_COLUMNS`, the standing guard against a migration file that never
  reached the live project — see the CI/testing-infra progress note from
  earlier this session for why that check exists at all).
- `npm run verify` clean: typecheck, lint (app + migrations + embeds +
  boundaries + secrets), tracker/brand checks, security suite, unit tests,
  239 DB/RLS tests (now including storage), production build, 256 E2E.
- Browser-verified against a live QA household: adding a child, opening
  their row on the Family tab, confirming both "Edit details" and "Remove"
  controls appear, removing them through the confirm sheet, and confirming
  directly against the live database that `status` flipped to `inactive`
  (same `deactivateMember` path the existing `/household/members` control
  already used) — and that the owner's own row never shows a remove
  control.
- The photo pipeline was verified past the point a screenshot in *this*
  particular sandbox can show: uploading actually wrote `avatar_path` and
  the correct bytes to storage (confirmed by capturing the live signed URL
  mid-run and fetching it directly — `200`, `image/png`,
  `content-length: 8091`, matching the test image); removing correctly
  cleared `avatar_path` and deleted the storage object. What *couldn't* be
  confirmed by eye here is the `<img>` actually painting a face instead of
  initials in the screenshot — Chromium in this container refuses the
  image load with `ERR_CERT_AUTHORITY_INVALID` while fetching the exact
  same origin that a plain server-side `fetch` (and the app's own
  sign-in/session calls) reach without issue, because only the server-side
  Node process in this sandbox is configured to trust its outbound MITM
  proxy's CA — the Chromium instance Playwright launches is not. This is a
  property of the test container, not the app; a real browser trusts a
  real CA for the Supabase origin the same way it already does for every
  other request this app makes.

## What's still open

- The remaining items in the 14-item batch (Kids & School homework
  import/CRUD/expand, events & exams CRUD, Groceries dropdown suggestions)
  are tracked separately.
- No backlog story number maps to this work — household-reported UI/UX
  polish, not a scheduled story.

## Where the code lives

- `supabase/migrations/20260921090000_household_member_avatar.sql`
- `supabase/tests/supabase-shim.sql` — storage schema shim
- `packages/core/src/identity/households.ts` — `avatarUrl`/`avatarPath`,
  `listMembers`'s signed-URL batching
- `packages/core/src/components/ui/avatar.tsx` — `imageUrl` prop, client
  component
- `packages/core/src/security/headers.ts` — `img-src` fix
- `apps/web/app/(auth)/household-actions.ts` —
  `updateMemberAvatarAction`/`removeMemberAvatarAction`
- `apps/web/app/_components/member-avatar-control.tsx`
- `apps/web/app/_components/member-detail.tsx` — wires in both the remove
  control and the avatar control
- `scripts/verify-live-project.mjs` — `avatar_path` added to `SHIPPED_COLUMNS`
