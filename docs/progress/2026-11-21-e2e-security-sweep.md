# Full E2E run and security sweep (2026-11-21)

Asked by the owner: the full Playwright suite plus every security check the repo has.

## Full E2E (`e2e-nightly.yml`, dispatched on `main` at `0f9abd8`, run 44796124073)

379 passed, 3 failed, 20 skipped. Both causes were drift from merges on 2026-11-20, fixed here:

- `domains.spec.ts` › every endpoint is in the OpenAPI document: `POST /households/{householdId}/export/full`
  (Download full data, #576/#578) had no entry. Added, with its step-up, rate limit, health-password and
  status codes (`packages/core/src/api/openapi.ts`).
- `help.spec.ts` › the HomeSend checks (14-062): #564 rewrote the guide's HomeSend paragraph on questions and
  dropped the UI label the HomeSend row still shows ("1 question waiting in HomeTalk"). The guide names it
  again, in all eight languages; section `updated` moved to 2026-11-21.

Both specs pass locally (`npm run test:e2e -- e2e/help.spec.ts e2e/domains.spec.ts`).

## Security checks (all on `main` at `0f9abd8`)

| Check | Result |
|---|---|
| `npm run security` (P0 suite) | pass, 12/12 areas |
| `npm run test:db` (all `test-*-rls.mjs`, local Postgres 16 from every migration) | 897 pass, 0 fail, 3 skipped (pgvector / Vault not in plain Postgres) |
| `lint:service-role`, `lint:boundaries`, `lint:boundaries:input`, `lint:migrations`, `lint:secrets`, `lint:embeds`, `test-setup-counts-rls.mjs` | pass |
| `apps/web/*.test.ts` gates (cache headers, client writes, middleware matcher) | 9/9 pass |
| 40 security-named unit test files (auth, permissions, route policy, injection, step-up, consent, privacy, sender trust, health filers, webhooks) | 550/550 pass |
| `npm run check:bundle` after a production build | pass |
| `npm run eval` (deterministic) | 467/467; Unsafe Action Rate 0/82; security, privacy, voice gates pass |
| gitleaks 8.24.3, whole history with `.gitleaks.toml` | 28 hits on `main`, all test fixtures (generated test keys, fake tokens); 1 planted fake AWS key on `scratch/secret-gate-proof` only |
| `npm audit --omit=dev` | 0 vulnerabilities |

No high or critical finding. Open, low: a whole-history gitleaks scan (not what CI runs, which scans the pushed
range) flags the fixtures; allowlisting those paths would keep a manual full scan quiet. The
`scratch/secret-gate-proof` branch can be deleted by the owner.

Not read: open CodeQL alerts (the GitHub tools in the session have no code-scanning reader).

Cleanup: no QA users or households were created; the local Postgres and build output stay in the container only.
