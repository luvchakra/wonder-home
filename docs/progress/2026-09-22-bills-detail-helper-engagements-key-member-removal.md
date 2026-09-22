# Bills & Finance detail, multi-engagement househelpers, and Key Member removal

**Date:** 2026-09-22
**Trigger:** The third batch (items 16–20) of the user's grouped 22-item UI/UX review — following the sidebar/setup-wizard batch (PR #98) and the responsibilities/school/groceries/meals batch. Two research agents checked current state before editing: Home & Upkeep (item 19) turned out to already be fully built.

## What was found already done (no code change)

- **Item 19, Home & Upkeep chevron cards with full detail**: `apps/web/app/household/home/page.tsx` already used `AgendaExpandableRow` uniformly across all four sections (Maintenance, Service requests, Laundry, Pets) — confirmed by direct code read, no gap to close.

## What was built

**Item 16 — Bills & Finance Overview: full chevron coverage.** The "Upcoming bills" section already used `ExpandableRow`; only the "Worth a look" (anomalies) section still used the older `AgendaRow`. Swapped it to `AgendaExpandableRow` (`apps/web/app/bills/page.tsx`) so every card on Overview now opens to full detail, matching the pattern already used elsewhere.

**Item 17 — Bills & Finance Transactions tab: richer, detailed entries.** Transactions previously rendered as flat `ActionRow`s. Added a new `TransactionRow` component (mirrors `BillRow`'s `ExpandableRow` + `Fact` pattern) showing Period, Amount, Kind, and Payee behind a chevron, plus a `RemoveTransactionControl` (admin-gated `ConfirmationSheet`, following the `RemoveResponsibilityControl` precedent) — completing CLAUDE.md rule 12's add/update/remove requirement for transactions (add and record already existed; remove did not). New `removeTransaction()` in `packages/core/src/finance/repository.ts`, `removeTransactionAction` in `apps/web/app/(auth)/finance-actions.ts`.

While in these files for item 17, found and fixed a standing violation of CLAUDE.md rule 22 (money is always decimal): the obligation and transaction forms collected `amountMinor` as a raw paise integer with an "in paise" hint. Changed both to a decimal `amount` field (`step="0.01"`), converting to minor units only at the repository boundary (`toMinorUnits()` = `Math.round(amount * 100)`) — in scope because it's the same files, the same rule I'd authored in an earlier batch of this session, and directly adjacent to the transaction work.

**Item 18 — Househelper: multiple engagements for an existing helper.** Root cause was a single `unique (member_id)` constraint on `helper_profiles`, modeled on the pattern already fixed for Groceries earlier in this session. New migration `20260922180000_helper_profiles_multiple_engagements.sql` drops `helper_profiles_member_id_key` (applied live, confirmed via `npm run verify:live`, 111/111). Replaced the old upsert-only `saveHelperProfile` with `createHelperEngagement`/`updateHelperEngagement`/`removeHelperEngagement` (`packages/core/src/household/helpers-repository.ts`), matching actions (`apps/web/app/(auth)/helper-actions.ts`), and forms (`AddHelperEngagementButton`, `HelperEngagementRowControls` with edit sheet + remove `ConfirmationSheet`, `apps/web/app/_components/helper-forms.tsx`). The Househelper page (`apps/web/app/househelper/page.tsx`) now lists every engagement a helper has, not just one, with the summary line reading "N engagements" once there's more than one.

**Item 20 — Family: remove the Key Member designation, rename "relationship" to "Family calls me".** A dedicated research agent confirmed there is no computed-relationship engine behind Key Member — it was purely a UI label/badge, so removing it cannot break any relationship computation. Deleted `key-member-control.tsx` entirely, removed the `⭐`/"Key member" badge and its props from `apps/web/app/family/page.tsx` and `apps/web/app/_components/member-detail.tsx`, removed `setKeyMemberAction`/`keyMemberSchema` from `household-actions.ts`, and removed `setKeyMember()` from `packages/core/src/identity/households.ts` (no other callers). Renamed the "Relationship" field to "Family calls me" everywhere it's a user-facing label (`member-profile-form.tsx`, `member-detail.tsx`'s `Fact` row). Deliberately left in place, as a risk-minimizing scope decision: the `households.key_member_id` DB column, its FK and consistency trigger, and the `keyMemberId` field on the `Household`/`HouseholdMembership` TypeScript types — the column is now simply unread/unwritten by the app, dropping it is a separate destructive-migration decision the ask didn't require, and touching the type would have rippled into out-of-scope test files.

Removing `setKeyMember()` also removed the sole emitter of the `household.updated` audit event, which the `sensitive-actions.ts` coverage test (`sensitive-actions.test.ts`) checks by grepping the file named as its source for the event string. Moved `household.updated` from `SENSITIVE_ACTIONS` to `NOT_YET_BUILT` with an honest reason (no household-level setting is currently editable) rather than leaving a broken promise in the audit catalogue.

## What was verified

- `npm run verify` — typecheck, lint, migration/embed/boundary/secrets lints, tracker/brand checks, security suite, unit tests (77/77 in the updated `sensitive-actions.test.ts`), `test:db`, production build, 344/344 e2e — all green.
- Migration applied to the live Supabase project (`kqxndableyysxqhxiorz`) via the Supabase MCP `apply_migration` tool, confirmed with `npm run verify:live` (111/111 checks).
- Live browser verification with a temporary QA household (upgraded to the `pro` plan and seeded with a bill, a transaction, and a helper via direct SQL to exercise entitlement-gated screens):
  - Bills Overview and Transactions rows both expand to full detail (Period/Amount/Kind/Payee); amounts display and the "Add transaction"/"Add a bill" forms collect decimal values (`2500`, not `250000`); a seeded transaction was removed via the new control and the chevron detail confirmed the fields.
  - Househelper: seeded a helper with two engagements directly in Postgres (proving the constraint is really gone), then through the UI added a third engagement, edited none, and removed one via the `ConfirmationSheet` — the engagement count and each engagement's own edit/remove controls updated correctly at every step, with no page reload needed to see the new count.
  - Family: no "Key Member" text or `⭐` badge anywhere on the page or in the expanded member detail; the edit sheet shows "Family calls me", accepted "Mother", and the value persisted across a fresh page load.
  - QA household, its seeded rows, and the auth user were all removed afterward.

## What's still open

- Item 19 needed no code change; nothing new to track for it beyond confirming it holds.
- The `households.key_member_id` column/FK/trigger and the `keyMemberId` type field remain in the schema and types, unread by any UI path now that the designation control is gone — a candidate for a future cleanup migration if the household ever wants that surface fully retired, not required by this story.

## Where the code lives

- `apps/web/app/bills/page.tsx`, `apps/web/app/(auth)/finance-actions.ts`, `apps/web/app/_components/finance-forms.tsx`, `packages/core/src/finance/repository.ts` — items 16 and 17.
- `supabase/migrations/20260922180000_helper_profiles_multiple_engagements.sql`, `packages/core/src/household/helpers-repository.ts`, `apps/web/app/(auth)/helper-actions.ts`, `apps/web/app/_components/helper-forms.tsx`, `apps/web/app/househelper/page.tsx` — item 18.
- `apps/web/app/_components/member-detail.tsx`, `apps/web/app/_components/member-profile-form.tsx`, `apps/web/app/family/page.tsx`, `apps/web/app/(auth)/household-actions.ts`, `packages/core/src/identity/households.ts`, `packages/core/src/security/sensitive-actions.ts` — item 20.
