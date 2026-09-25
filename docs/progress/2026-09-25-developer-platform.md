# Developer platform: scoped partner keys and a sandbox (story 18-008)

**Date:** 2026-09-25

## What was done
- **Keys** (`packages/core/src/developer/keys.ts`).
  - An Admin creates a key under Manage Household → Integrations →
    Developer access, and sees it once, with a copy button. Only the key's
    SHA-256 hash and a 13-character prefix are stored.
  - Format: `whk_live_…` or `whk_test_…`, followed by 40 characters from a
    CSPRNG (rejection-sampled, no modulo bias).
  - Scopes are picked from a fixed list and only ever narrow:
    `household.read`, `groceries.read`, `groceries.write`.
  - A key expires after 30, 90 or 365 days, or never. Revoking keeps the row.
  - Creating and revoking are audited (`developer_key.created` /
    `developer_key.revoked`) and catalogued as sensitive actions.
  - At most 10 active keys per household.
- **Sandbox.** A `whk_test_` key reads a fixed sample household and list, and
  writes nothing: an add answers `would_add`.
- **Endpoints**:
  - `GET /api/v1/partner/household` returns name, time zone and a member
    count, never names;
  - `GET /api/v1/partner/groceries` returns the list;
  - `POST /api/v1/partner/groceries` adds through `createConsumable`, the same
    service as the screen. A name already on the list comes back as
    `already_on_list`. It honours an Idempotency-Key, scoped to the key's
    household.

  Every key failure (missing, malformed, unknown, revoked, expired) is the
  same 401. Requests are rate-limited per key (`partner.request`, 120 a
  minute), and `last_used_at` is written at most once a minute. All three
  endpoints are in OpenAPI under a `partnerKey` bearer scheme.
- **Off by default.** Without `WONDERHOME_DEVELOPER_API=on`, no key is valid (the same 401 as any bad key) and the
  Integrations section is hidden.
- **Migration** `20261008090000_developer_api_keys`: the table is server-only
  through a deny-all policy (the repo's pattern). It was applied live, and
  `verify:live` passed 222/222.

## Verified
- Unit tests:
  - key shape, uniqueness, hash and prefix;
  - the Bearer parsing is strict;
  - expiry and revocation;
  - scope refusal;
  - off means the same 401;
  - every bad key is the same 401;
  - a sandbox key never touches the database.
- The DB suite: 540 tests pass, including the new
  `scripts/test-developer-keys-rls.mjs` (no session reads, writes, changes or
  deletes a key; shape and scopes are closed). OpenAPI test, typecheck and
  lint also pass.
- Browser at 360px and 1280px, on a QA household with the API on:
  - created a sandbox key and a live key;
  - both were listed, with no horizontal scroll;
  - revoking showed "Revoked".
- curl:
  - the sandbox key returned fixtures and `would_add`;
  - the live key returned the real household and added two items;
  - the same Idempotency-Key replayed the first answer;
  - a wrong key returned 401;
  - the revoked key returned 401.

## Still open / needs a person
- Turning it on in production (`WONDERHOME_DEVELOPER_API=on`) is a person's
  decision. Leave it off until there is a partner to give a key to.
- More scopes (bills, calendar) are follow-ups; each one is a new scope plus
  its endpoint.
