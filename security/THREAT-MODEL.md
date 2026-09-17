# WonderHome — Threat model

Story 15-001. A living document: every story that adds a surface should add or
revise a row here, and a control listed as "planned" is a gap, not a claim.

The scope is what the backlog calls for — web, API, integration and AI threats —
in a product where the data is a family's daily life: where the children are,
what the household spends, who is in the house and when.

## What we are protecting

| Asset | Why it matters |
|---|---|
| Household membership and roles | Who may act for the family at all |
| Children's data and whereabouts | The highest-consequence data in the product |
| Financial obligations and payment intents | Direct monetary loss |
| Private adult conversations | Privacy within the household, not just from outside it |
| Helper schedules and personal details | A worker's data, held by their employer |
| Integration credentials | Standing access to school, email, calendar and commerce accounts |
| The audit trail | The record of who did what, which must resist the actor |

## Who we are defending against

1. **An outsider with no account.** Untargeted, scanning for anything reachable.
2. **A member of another household.** Has a valid session; the tenant boundary is all that stands between them and someone else's family.
3. **A member of this household acting beyond their role.** A child reaching for finances, an adult reaching for administration, an administrator reaching for ownership.
4. **A househelper.** Legitimate but bounded access; their view must not become a window into the family's private life.
5. **A compromised integration or provider.** Returns hostile data, or is reached through a URL we were persuaded to fetch.
6. **A prompt-injection author.** Content the AI reads — a school email, a merchant description — that tries to make it act.
7. **An insider with database access.** Backups and support paths; what a stolen dump is worth.

## Threats and where they are answered

| # | Threat | Control | Status |
|---|---|---|---|
| T1 | Cross-household read or write | `household_id` on every tenant table, RLS on all of them, application authorization ahead of RLS | **Built** — `scripts/test-tenant-isolation-rls.mjs` asserts it over every table that exists, not a remembered list |
| T2 | A new table ships without protection | Migration lint plus the catalogue-driven coverage test | **Built** — fails CI on the migration that introduces it |
| T3 | Privilege escalation inside a household | Head/administrator split enforced in policy and in `canAssignRole`; head is not an assignable role | **Built** — `scripts/test-roles-rls.mjs` |
| T4 | A child or helper inheriting adult access | Deny by default in the permission catalogue; views filtered server-side | **Built** — `permissions.test.ts`, `views.test.ts` |
| T5 | Invitation token theft or replay | 256-bit CSPRNG tokens, digest-only storage, expiry, revocation, single use, supersession on re-invite | **Built** — `scripts/test-invitations-rls.mjs` |
| T6 | Invitation endpoint used as an oracle | Unknown, revoked, expired and used tokens return one identical refusal | **Built** |
| T7 | Account enumeration at sign-in | One message for wrong password and unknown account | **Built** |
| T8 | Open redirect through `?next=` | Same-site paths only | **Built** |
| T9 | Duplicated side effects on retry | `Idempotency-Key` with request fingerprinting, scoped per household and endpoint | **Built** — failures are not cached, so a retry still retries |
| T10 | Secrets in source or client bundles | Secret lint; server-only values never behind `NEXT_PUBLIC_`; redaction before logging | **Built** — `scripts/lint-secrets.mjs` |
| T11 | Sensitive content in logs or error reports | Redaction by key and by value shape, applied on the way out rather than at call sites | **Built** — `redact.test.ts` |
| T12 | Stack traces or internals leaking to callers | One error envelope; unexpected errors become an opaque `internal` with a request id | **Built** — `route.test.ts` |
| T13 | Forged or suppressed audit entries | No INSERT policy on `audit_events`; writes via service role; redacted metadata | **Built** |
| T14 | Search-path hijack of a policy helper | Every SECURITY DEFINER function pins `search_path` | **Built** — asserted over the live catalogue |
| T15 | Session fixation or theft | Supabase session cookies, httpOnly and SameSite=Lax, verified with `getUser()` rather than trusting a decoded cookie | **Built** |
| T16 | Clickjacking, sniffing, mixed content | CSP with `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, HSTS in production | **Built** — asserted in E2E against real responses |
| T17 | Step-up authentication for payments, export and deletion | Re-authentication before a consequential action | **Planned** — module 11 and 15-007; no payment path exists yet |
| T18 | MFA for household administrators | Supabase TOTP enrolment and policy | **Planned** — 15-004 follow-up |
| T19 | Prompt injection through household content | Deterministic authorization outside the model: `proposeFromIntent` decides by permission, autonomy and entitlement, never by what the model concluded | **Partly built** — the decision boundary exists and is tested (04-004); the governed tool surface arrives with module 14 |
| T20 | SSRF via integration URLs | Allow-list of provider hosts, no caller-supplied fetch targets | **Planned** — module 17 |
| T21 | Hostile data from a provider | Provider-neutral adapters; parse and validate before use; never treat provider text as instructions | **Planned** — module 17 |
| T22 | Support access used beyond its purpose | Reason-coded grants bounded to 24h, revocable, audited, and readable by the household they concern | **Built** — `scripts/test-platform-admin-rls.mjs` |
| T23 | Data retained past its purpose | Retention policy per data class; deletion that actually deletes | **Planned** — 15-007 |
| T24 | Household content used to train a model | Provider configuration and consent checked before sensitive content is sent | **Planned** — 15-005 |
| T25 | Abuse and brute force | Rate limiting on authentication and expensive endpoints | **Planned** — 15-008 |

## Standing decisions

- **Application authorization is authoritative; RLS is defense in depth.** Both refuse the same things. Neither is allowed to be the only thing that does.
- **Deny by default.** A new permission is absent until granted; a new table is unreachable until a policy admits someone.
- **An LLM response is never authorization.** Tools decide, not the model.
- **Never invent an integration.** An unconfigured provider is a mock, and says so.
- **A failed audit write does not fail the request.** A gap in the trail is better than turning a completed action into a retry loop; the failure is reported.

## What this document is not

Not a substitute for professional review. The baseline names OWASP ASVS and the
Top 10 as references and requires an external assessment before production;
nothing here replaces that.
