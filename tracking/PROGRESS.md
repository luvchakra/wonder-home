# WonderHome — Overall Live Progress

**Source of truth:** Claude Code must update this file after every story status change.

| Metric | Value |
|---|---:|
| Total stories | 170 |
| Done | 132 |
| In Progress | 1 |
| Blocked | 0 |
| Not Started | 37 |
| Completion | 77.6% |
| Current module | 17 External Integrations |
| Current story | 17-005 Commerce |
| Last updated | 2026-09-19 |

## Module Tracking

| # | Module | Stories | P0 | P1 | P2 | Done | Status |
|---|---|---:|---:|---:|---:|---:|---|
| 00 | Project Bootstrap & Architecture | 10 | 8 | 2 | 0 | 10 | Done |
| 01 | Identity & Family Accounts | 8 | 5 | 2 | 1 | 6 | In Progress |
| 02 | Household Configuration & Playbook | 8 | 6 | 1 | 1 | 5 | In Progress |
| 03 | Outcome & Routine Engine | 8 | 5 | 2 | 1 | 5 | In Progress |
| 04 | Conversation, Voice & Text | 8 | 7 | 1 | 0 | 8 | Done |
| 05 | Household Certification & Understanding | 8 | 6 | 1 | 1 | 6 | In Progress |
| 06 | Actionable Notification Engine | 8 | 7 | 1 | 0 | 7 | In Progress |
| 07 | Househelper & Home Operations | 8 | 5 | 2 | 1 | 5 | In Progress |
| 08 | Kids & School Intelligence | 8 | 5 | 2 | 1 | 8 | Done |
| 09 | Commerce, Groceries & Pet Supplies | 8 | 4 | 3 | 1 | 8 | Done |
| 10 | Meals & Cooking | 8 | 4 | 2 | 2 | 8 | Done |
| 11 | Bills, Fees & Finance | 8 | 5 | 2 | 1 | 8 | Done |
| 12 | Family Time & Social Activities | 8 | 3 | 4 | 1 | 8 | Done |
| 13 | Maintenance, Laundry & Pet Care | 8 | 4 | 3 | 1 | 8 | Done |
| 14 | AI Orchestration & Learning | 8 | 6 | 1 | 1 | 6 | In Progress |
| 15 | Privacy, Security & Governance | 8 | 8 | 0 | 0 | 4 | In Progress |
| 16 | Platform Admin & Operations | 8 | 6 | 2 | 0 | 4 | In Progress |
| 17 | External Integrations | 8 | 5 | 2 | 1 | 4 | In Progress |
| 18 | API & Developer Platform | 8 | 6 | 1 | 1 | 6 | In Progress |
| 19 | Testing, Observability & Production | 8 | 6 | 2 | 0 | 6 | In Progress |
| 20 | Subscriptions, Entitlements & Usage | 8 | 4 | 2 | 2 | 3 | In Progress |

## Execution Log

| Timestamp | Module | Story | Status | Tests | Notes |
|---|---|---|---|---|---|
| 2026-09-17 | 00 | 00-001 | Done | typecheck/lint/test/build | npm workspaces monorepo: apps/web + packages/core |
| 2026-09-17 | 00 | 00-002 | Done | typecheck/lint/test/build | Stack pinned to WonderArk baseline; lockfile committed |
| 2026-09-17 | 00 | 00-003 | Done | typecheck/lint/test/build | Design tokens, app shell, 5-area navigation, accessible skip link |
| 2026-09-17 | 00 | 00-004 | Done | env + migration lint tests | Validated env contract, SSR/browser/admin clients, first migration applied to wonder-home |

| 2026-09-17 | 13 | 13-001 | Done | 17 unit + 12 db tests | home_assets, service history, coverage; the agenda is action-only, never an inventory |
| 2026-09-17 | 13 | 13-002 | Done | unit + db tests | device wear brings a service forward and never pushes one back |
| 2026-09-17 | 13 | 13-003 | Done | 17 unit tests | readiness from deadline and inferred state; no wash/dry/fold check-ins exist to click |
| 2026-09-17 | 13 | 13-004 | Done | 9 unit tests | cover surfaced at the moment something breaks; silent when WonderHome can reorder |
| 2026-09-17 | 13 | 13-005 | Done | 12 unit tests | weather port + fixtures + server-side entitlement; no live provider configured |
| 2026-09-17 | 13 | 13-006 | Done | 12 unit + db tests | next_action_by is what makes an open request actionable rather than informational |
| 2026-09-17 | 13 | 13-007 | Done | 8 unit tests | outcome-based pet care; a missed dose never looks like a missed grooming |
| 2026-09-17 | 13 | 13-008 | Done | 13 unit + db tests | signals are optional and server-ingested; members cannot write their own evidence |

| 2026-09-17 | 17 | 17-001 | Done | 22 unit + 12 db tests | one connector contract; partial sync is degraded, lost access never waits for a threshold |
| 2026-09-17 | 20 | 20-001 | Done | 12 db tests | free/pro/max seeded as rows — changing a plan is a reviewable migration |
| 2026-09-17 | 20 | 20-002 | Done | 13 unit tests | one entitlement service; weather's local check replaced by it (ADR-008) |
| 2026-09-17 | 20 | 20-003 | Done | concurrency test, 20 parallel sessions | atomic counter: exactly 10 of 20 racing requests won a limit of 10 |

| 2026-09-17 | 08 | 08-001 | Done | 20 unit tests | effort and sitting length follow the child's age; the child's view is built server-side |
| 2026-09-17 | 08 | 08-002 | Done | 12 unit tests | school adapter on the shared connector contract; a broken connection never looks like no homework |
| 2026-09-17 | 08 | 08-003 | Done | 12 db tests | provider identity makes a re-import reconcile; a portal cannot mark work done |
| 2026-09-17 | 08 | 08-004 | Done | 7 unit tests | sittings that fit real free time; work that will not fit is reported, not dropped |
| 2026-09-17 | 08 | 08-005 | Done | 4 unit tests | risk is remaining effort against remaining time |
| 2026-09-17 | 08 | 08-006 | Done | 5 unit + db tests | guardianship enforced in the API and again in RLS; refusal does not confirm the file |
| 2026-09-17 | 08 | 08-007 | Done | 10 unit tests | only an explicit ask or a date surfaces; newsletters are filed |
| 2026-09-17 | 08 | 08-008 | Done | contract + fixtures | provider seam and scopes ready; nothing claims to be live |

| 2026-09-17 | 09 | 09-001 | Done | 18 unit + 15 db tests | consumption rate plus evidence; the constraint refuses a rate with no basis |
| 2026-09-17 | 09 | 09-002 | Done | 6 unit tests | a suggestion states why, how much and by when, or is not made |
| 2026-09-17 | 09 | 09-003 | Done | fixture + contract tests | commerce adapter on the shared connector; no merchant is live |
| 2026-09-17 | 09 | 09-004 | Done | 13 unit tests | deterministic allow/approve/refuse; silence is never read as consent |
| 2026-09-17 | 09 | 09-005 | Done | 3 unit + db tests | idempotency derived from the basket, not a clock; a retry cannot buy twice |
| 2026-09-17 | 09 | 09-006 | Done | 4 unit tests | only a real transition moves an outcome, so polling cannot duplicate a notification |
| 2026-09-17 | 09 | 09-007 | Done | db + unit tests | pet supplies share the depletion model and stay scoped to the animal |
| 2026-09-17 | 09 | 09-008 | Done | 6 unit tests | availability and timing filter, price decides; stale quotes excluded |

| 2026-09-17 | 10 | 10-001 | Done | 10 unit + 10 db tests | a meal is readiness by a time; there is no preparation step to tick |
| 2026-09-17 | 10 | 10-002 | Done | 6 unit tests | plans against available time, preferences and what is in |
| 2026-09-17 | 10 | 10-003 | Done | db + unit tests | a missing essential becomes a real cart suggestion the meal points at |
| 2026-09-17 | 10 | 10-004 | Done | 3 unit tests | an absent cook is raised before lateness becomes the problem |
| 2026-09-17 | 10 | 10-005 | Done | 4 unit tests | protected family time is never moved by the planner alone |
| 2026-09-17 | 10 | 10-006 | Done | 6 unit tests | cook, shop, substitute or defer — a recommendation always names the next step |
| 2026-09-17 | 10 | 10-007 | Done | 6 unit + 3 db tests | allergy outranks dislike; a member cannot state another's preference |
| 2026-09-17 | 10 | 10-008 | Done | db constraint | readiness accepts an observed source, so an appliance signal has a home |

| 2026-09-17 | 11 | 11-001 | Done | 8 unit + 15 db tests | an obligation exists before its amount; source, due date and owner recorded |
| 2026-09-17 | 11 | 11-002 | Done | db tests | integration identity makes a re-import reconcile instead of paying twice |
| 2026-09-17 | 11 | 11-003 | Done | 7 unit tests | lead time by consequence; silent once paid, scheduled or delegated |
| 2026-09-17 | 11 | 11-004 | Done | 8 unit tests | approval fingerprints bill, amount and currency; a change invalidates it |
| 2026-09-17 | 11 | 11-005 | Done | 13 unit + db tests | step-up separate from session; one success per intent enforced by a partial unique index |
| 2026-09-17 | 11 | 11-006 | Done | 4 unit tests | the comparison basis travels with the finding; a review, never a block |
| 2026-09-17 | 11 | 11-007 | Done | 2 unit tests | budgets describe intent and never stop a payment |
| 2026-09-17 | 11 | 11-008 | Done | policy + idempotency | deterministic policy and retry rules; no payment provider is live |

| 2026-09-17 | 12 | 12-001 | Done | 6 unit + 13 db tests | events stay linked to participants; an event has to end after it starts |
| 2026-09-17 | 12 | 12-002 | Done | 4 unit + db tests | protected time is a column automation may read and never spend |
| 2026-09-17 | 12 | 12-003 | Done | 6 unit + 3 db tests | free/busy only: wh.busy_windows returns times and nothing about why |
| 2026-09-17 | 12 | 12-004 | Done | 3 unit tests | at most three options, and anything that does not fit is removed |
| 2026-09-17 | 12 | 12-005 | Done | 4 unit tests | an owner and an explicit action state, so nothing becomes passive calendar data |
| 2026-09-17 | 12 | 12-006 | Done | 4 unit tests | gifts planned against a stated occasion, chased as the date nears |
| 2026-09-17 | 12 | 12-007 | Done | 6 unit + 3 db tests | both sides named, a proposal offered, protected time never moved |
| 2026-09-17 | 12 | 12-008 | Done | composition | an outing uses availability, conflict and gift planning together |

## Progress protocol
- Mark the story In Progress before coding.
- Update the tracker after meaningful implementation/test milestones.
- Mark Done only after Definition of Done passes.
- If blocked by a real external dependency, record the blocker and continue with another dependency-ready story.
- Completion percentage is `Done / Total stories * 100`.
| 2026-09-17 | 00 | 00-005 | Done | 6 E2E specs, mobile + desktop | Playwright set up fresh; not inherited from the WonderArk baseline |
| 2026-09-17 | 00 | 00-006 | Done | 24 tests across gates | CI: typecheck, lint, migration + boundary lints, tests, build, E2E |
| 2026-09-17 | 00 | 00-007 | Done | 6 unit + 3 E2E contract tests | /api/v1 wrapper, error envelope, correlation ids, health + authenticated example |
| 2026-09-17 | 00 | 00-008 | Done | 19 unit + 18 E2E | Security headers, session middleware, route gate, log redaction |
| 2026-09-17 | 00 | 00-009 | Done | 6 unit tests | Structured redacting logger, provider-neutral error reporting seam |
| 2026-09-17 | 00 | 00-010 | Done | 10 unit tests | Validated flags and fail-fast startup configuration |
| 2026-09-17 | 00 | — | Done | 50 unit, 15 script, 18 E2E | Module 00 complete; foundation ready for module 01 |
| 2026-09-17 | 01 | 01-001 | Done | 12 RLS, 10 unit, 7 E2E | Tenant model, wh.create_household, auth + onboarding surfaces |
| 2026-09-17 | 01 | 01-002 | Done | 10 RLS, 7 unit, 3 E2E | Hashed expiring invitation tokens, supersession on re-invite, acceptance path |
| 2026-09-17 | 01 | 01-003 | Done | 9 RLS, 12 unit | Permission catalogue, role assignment API and head-only admin designation |
| 2026-09-17 | 01 | 01-004 | Done | 10 RLS, 9 unit | Guardian-controlled children with no account; age derived, never stored |
| 2026-09-17 | 01 | 01-005 | Done | 8 unit, 1 E2E | Views assembled server-side; forbidden sections absent from the payload |
| 2026-09-17 | 18 | 18-001 | Done | 44 E2E, 19 unit | /api/v1 established in 00-007; contract verified end to end |
| 2026-09-17 | 18 | 18-002 | Done | 6 unit | One error envelope; validation detail without echoing values |
| 2026-09-17 | 18 | 18-003 | Done | 41 database | Identity plus household scope on every endpoint, RLS behind it |
| 2026-09-17 | 18 | 18-004 | Done | 13 unit | Idempotency-Key replay, fingerprinted, scoped per household and endpoint |
| 2026-09-17 | 18 | 18-005 | Done | 9 unit, 1 E2E | OpenAPI generated from the same Zod schemas the routes validate with |
| 2026-09-17 | 18 | 18-006 | Done | 5 unit | Audit hooks: redacted metadata, never throwing, append-only |
| 2026-09-17 | 15 | 15-001 | Done | — | Threat model: 25 threats, each mapped to a built or planned control |
| 2026-09-17 | 15 | 15-002 | Done | 9 database | Isolation asserted over the live catalogue, not a remembered list |
| 2026-09-17 | 15 | 15-003 | Done | 20 unit, 9 database | Deny by default; child and helper inherit nothing |
| 2026-09-17 | 15 | 15-004 | Done | 10 script | Secret lint in CI; server-only values never behind NEXT_PUBLIC_ |
| 2026-09-17 | 19 | 19-001 | Done | 139 unit, 26 script, 50 db, 46 E2E | Every P0 flow covered at the layer that can actually fail |
| 2026-09-17 | 19 | 19-002 | Done | 50 database | Catalogue-driven; a new unprotected table fails CI |
| 2026-09-17 | 19 | 19-003 | Done | 7 unit | 13 golden scenarios across all five required categories |
| 2026-09-17 | 19 | 19-004 | Done | 7 unit, 1 E2E | Liveness and readiness separated; degraded keeps serving |
| 2026-09-17 | 19 | 19-005 | Done | 6 unit | Structured redacting logs with correlation ids (00-009) |
| 2026-09-17 | 19 | 19-006 | Done | 2 unit | Provider-neutral reporting seam; 5xx only (00-009) |
| 2026-09-17 | 16 | 16-001 | Done | 11 database, 8 unit | /platform-admin boundary; not staff and no boundary look identical |
| 2026-09-17 | 16 | 16-002 | Done | 8 unit | support/operator/owner; support cannot grant itself access |
| 2026-09-17 | 16 | 16-003 | Done | 1 E2E | Operations aggregates only, never one family's activity |
| 2026-09-17 | 16 | 16-004 | Done | 11 database | Reason-coded, time-boxed, revocable, visible to the household |
| 2026-09-17 | 02 | 02-002 | Done | 13 database | Responsibility matrix; gaps representable, invalid targets refused |
| 2026-09-17 | 02 | 02-003 | Done | 13 database | Playbook items with a dependency graph, not an array |
| 2026-09-17 | 02 | 02-004 | Done | 13 database | Versioned policies; exactly one in force per name |
| 2026-09-17 | 02 | 02-005 | Done | 12 unit, 13 database | Autonomy decided per action; three kinds always need a person |
| 2026-09-17 | 03 | 03-001 | Done | 20 unit | Outcomes with owner, window, verification source — not tasks |
| 2026-09-17 | 03 | 03-002 | Done | 20 unit | Routines instantiate outcomes; one live outcome per due date |
| 2026-09-17 | 03 | 03-003 | Done | 20 unit | Evaluation is pure; on track and met produce nothing |
| 2026-09-17 | 03 | 03-004 | Done | 20 unit | Every exception carries an impact and a recommended action |
| 2026-09-17 | 03 | 03-005 | Done | 20 unit | Replanning reaches only what the change actually touches |
| 2026-09-17 | 04 | 04-001 | Done | 26 unit, 12 database | One typed intent; channel is metadata, not a second code path |
| 2026-09-17 | 04 | 04-002 | Done | 26 unit | 12 deterministic household utterances as regression fixtures |
| 2026-09-17 | 04 | 04-003 | Done | 26 unit | Short replies resolve against the pending proposal; a stale yes is not consent |
| 2026-09-17 | 04 | 04-004 | Done | 26 unit | Preview names the knock-on changes, not just the change |
| 2026-09-17 | 04 | 04-005 | Done | 26 unit | Voice converges on the same intent; transcript confidence retained |
| 2026-09-17 | 04 | 04-006 | Done | 26 unit | Text shares the engine with voice |
| 2026-09-17 | 04 | 04-007 | Done | 15 unit, 12 database | Memory with source and confidence; confirmed facts are canonical |
| 2026-09-17 | 05 | 05-001..006 | Done | 21 unit | Certification: explainable coverage, risk by subject, every alert actionable |
| 2026-09-17 | 06 | 06-001..007 | Done | 28 unit, 12 database | Decision engine: an event alone never interrupts anyone |
| 2026-09-17 | 14 | 14-001..006 | Done | 41 unit, 11 database | Governed tools; every call re-checked; refusals recorded |
| 2026-09-17 | 07 | 07-001..005 | Done | 17 unit | Helper model with no task-completion table, by design |
| 2026-09-17 | 01 | 01-006 | Done | 17 unit | Recurring windows plus date exceptions, queryable by the planner |
| 2026-09-17 | 18 | 18-003/005 | Hardened | 138 E2E, 614 unit | E2E derives the endpoint list from disk; authentication now precedes body validation |
| 2026-09-17 | UI | v3 UI/UX | Done | 630 unit, 160 E2E | Design system v3: tokens, Inter, motion, 30-component kit, AI assistant (talk/text), 18 screens, landing page |
| 2026-09-17 | 19 | 19-007 | In Progress | 635 unit, 160 E2E | Perf: functions in bom1 beside the database (migrated to the ap-south-1 project, 23 migrations, verify:live 59/59), local ES256 verification, per-request query dedup, next/link + loading skeletons, streaming shells |
| 2026-09-18 | 17 | 17-002 | Done | 34 unit, E2E endpoint suite | Calendar connector: imported events never protected or confirmed, private entries are time only, partial sync never cancels, identities mapped by a person (integration_identities) |
| 2026-09-19 | 17 | 17-003 | Done | 20 unit, 168 E2E | Email connector: recognised bills only, reconciled onto obligations by provider identity; an email can never mark a bill paid, and a re-sync never touches status once set |
| 2026-09-19 | 17 | 17-004 | Done | 27 unit, 172 E2E | School connector wired to a real sync: reconciled by identity + content hash; a portal's own cancellation signal applied only when nobody has submitted or finished the item; identity mapping shared with the calendar connector |
| 2026-09-18 | UI | Household setup | Done | 19 unit | First-week setup guidance for head/admin: weighted progress ring, next steps with a reason each, achievement at 100%; first sign-in recorded once per member (mark_member_seen) |
