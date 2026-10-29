# SEC-04: service-role least privilege, a typed wrapper and a lint

## What was done
- `@wonderhome/core/db/admin-context` adds `adminClientFor(grant, householdId?)` and `adminGrant.*`. A grant is minted from what an existing check returned (`requireMembership`, `requireHouseholdAdmin`, `requirePlatformAdmin`, a verified signature, a link token, the worker secret), carries the household it covers and a purpose, and is frozen and branded. `adminClientFor` refuses a grant scoped to another household. `householdAdmin` refuses a membership that is not an Admin.
- `scripts/lint-service-role.mjs` (`npm run lint:service-role`, CI step "Service-role lint") inventories every file that reaches the service role, counts raw `createAdminClient` uses (calls and the factory passed as a value, ignoring imports, comments and `typeof`), and fails on a raw use outside `security/service-role-baseline.json`, a count above an entry's `sites`, or a stale entry. Every entry has a class, a reason and a story. Tests: `scripts/lint-service-role.test.mjs` (a raw mutation in an unlisted file fails, the wrapper passes, the repository is clean) and `packages/core/src/db/admin-context.test.ts`.
- Documented the legitimate RLS-bypass set and the grant table in `docs/security/service-role.md`. Inventory: `docs/security/service-role-inventory.json`.
- Tranche 1 converted to the wrapper (35 call sites, 25 files): every platform-admin API route, the platform-admin careers page and actions, and the household API routes for plan, plan cancel, Gemini voice session/tool/transcribe, webhooks, smart-home sync, plus the grocery sign-in connect route.

## Before → after
| | Raw calls | Wrapped |
|---|---|---|
| Before | 143 | 0 |
| After | 108 | 35 |

Raw calls by class after: household-scoped 58 (to wrap, `SEC-04b`), signed-request 19, worker 9, shared-repository 8, secret-read 7, capability-token 5, rate-limit 1, audit-write 1.

## Open
- `SEC-04b`: the 58 household-scoped raw calls (Server Actions, pages, the HomeTalk turn/welcome/AMAF helpers, the conversation route), domain by domain. The conversation POST and `hometalk-turn.ts` need the membership returned from `homeTalkTurn` first.
- No migration, no data change, no paid feature.

## Verified
Core and web typecheck clean; ESLint on the changed web files clean; `node --test scripts/lint-service-role.test.mjs` (7 pass); vitest on `db/`, `openapi`, `csrf` and the careers actions; `lint:service-role`, `lint:boundaries`, `lint:boundaries:input` pass; `npm run build -w apps/web` and `check:bundle`.

## Needed from you
Nothing.
