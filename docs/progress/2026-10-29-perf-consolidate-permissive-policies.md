# PERF-02 — Consolidate the 63 overlapping permissive RLS policies

**Date:** 2026-10-29 · **Plan:** `docs/plans/2026-10-29-fast-and-secure-at-scale.md` (PERF-02)
**Branch/PR:** `perf/consolidate-permissive-policies`

## What was done

The Supabase performance advisor reported **63 `multiple_permissive_policies`**
findings: for one `{table, role, command}`, two or more permissive policies
were OR-evaluated. Postgres already OR's permissive policies, so these were a
policy-count / planner-bookkeeping smell, not a behaviour difference — but the
advisor is a standing gate (PERF-17) and the extra policy objects add planning
work that grows with policy count and on write paths.

Each flagged group is now **one permissive policy per `{table, authenticated,
command}`** whose `USING` / `WITH CHECK` is the exact `OR` of the originals,
split out of the old `FOR ALL` write policies into explicit per-command
policies. The row set each role may read or write is **unchanged**.

- **56 tables** consolidated, across 5 table-group migrations (each small and
  individually revertible; rollback DDL is in each file as comments):
  - `20261029150000_perf02_consolidate_finance_commerce.sql` — budgets, policies,
    purchase_policies, payment_intents, orders, order_items, obligations,
    obligation_history, obligation_periods, gift_plans, service_requests
  - `20261029160000_perf02_consolidate_home_assets_work.sql` — home_assets,
    asset_service_events, backup_services, responsibilities, routines,
    playbook_items, playbook_dependencies, connections, integrations,
    integration_identities, portal_scrape_urls
  - `20261029170000_perf02_consolidate_food_pets.sql` — consumables,
    consumable_purchases, cart_suggestions, food_preferences, laundry_needs,
    meals, meal_ingredient_needs, meal_week_plans, meal_week_template_options,
    recipes, recipe_ingredients, pets, pet_care_needs, pet_preferences, usda_foods
  - `20261029180000_perf02_consolidate_calendar_events.sql` —
    calendar_subscriptions, event_exceptions, event_participants,
    availability_exceptions, member_availability, study_sessions
  - `20261029190000_perf02_consolidate_members_identity.sql` — household_members,
    profiles, member_locations, member_location_sharing, notification_preferences,
    reminder_preferences, household_voice_settings, helper_profiles,
    health_consents, school_communications, school_documents, school_enrolments,
    school_items

- The set-form helpers are preserved verbatim (`x in (select
  wh.member_households())`, `(select auth.uid())`, …). No function body changed.
  No per-row helper reintroduced (asserted by the new test and
  `test-setup-counts-rls`).

### Transformation rule (how a group is merged)

For each command the planner applies to a policy (`FOR ALL` covers all four; a
`NULL WITH CHECK` on INSERT/UPDATE falls back to `USING`), the merged policy is:

- `SELECT` → `USING` = OR of every applicable policy's `USING`.
- `INSERT` → `WITH CHECK` = OR of every applicable `WITH CHECK` (`?? USING`).
- `UPDATE` → `USING` and `WITH CHECK` each the OR of the applicable ones.
- `DELETE` → `USING` = OR of the applicable ones.

Operands are de-duplicated and sorted so the artifact is reproducible.

### Two special cases

- **`event_participants`** keeps its **restrictive** `event_participants_event_visible`
  policy untouched (restrictive policies AND, they are not part of the OR and the
  advisor doesn't flag them). The three permissive policies merged normally.
- **`usda_foods`** is the one group that is not a plain OR: its
  `anon+authenticated` deny-all (`USING false`) overlapped the authenticated
  `SELECT` policy for role `authenticated`. Since `false OR x ≡ x`, the migration
  **drops the deny-all** rather than OR-ing in `false`; anon and all writes stay
  denied by absence of any policy (RLS default-deny), the authenticated read is
  unchanged. Proven structurally in the test.

Nothing was left un-consolidated: every one of the 63 flagged groups is cleared.

## Equivalence proof (zero access change)

New standing test **`scripts/test-policy-consolidation-rls.mjs`** (runs under
`npm run test:db`). It builds one database from the migrations **without** the
perf02 files ("before") and one **with** them ("after"), and proves equivalence
three ways:

1. **Predicate equivalence over every `{table, role, command}`** (all rows, all
   roles): the single "after" policy's predicate, after Postgres's own
   normalisation, is identical to the OR of exactly the "before" policies that
   applied to that command — same command applicability and `NULL WITH CHECK`
   fallback the planner uses. A dropped branch, wrong command, changed role or
   stale migration file fails here.
2. **Advisor-clean assertion**: zero `{table, role, command}` groups with >1
   permissive policy remain (public + wh), and no consolidated policy
   reintroduces a per-row helper or bare `auth.uid()`.
3. **Concrete before/after probe**: identical data seeded into both databases,
   then visible row-id sets and insert/update/delete allow/deny compared per
   role (admin, non-admin adult, outsider, anon) on representative tables
   (budgets, consumables, connections). Catches a wrong rule, not just a
   mis-encoded migration.

The existing P0 RLS suite (every `scripts/test-*-rls.mjs`, including the SEC-10
coverage gate and `test-setup-counts-rls`) is the comprehensive per-table
access-matrix safety net and stays green against the consolidated schema.

## Verified

- `npm run test:db` (full suite): **814 pass, 0 fail, 1 skipped** (the pgvector
  meaning test, no pgvector installed locally — same as CI when absent).
- New equivalence test: **9/9 pass**.
- `npm run lint:migrations`: passed (202 migrations).
- Advisor-equivalent overlap query on the consolidated schema (public + wh):
  **0** groups.

## Numbers

- **Advisor `multiple_permissive_policies`: 63 → 0.** Before = the live advisor
  count; after = 0, verified locally by replicating the advisor's logic
  (per `{table, role, command}` permissive-policy count, `FOR ALL` expanded to
  all four commands) against a database built from the migrations. To be
  re-confirmed with `get_advisors` on the live project after apply.

- **EXPLAIN (ANALYZE, BUFFERS)** as `authenticated` (admin member), 20 000 rows
  per table, `select count(*)`, median of 15 interleaved trials (ms), local
  Postgres 16:

  | table | before | after | plan |
  |---|--:|--:|---|
  | budgets | 5.37 | 6.44 | identical |
  | consumables | 5.31 | 6.06 | identical |
  | connections | 4.54 | 5.25 | identical |
  | gift_plans | 5.32 | 6.42 | identical |
  | home_assets | 5.57 | 7.13 | identical |
  | obligations | 5.26 | 6.96 | identical |

  **The query plans are byte-identical before and after** — same cost
  (`620.03`), same filter (`(hashed SubPlan 1) OR (hashed SubPlan 2)`), same
  buffer counts. Postgres already compiles multiple permissive policies for a
  command into a single OR'd filter with shared SubPlans, so the executed read
  path is unchanged. The wall-clock column is within measurement noise on this
  contended container: a **before-vs-before control** on the same schema varied
  5.33 → 5.80 ms (≈9%), the same band as the before/after spread, and the plan
  identity (cost + filter + buffers) is the deterministic evidence that
  execution is equal. This meets the acceptance "equal or better time" for the
  read path while clearing the advisor; the policy-count reduction also lowers
  planning work and write-path `WITH CHECK` evaluation, which compound at scale.

## Left alone (and why)

- Restrictive policies (`event_participants_event_visible`) — not permissive,
  not flagged, AND-combined; untouched.
- Non-`authenticated` policies and any table the advisor did not flag.
- Function bodies and the set-form helpers.

## Open / needs a person

- Apply the 5 migrations to the live project (`wonderhome`,
  `kqxndableyysxqhxiorz`) after CI is green, then `get_advisors` (security +
  performance) to confirm `multiple_permissive_policies` → 0 and no new finding.
  There is no `apps/web/.env.local` in this session, so `verify:live` and a QA
  smoke-test were not run; equivalence is carried by the before/after tests and
  the full RLS suite.

## Where the code lives

- Migrations: `supabase/migrations/20261029{15,16,17,18,19}0000_perf02_consolidate_*.sql`
- Test: `scripts/test-policy-consolidation-rls.mjs`

## Needed from you

**Nothing required up front.** I apply the 5 migrations to the live `wonderhome`
project myself with the pre-authorised `apply_migration` tool, in the scheduled
merge check right after PR #483 merges, then confirm with `get_advisors`.

Fallbacks, only if they come up:

- **If `apply_migration` repeatedly fails or times out:** I'll hand you the 5
  migrations as one copyable SQL block to run by hand — Supabase dashboard →
  project `wonderhome` → SQL Editor → paste → Run. Confirm it ran: the editor
  reports success, and re-running the **performance** advisor (dashboard →
  Advisors → Performance) shows **0** `multiple_permissive_policies`.
- **Optional, not required by this PR:** for the PERF-17 advisor workflow to
  check the live project instead of skipping, the repo needs the
  `SUPABASE_ACCESS_TOKEN` secret (GitHub → repo **Settings → Secrets and
  variables → Actions → New repository secret**; value = a personal access
  token from supabase.com/dashboard/account/tokens). This is a pre-existing
  PERF-17 item, not introduced here.
- **No decisions and no dashboard toggles are needed for this change.**
