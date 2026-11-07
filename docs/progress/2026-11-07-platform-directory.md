# Platform admin: account-level lists behind Households & people (2026-11-07)

Owner request: tapping a tile or a "By plan" row shows the actual data. Owner chose the privacy level: **account level only**.

## Done
- `/platform-admin/households` tiles and plan rows open `/households/all` (filter `?plan=`, search by name, 25 a page), `/households/people` (name, role, Admin, household, sign-in email, last sign-in, account state; search name/email), `/households/grants` and a read-only `/households/[id]` (account fields and its people). Never bills, health, chats, HomeSend, events, addresses, phones, locations.
- Owner only. Staff of any other role keep the totals page (no links, old subtitle). Every route re-checks (`platformOwner()`), and every database function re-checks the actor is an active platform owner.
- Reads are service-role-only security-definer functions (`platform_directory_*`, `platform_plan_breakdown`), called via `adminClientFor(adminGrant.platformAdmin(...))`. Each list/detail view writes one `audit_events` row (`platform.households_viewed` / `platform.people_viewed`; filters and page, search as a yes/no, never rows or emails). Pages are `force-dynamic`; nothing cached.
- **Counts:** 9 households live (not 10 in the screenshot; the owner's count may include one since removed), 3 subscription rows, so 6 households had no plan record. Billing treats "no row" as Free (`billing/account.ts`), so the breakdown now counts them in Free and says "N of these have no plan record yet". Plans now add up to households.
- Migration `20261108000000_platform_directory.sql` (new functions and two indexes only; safe in either order), applied to `wonderhome` via Supabase MCP (it registers under the MCP's own timestamp).
- Test shim `supabase/tests/supabase-shim.sql` gained `auth.users.last_sign_in_at` (Supabase has it).

## Verified
`scripts/test-platform-directory-rls.mjs` (5 pass: anon/member/staff session refused, service role refused for non-owner, allowed columns only, audit row per view without rows, plans sum to households), `packages/core/src/platform/directory.test.ts`, typecheck, `lint:service-role`, `check:bundle`, cache-headers/client-writes gates, `next build`.

## Open / needs a person
- No `apps/web/.env.local` in this cloud container, so the 360 px `ui-check` with a QA owner was **not** run; do it once locally (`node scripts/ui-check.mjs /platform-admin/households/all`). No QA data was created, so none to clean up.
- Help/privacy copy: grepped; nothing promises "totals only" for platform staff, so no help words changed.
- The two empty households (`0672e19c…`, `8c5ff19b…`) were not touched.

Code: `packages/core/src/platform/directory.ts`, `apps/web/app/platform-admin/households/**`, `apps/web/app/platform-admin/_ui/directory.tsx`.
