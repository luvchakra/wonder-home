# SEC-03: Zod coverage of input boundaries, and a lint that keeps it

## What was done
- `scripts/lint-input-boundaries.mjs` inventories every route handler (`apps/web/app/api/**/route.ts`, per HTTP method) and Server Action (`'use server'` files, per exported function), classifies each as validated / partial / not-validated / delegated / no-input, and writes `docs/security/input-boundary-inventory.json` (`--inventory`). It recognises `defineRoute({ input })`, `.safeParse/.parse`, `parseQuery`, `formUuid/formText`, signature-verified envelope readers, and a validating helper in the same file (one level).
- `npm run lint:boundaries:input` (CI "Input boundary lint" step, next to `lint:boundaries`; also in `verify`) fails a handler or action that reads a body, query or form with no schema parse and is not in `security/input-boundary-baseline.json`. Every baseline entry needs a `reason` and a `story`; a stale entry also fails, so the list only shrinks. Tests: `scripts/lint-input-boundaries.test.mjs` (a fixture without validation fails, with passes).
- New shared pieces: `@wonderhome/core/api/query` (`parseQuery`, a 400 in the standard envelope naming the field, never the value) and `apps/web/app/_lib/form-input.ts` (`formUuid`, `formText`), each with tests.
- Fixed (schemas with caps, `.strict()` on queries): HomeTalk conversation search `?q`, voice `?language`, plan `?to`, five integration `sync` routes `?provider`, platform-admin `ai-quality`, `homesend-metrics`, `payments`, `voice-metrics` (`days`/`hours` ranges), `privacy-requests` filters (enums, uuid), `email-off` unsubscribe link (route and action), OAuth voice `token` form (every field capped), PWA share target form, phone sign-in steps, voice/Gemini key save and remove, voice-link revoke/authorize fields, notification preference and quiet-hours ids, HomeSend upload household id, careers apply/withdraw and key save, guide questions.

## Before → after (handler or action that takes input; no-input excluded)
| | Validated | Partial | Not validated | Delegated |
|---|---|---|---|---|
| Route handlers (144 methods) | 54 → **70** | 12 → 11 | 16 → **1** | 7 |
| Server Actions (311 functions) | 271 → **287** | 0 | 35 → **19** | 0 |

## What remains, and why
- 20 baselined (all story `SEC-03b`): `email-off` GET (redirect-only, its action validates), `signInWithGoogle` (only `next`, via the same-site allowlist), `signOut` (reads nothing), 5 locale actions and `catalogDishLinesAction` (closed lists checked by hand-written readers), 11 onboarding actions (children's data; convert first).
- 11 route GETs "partial": the health list routes and `platform-admin/subscriptions/[householdId]` filter `status`/`vitalType` against allowlists but do not UUID-check `memberId` or cap `limit`. Not failing the lint; convert to `parseQuery` in SEC-03b.
- 7 "delegated": billing webhooks, the HomeSend email webhook, WhatsApp, Alexa, and others verify a signature, cap the body, then read the payload with hand-written extractors (not Zod). Convert to schemas in SEC-03b.
- Path params (`householdId` and the like) are checked by membership/RLS, not by Zod. Out of this PR.
- The `defineRoute` wrapper's body validation is unchanged; an out-of-range `days`/`hours` now answers 400 where it used to be clamped.

## Verified
Core and web typecheck clean; ESLint on changed files clean; vitest on the touched areas (1024 tests) and the new tests; `node --test scripts/lint-input-boundaries.test.mjs`; the lint passes; `npm run build -w apps/web`.

## Needed from you
Nothing.
