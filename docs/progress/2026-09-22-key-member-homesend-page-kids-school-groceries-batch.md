# Key Member, HomeSend's own screen, Kids & School grouping, Groceries dropdowns

**Date:** 2026-09-22
**Area:** Family/identity, HomeSend, Kids & School Overview, Groceries add form

## What was done

A batch of seven product requests, implemented and shipped together:

1. **A household can name a Key Member.** `households.key_member_id` (new
   column, nullable, FK to `household_members`, same "must belong to this
   household" trigger shape as `owner_member_id`) — the person every other
   member's existing `relationship` text is described relative to. Admin-only
   (`setKeyMember` in `identity/households.ts`, gated by
   `isHouseholdAdmin`). Deliberately **not** an automatic kinship engine:
   `relationship` stays free text (the same reasoning the 20260921070000
   migration already gives for why it isn't an enum), so changing the Key
   Member re-anchors what "Relationship" *means* on the Family screen — a
   star badge, "· Key member" in the row subtitle, and the label becomes
   "Relationship to \<name\>" — but never rewrites anyone's own text; the
   household re-describes people by hand, same as typing it in the first
   place. `owner_member_id` (who administers the household) and
   `key_member_id` (whose perspective relationships are told from) are
   confirmed distinct concepts.
2. **HomeSend has its own screen**, `/home-send`, reachable from the
   secondary nav. A dashed drop zone (drag a file on desktop; tap "Choose a
   photo or file" everywhere, since drag has no phone equivalent) plus a
   paste-text toggle feed the same classify-then-confirm pipeline the
   composer's paperclip already used — `HomeSendConfirmStep`/
   `HomeSendConfirmFields` moved out of `home-send-sheet.tsx` into a shared
   `home-send-intake.tsx` so both callers use one form. Below the zone: a
   "Needs your review" inbox (received/classified items not yet confirmed)
   and a "Recently handled" list (routed/dismissed). This is a deliberate,
   explicitly-called-out exception to CLAUDE.md rule 13 ("one door, not
   two") — the rule's own text now says so, framed as a second *surface*
   for the one HomeSend pipeline, not a competing "Ask AI" shortcut, and
   the composer's paperclip is unchanged.
3. **Home & Upkeep's own follow-up remains separate** — this batch's Kids &
   School work is unrelated to that story; noted here only to avoid
   confusion with the similarly-named prior batch.
4. **Kids & School's Overview tab is chevron-expandable and grouped by due
   date.** "Deadlines at risk" now renders through the same
   `AgendaExpandableRow` Home & Upkeep and Groceries already use (renamed
   from `HomeAgendaRow` the first time a second domain needed it), grouped
   into Overdue/Today/Tomorrow/dated buckets via a new page-local
   `groupByDueDate()` (same pattern as Notifications' own `groupByDay()`).
   Due date is now **required** when creating or editing a piece of school
   work — enforced both client-side (the Due field's `required` attribute
   toggles with the `kind` select) and server-side (a Zod `.refine()` on
   both the create and update schemas) — except for a `notice`, which is a
   plain FYI with no deadline of its own to invent (rule 9: never show a
   date with no source).
5. **Groceries' add/edit form uses real dropdowns.** A new shared kit
   component, `ComboboxField` (`packages/core/src/components/ui/
   combobox-field.tsx`), replaces the `Field` + `<datalist>` hybrid for
   "What is it?", Category and "Counted in": a native `<select>` of the
   household's own existing values (plus a starting list for Category/Unit)
   ending in an explicit "+ Add new…" option, which swaps in a plain text
   field for a genuinely new value. Fixes a real gap `<datalist>` had
   (unreliable/invisible suggestion popovers on mobile Safari), not just a
   cosmetic change.
6. **Groceries' Overview and List cards are chevron-expandable.**
   Overview's "Smart insights" now uses `AgendaExpandableRow`; List's
   primary suggestion rows moved from flat `ActionRow` to `ExpandableRow`
   showing reason/evidence-basis/needed-by/estimated-cost behind the arrow.
   The horizontal "Suggested order" preview carousel was deliberately left
   as-is — it's a compact glanceable teaser leading to "Review order", not
   a card list, and converting it would break that intent.
7. Confirmed via code investigation (not re-implemented, since already
   shipped by an earlier session): events/exams already have full add/
   update/remove through the shared `school_items` CRUD (`kind: "exam"` /
   `"event"`), so no changes were needed there beyond the due-date
   requirement above.

## Where the code lives

- Key Member: `supabase/migrations/20260922050000_household_key_member.sql`,
  `packages/core/src/identity/schemas.ts` (`Household.keyMemberId`),
  `packages/core/src/identity/households.ts` (`setKeyMember`,
  `HouseholdRow`/`toMembership`), `packages/core/src/security/
  sensitive-actions.ts` (`household.updated` moved out of `NOT_YET_BUILT`
  into `SENSITIVE_ACTIONS`), `apps/web/app/(auth)/household-actions.ts`
  (`setKeyMemberAction`), `apps/web/app/_components/key-member-control.tsx`
  (new), `apps/web/app/_components/member-detail.tsx`,
  `apps/web/app/family/page.tsx`.
- HomeSend screen: `apps/web/app/home-send/page.tsx` (new),
  `apps/web/app/_components/home-send-inbox.tsx` (new),
  `apps/web/app/_components/home-send-intake.tsx` (new, shared confirm
  form), `apps/web/app/_components/home-send-sheet.tsx` (now imports the
  shared form), `apps/web/app/(auth)/home-send-actions.ts` (added
  `/home-send` to each action's `revalidatePath` calls),
  `packages/core/src/navigation/secondary-navigation.ts`,
  `packages/core/src/components/shell/primary-nav.tsx`,
  `apps/web/app/_lib/domain-icons.ts` (new `send` icon key in all three),
  `CLAUDE.md` (rule 13's exception, the HomeSend architecture paragraph).
- Kids & School grouping/required due date:
  `apps/web/app/school/page.tsx` (`groupByDueDate`, `AgendaExpandableRow`
  usage), `apps/web/app/(auth)/school-actions.ts` (Zod `.refine()` on both
  schemas), `apps/web/app/_components/school-forms.tsx` (`AddHomeworkForm`
  extracted so `kind` state can start fresh on remount instead of syncing
  via an effect), `apps/web/app/_components/school-item-controls.tsx`.
- Shared `AgendaExpandableRow`:
  `apps/web/app/_components/agenda-expandable-row.tsx` (renamed from
  `home-agenda-row.tsx`), used by `household/home/page.tsx`,
  `school/page.tsx` and `groceries/page.tsx`.
- Groceries dropdowns + chevrons:
  `packages/core/src/components/ui/combobox-field.tsx` (new),
  `apps/web/app/_components/commerce-forms.tsx`, `apps/web/app/groceries/
  page.tsx`.
- Design notes: `design/DESIGN-NOTES.md` (`ComboboxField`,
  `AgendaExpandableRow`, `HomeSendInbox`, `ExpandableRow`'s Groceries use).

## Verified

- `npm run verify` (typecheck, lint, lint:migrations, lint:embeds,
  lint:boundaries, lint:secrets, tracker --check, brand --check, security,
  test, test:db, build, test:e2e) — all clean; 97 unit test files/1344
  tests, 262 DB tests (3 new: a Key Member must belong to the household, an
  Admin can name and clear one, a non-admin cannot), 260 e2e tests.
- The `key_member_id` migration applied to the live project
  (`kqxndableyysxqhxiorz`) via the Supabase MCP `apply_migration` tool in
  this session; `npm run verify:live` — 77/77 (added a `households.
  key_member_id` check to `SHIPPED_COLUMNS`).
- **A genuine gap from the prior session's batch was also caught and
  fixed here**: `20260922040000_avatar_self_upload.sql` (the self-avatar-
  upload storage policies from the previous "upkeep-pets-profile-
  homebrain" batch) had been committed and merged but never actually
  applied to the live project — confirmed missing via a direct
  `pg_policies` query, then applied in this session alongside the new
  migration. A live household member's own avatar upload would have kept
  failing with a storage 403 until this was caught.
- **Live browser verification** against a seeded QA household (created via
  `node scripts/qa-test-user.mjs create`, deleted afterward; the household
  was given a `max` plan via `household_subscriptions` so School/Groceries
  entitlements were live for the check) at 390px and 1280px: the Key
  Member star badge and "Relationship to \<name\>" label on the Family
  screen; the HomeSend page's drop zone, paste flow, confirm step
  (including the no-AI-provider fallback path and native required-field
  validation), and its "Needs your review"/"Recently handled" inbox after
  a real paste-to-routed round trip; Kids & School Overview's "TODAY"
  grouping header and chevron row; the Groceries add form's three real
  `<select>` dropdowns (confirmed the "What is it?" options list is
  `["Choose what it is", "Milk", "+ Add new…"]`); the Groceries List tab's
  existing tracked-item chevron still expanding correctly.

## Still open

- The QA household's orphaned rows (household, members, school items,
  consumables, HomeSend items) were left in place after the auth user was
  deleted, consistent with the pattern prior QA sessions' notes describe —
  harmless residual test data, not linked to any real account.
- HomeSend's confirm step still has no automatic classification for this
  QA household (no AI provider configured), so the manual-fallback path is
  what live verification actually exercised end to end; the AI-classified
  path is unit/integration-tested (`ai/classify-intake.ts`) but wasn't
  re-verified live in this session since it was already verified when
  Phase C shipped.
- `SchoolItemDetail`'s inline `kind` select (in the update/edit panel) is
  local `useState(item.kind)` with no remount trigger, unlike the create
  form's now-extracted `AddHomeworkForm` — if a household edits an item's
  kind, saves, and immediately reopens the same still-mounted edit panel
  without navigating away, the Due-required hint could show stale
  kind-derived state until a real remount happens. Server-side validation
  (the Zod refine) is the authoritative check regardless, so this is a
  minor client-side polish gap, not a correctness bug.
