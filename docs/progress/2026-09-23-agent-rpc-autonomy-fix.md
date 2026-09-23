# Agent RPC schema fix: household autonomy actually takes effect

**Date:** 2026-09-23 · **Area:** agent platform, database, billing metering · **Type:** bug fix + security-reviewed enablement

## What was wrong

The application called three database functions by RPC —
`rpc("autonomy_for")`, `rpc("record_usage")`, `rpc("busy_windows")` — but
all three live only in the unexposed `wh` schema. PostgREST resolves RPCs in
`public` alone, so every call answered **404 / PGRST202** (confirmed live
before the fix: "Could not find the function public.autonomy_for").

Each caller failed closed, so nothing unsafe happened, but:

- the agent runtime (`ai/run.ts`) read every household's autonomy as
  `observe`: whatever a household set in Manage Household never took effect;
- usage metering (`billing/repository.ts` `consume`) silently recorded
  nothing;
- `family/repository.ts` `availability()` would have thrown (it has no
  runtime callers today).

Fixing that alone would have switched autonomy on, so the gates around it
were reviewed before the fix went live. That review found three more gaps:

1. `list.add_item` was classified as a `draft`, a kind that always executes
   whatever the autonomy setting, even though its executor writes a real
   grocery row. It is now a new `change` kind, which the outcome's autonomy
   governs.
2. Grocery steps carried no outcome key, so autonomy was looked up for a key
   nobody configures. Steps now carry `groceries.stocked`, the key a
   household sets in Manage Household.
3. An executor that threw left the run stuck as `running`. It is now caught
   and recorded as refused, and the run finishes.

## What changed

- **`supabase/migrations/20260924120000_public_rpc_wrappers.sql`**: adds three
  thin `public` wrappers. Each is `security definer` with `search_path = ''`
  and delegates to `wh.*` with no logic of its own. Explicit revokes undo
  Supabase's default EXECUTE-to-everyone.
  - `autonomy_for` and `record_usage` are granted to `service_role` only.
    `wh.autonomy_for` trusts its caller with the household id, and metering
    is the server's job.
  - `busy_windows` is granted to `authenticated` only. Its membership check
    reads the caller's own JWT.
  - `wh` stays unexposed. Live probe: `Accept-Profile: wh` returns PGRST106.
- **`packages/core/src/household/autonomy-lookup.ts`** (new): `lookupAutonomy`
  returns `observe` on an RPC error, timeout (3s), thrown client, null, or any
  value that is not exactly one of the four modes. It has no path to
  `execute` except a successful read of `"execute"`. Each lookup is logged
  with household_id, outcome_key, resolved_autonomy, lookup_success and
  lookup_error_category, allow-listed so nothing else is logged.
- **`ai/run.ts`**: reads autonomy through the admin client via the new lookup,
  after the membership check and the `ai.agent_runs` entitlement. Executor
  throws are caught.
- **`household/autonomy.ts`**: adds the `change` action kind.
- **`ai/tools.ts`**: `list.add_item` changes from `draft` to `change`.
- **`ai/specialists.ts`**: adds `GROCERIES_OUTCOME_KEY`, carried on every
  grocery step.
- **`billing/repository.ts`**: `consume` meters through the admin client (an
  optional `meter` override for tests). This file has no client-side
  importers.
- **`scripts/verify-live-project.mjs`**: four new live checks. The server
  resolves `autonomy_for` to `observe` when unconfigured, and anonymous
  callers are refused on all three wrappers.

## Verified

- `npm run verify`: exit 0.
  - Typecheck, lint, the migration/embed/boundary/secret lints, tracker and
    brand checks, security: all pass.
  - Unit tests: 2028/2028.
  - Script tests: 43/43.
  - DB/RLS: 413/413, including the new `scripts/test-rpc-wrappers-rls.mjs`
    (10 tests covering each mode, per-household isolation, the privilege
    matrix and the empty search_path).
  - Build: pass.
  - Playwright: 364/364.
- New unit tests:
  - `autonomy-lookup.test.ts` (12): A1–A4 and B1–B5, plus a thrown client
    and the log fields.
  - `run.test.ts` (12): D1–D5 and each mode through the whole pipeline.
  - `tools.test.ts`: `list.add_item` under each mode.
- Migration applied live via `apply_migration`. The privilege matrix read back
  from `pg_proc` is exact. `npm run verify:live`: 134/134.
- **Live end to end** on a QA household, triggered through the real signed-in
  `POST /api/v1/households/{id}/agents/run`. The seeded pet had one day of
  food left, so the groceries specialist planned `list.add_item "Milo · food"`.

  | Mode | What happened |
  |---|---|
  | observe (unconfigured) | refused, `autonomy_forbids`; 0 consumables |
  | approve | `awaiting_approval`; a "Waiting for your OK" notification; 0 consumables |
  | execute | `executed`; the consumable "Milo · food" was written; run `succeeded` |

- Member session probes:
  - `busy_windows`: 200.
  - `autonomy_for` and `record_usage`: 42501.
- Metering: one HomeTalk turn recorded `conversation.text = 1`.

## Still open

- `home.raise_service_request` is still classified as `draft` but has no
  executor (it reports "No automated action exists yet"). Reclassify it if an
  executor is ever added.
- Approving an agent step that is `awaiting_approval` has no in-app "approve
  and run" path yet. The approval is recorded as a notification only.
- Agent runs check the `ai.agent_runs` entitlement but do not meter it (this
  predates the fix).
- Metering now really records, which is a behaviour change. Plans with finite
  limits will start counting towards them from this deploy.

## QA cleanup

Ran after PR #117 and PR #118 merged:
- **Account:** QA account `7832775b-a358-4680-b044-b59132503078` deleted with `qa-test-user.mjs delete`.
- **Household:** QA household `5fce589b-6c93-4149-aade-cce47bf3eac4` deleted. Its rows were removed with it: 3 members, 2 pets, 1 consumable, 3 agent runs and 3 tool calls, 1 notification, 1 usage counter, and conversation and audit rows.
- **Stray accounts:** two accounts created by mistake (`5014daae-…`, `1b87ac0e-…`) were deleted immediately. The older QA account `42dc16e3-…` was deleted on request.
- **Local:** scratch scripts and screenshots removed, and no dev server left running.
- **Confirmed:** a SQL check finds no `qa-verify-*` user and no row in either household.

**Left in place:** two "Chakrabarty Family" households with no login members, `5024f9f5-d6e8-42d8-a5eb-44f42f04b5eb` and `4f8bb194-043a-4690-8340-00b9bb5dc076`. Nothing proves this session created them. Each can be removed with `delete from public.households where id = '<id>';` once someone confirms they are test data.
