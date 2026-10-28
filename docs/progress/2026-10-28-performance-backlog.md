# Performance backlog from the 2026-10-28 audit

Works through "Backlog" in [2026-10-28-performance-audit.md](2026-10-28-performance-audit.md), one PR per item. Each section says what changed, the numbers before and after, and what was verified.

## B1: the last per-row policy helpers in set form

**Migration:** `supabase/migrations/20261028190000_policy_helpers_set_form.sql`.

What it does:
- Adds six set-form helpers, each `security definer`, granted to `authenticated` only:
  - `wh.role_households(roles)`
  - `wh.finance_households()`
  - `wh.my_household_children()`
  - `wh.my_health_consents()`
  - `wh.my_participant_events()`
  - `wh.my_visible_events()`
- Rewrites every policy in place (`alter policy`) that called one of these per-row helpers: `may_see_health`, `may_see_event`, `is_event_participant` (2 more, on `family_events`), `is_child_of`, `has_role` or `may_see_finance`.
- Also rewrites the `is_member`, `is_household_admin` and `member_id` calls on `storage.objects`.
- The migration header gives the branch-by-branch equivalence.
- It fails if any policy, in any schema, still calls a per-row `wh` helper.
- The old helpers stay for non-policy callers.

**Guard:** `scripts/test-setup-counts-rls.mjs` now checks every schema, not only `public`, and lists all eleven per-row helpers.

**Live equivalence** was checked on the live project inside one transaction that rolled back:
- The check applied the migration, then compared every changed policy's old and new `using` and `with check` expressions, row by row, across every row of the table.
- It ran for each of the 6 active profiles plus one outsider.
- 56 policies were rewritten. Of the 476 expression comparisons, 0 differed; 516 rows were true under the new expressions.
- This is stricter than comparing visible counts, because it covers the write checks as well as the reads.

**Timing on the live project**, as `authenticated` with a Head's JWT claims:
- One household with 3,000 synthetic rows in each table, rolled back.
- Each figure is the best of 3 runs of `select count(*)`.

| Table | Rows visible | Before | After |
|---|---|---|---|
| `health_vitals` | 3,000 | 711.7 ms | 1.5 ms |
| `family_events` (participants-only) | 3,006 | 355.6 ms | 5.5 ms |
| `event_participants` | 3,000 | 1,271.1 ms | 10.9 ms |
| `obligations` | 3,003 | 2.0 ms | 1.3 ms |

**Verified locally:**
- `test:db` on a fresh local database with every migration applied: 789 tests, 788 pass, 0 fail, 1 skipped.
- `lint:migrations` passes on all 191 migrations.

**Live:** not yet. `apply_migration` times out in cloud sessions, so the owner runs the file in the SQL Editor.
- Then check with `select count(*) from pg_policies where coalesce(qual,'')||coalesce(with_check,'') ~ 'wh\.(may_see_health|may_see_event|is_event_participant|is_child_of|has_role|may_see_finance|is_member|is_household_admin|member_id|may_see_child|may_change_child)\(';`. It should return 0.
- Then run `npm run verify:live`.
- No code reads a changed value, so the migration is safe before or after any deploy.

**QA cleanup:** no QA accounts or households were created. Every synthetic row was inside a rolled-back transaction.
