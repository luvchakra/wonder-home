# The service role: who may bypass RLS, and how (SEC-04)

The service-role client (`createAdminClient()`, `packages/core/src/db/admin.ts`) bypasses Row Level Security. Server-side authorization is authoritative, so every use must be able to name the decision it relied on.

## The rule
- New code reaches the service role through `adminClientFor(grant)` from `@wonderhome/core/db/admin-context`. The grant is minted from the evidence an existing check returned:

| Grant | From | Covers |
|---|---|---|
| `adminGrant.member(membership, purpose)` | `requireMembership` | that household |
| `adminGrant.householdAdmin(membership, purpose)` | `requireHouseholdAdmin` (refuses a non-Admin membership) | that household |
| `adminGrant.platformAdmin(actor, purpose)` | `requirePlatformAdmin` (and the role guards built on it) | all households |
| `adminGrant.signedRequest(sender, purpose, householdId?)` | a verified webhook signature or shared secret | the household the payload names, or all |
| `adminGrant.capabilityToken(tokenPurpose, purpose, householdId?)` | a verified single-purpose link token | as given |
| `adminGrant.worker(job, purpose, householdId?)` | the worker secret on a scheduled job | as given |

- `adminClientFor(grant, householdId)` refuses (`AdminGrantScopeError`) a grant scoped to a different household. Pass `householdId` whenever the operation targets one household and it did not come from the same membership.
- `npm run lint:service-role` (CI step "Service-role lint", `scripts/lint-service-role.mjs`) fails a raw `createAdminClient` use, a call or the factory handed on as a value, in a file not listed in `security/service-role-baseline.json`, more raw calls in a listed file than its entry allows, and a stale entry. The list only shrinks.
- `docs/security/service-role-inventory.json` is every file that reaches the service role, with raw and wrapped counts, whether it writes, and its class (`node scripts/lint-service-role.mjs --inventory` rewrites it).

## The documented RLS-bypass set (stays raw)
| Class | Why the service role is the design |
|---|---|
| `audit-write` | The audit log is append-only and no member may write it. |
| `secret-read` | A household secret (AI keys, webhook signing secrets, step-up codes, the careers key) that RLS hides from every member. |
| `signed-request` | Webhooks and token endpoints: no session; the sender's signature or shared secret is the authorization. |
| `worker` | Scheduled or queued jobs on the worker secret; they span households by design. |
| `capability-token` | Public links (email-off, invitations) whose token is the authorization. |
| `rate-limit` | The rate-limit counter table, which no member can write. |
| `shared-repository` | Core repositories whose callers authorize first; they never pick the household themselves. |

## Still to wrap
Entries with class `household-scoped` (story `SEC-04b`) are signed-in member paths: Server Actions, pages and HomeTalk helpers. Each moves to `adminGrant.member` / `householdAdmin` in tranches by domain; the HomeTalk turn and the conversation route need the membership returned from `homeTalkTurn` first.
