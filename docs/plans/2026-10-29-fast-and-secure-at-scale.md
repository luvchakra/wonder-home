# Plan: fast and secure at scale (100k+ households)

**Status:** For review. Nothing here is built yet. Approve stories one at a time; each is sized to one focused session.
**Date:** 2026-10-29 · **Author session:** feature/plan-fast-secure-at-scale
**Series:** `PERF-xx` (performance & scale), `SEC-xx` (security). Priorities: **P0** release-blocking security/correctness · **P1** important · **P2** scale-out / hardening.

---

## 1. Executive summary

WonderHome is **pre-launch**: the live database holds a handful of real households (largest table on the household side is double-digit rows; the biggest table overall is the 5,165-row `grocery_catalog` platform seed). So almost every "how slow is it under load" number below is a **forward estimate**, not a measurement — and that is the honest headline. What we *can* measure is structural: Supabase advisors, `pg_stat_statements` shapes, bundle sizes, and the measured wins from the recent performance passes.

**Where we are (measured).** The foundations are already strong. The 2026-10-19 and 2026-10-28 passes rewrote all RLS policies to set-form membership (the advisor now reports **zero** `auth_rls_initplan` findings), indexed ~180 foreign keys across two migrations, made the service-role client a process singleton, consolidated counts into one RPC, and batched the Home/Today/Meals read waves (B1–B10, most shipped). The app layer is genuinely well-built: the dashboard is a single parallel `Promise.all` wave with per-request `cache()` dedupe, per-domain fault isolation, and **no render-path N+1**. Security is above average for this stage: real SSRF+DNS-rebinding protection, prompt-injection containment by schema, signed+replay-protected webhooks on all three channels, one-time purpose-bound step-up auth, a Postgres-backed (not per-instance) rate limiter, and build-enforced audit coverage.

**The targets** (`TECH-STACK-AND-NFR.md`): p95 ≤ 500 ms reads / ≤ 800 ms writes (excl. external latency); 99.9% monthly availability; RPO ≤ 15 min, RTO ≤ 1 hr; "25,000 households without architectural redesign, up to 150,000 members, 10M notifications/month." The owner's ask pushes that to **100k–500k households** — 4–20× the stated design point — so parts of this plan are deliberately about re-validating the 25k design at 100k+.

**The 5–8 biggest wins (impact × effort):**
1. **Connection pooling discipline** (PERF-04). `max_connections = 60`. Serverless at 100k households *must* go through Supavisor transaction mode; this is the single hardest scale gate and is cheap to get right.
2. **Bound the two unbounded hot-path reads** (PERF-03). `listEvents`/`listMeals` on Home have no `.limit()` and no forward horizon — the only hot-path reads that grow with per-household history. Small change, removes a latent cliff.
3. **Consolidate 63 overlapping permissive RLS policies** (PERF-02). Each extra permissive policy is OR-evaluated per row on every query; one policy per `{role, action}` is a broad p95 win at scale.
4. **Encryption at rest for household secrets** (SEC-01). AI keys, Gemini voice keys and school-portal passwords are stored **plaintext** today, protected only by "no SELECT policy + service-role read." A backup leak = cleartext credentials. This is the top security finding.
5. **Supply-chain scanning in CI** (SEC-02). There is no dependency audit, SAST, or git-history secret scan today — and `SECURITY-BASELINE.md` lists SBOM/dependency scanning as a P0 control. Close the gap between the baseline and reality.
6. **Standing regression gates** (PERF-15/16/17, SEC-10): p95 budget, bundle-size budget, advisor-clean, RLS-coverage — so scale and security don't quietly regress between sessions.
7. **De-poll the DB job queue & size the reconciler** (PERF-06/07). Workers poll `claim_portal_fetch_job()` tens of thousands of times; the delivery clock and calendar refresh run `pg_cron → pg_net → HTTP`. Fine now; needs sizing / a real queue before 100k.
8. **Partition the append-only giants** (PERF-05) ahead of 10M→200M notification rows/month.

**The 5–8 biggest risks:**
- **Platform ceilings, not code.** Vercel is on **Hobby** (100 deploys/day cap already shapes the workflow) and Supabase on a **small tier (60 connections)**. Neither survives 100k households; both are owner budget/plan decisions (§7).
- **No load test exists.** We cannot prove the p95 targets at 100k without synthetic data and a harness (PERF-18). Everything scale-related is unproven until then.
- **`pg_net` + `pg_cron` as the async backbone.** DB-driven HTTP and tight polling are the heaviest cumulative queries in `pg_stat_statements`; they multiply with household count.
- **Reconciler/dispatch caps** (40 households/tick, 500/day sweep) assume the trigger-driven due-set stays small. Unverified at 100k.
- **Service-role breadth.** ~100 `createAdminClient()` call sites each bypass RLS and must self-authorize; the contract is unenforced by types.
- **MFA absent** and **CSP uses `'unsafe-inline'`** — the two standing ASVS gaps.
- **Live-apply lag.** Three already-written migrations (set-form helpers, child-visibility, chat-RPC revoke) are not yet applied to the live project.

---

## 2. Current state & measurements

All figures are from the live project `kqxndableyysxqhxiorz` (`wonderhome`, ap-south-1) on 2026-10-29, or cited from prior progress notes. **Load-derived numbers are estimates and labelled as such; the DB is near-empty, so plan accordingly.**

### 2.1 Platform & database
- **Postgres 17.6**, `max_connections = **60**`, 24 idle connections at rest. 205 tables, 58 public functions.
- Extensions: `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `pg_cron`, `pg_net`, `vector`, `uuid-ossp`.
- Largest tables: `grocery_catalog` 7.5 MB / 5,165 rows (platform seed), `homebrain_embeddings` 1.25 MB / 190 rows (pgvector). **Every household-data table is < 1 MB and mostly < 100 rows.** No real load yet.
- **`pg_cron` jobs:** delivery clock every 5 min and calendar refresh every 15 min (both `net.http_post` → `home.wonderapps.biz` API routes); portal-fetch enqueue twice daily.

### 2.2 Supabase advisors (authoritative, 2026-10-29)
**Security:**
| Finding | Level | Count | Note |
|---|---|---|---|
| `pg_net` extension installed in `public` | WARN | 1 | Move to a dedicated schema (SEC-13). |
| SECURITY DEFINER RPC executable by **anon** (`claim_due_calendar_subscriptions`) | WARN | 1 | Genuinely over-exposed — revoke from `anon` (SEC-08). |
| SECURITY DEFINER RPCs executable by **authenticated** | WARN | 25 | Mostly intended client RPCs; audit the list, revoke any not meant to be called directly (SEC-08). |
| Leaked-password protection disabled | WARN | 1 | Supabase Auth → HaveIBeenPwned; owner toggle (SEC-08). |

**Performance:**
| Finding | Level | Count | Note |
|---|---|---|---|
| `multiple_permissive_policies` | WARN | 63 | Overlapping permissive policies per `{role, action}` — consolidate (PERF-02). |
| `unused_index` | INFO | 152 | Mostly an artifact of **no traffic**; do **not** blind-drop. Re-run post-launch (PERF-14). |
| `unindexed_foreign_keys` | INFO | 2 | `calendar_subscriptions` (owner + created_by member) (PERF-01). |
| `auth_rls_initplan` | — | **0** | Confirms B1 set-form policies are live-effective. |

### 2.3 `pg_stat_statements` (cumulative; mostly test + cron traffic, not real users)
- Heaviest cumulative: `net.http_post(...)` — 2,949 calls, 31 ms mean (DB-driven HTTP for the clocks).
- `claim_portal_fetch_job()` — **~55,000 calls** combined (0.7–1.5 ms each): a worker polling the DB-as-queue very tightly.
- `DELETE FROM households ... CASCADE` — 126 calls, **638 ms mean** (QA cleanup; shows cascade-delete cost → PERF-12).
- `net.http_request_queue` / `net._http_response` maintenance deletes — 7,000+ calls each (pg_net queue upkeep).
- `set_config(... request.jwt.claims ...)` — 180k+ calls (normal PostgREST per-request RLS claim setup).

**Read in one line:** the only things working the DB hard today are the **background clocks and the polling worker**, not user queries — exactly the subsystems that multiply with household count.

### 2.4 App layer (code inspection, file:line evidence in the branch)
- **Strong:** Home dashboard is one `Promise.all` wave (`home-dashboard.tsx:250-266`) with `cache()`-deduped event/meal reads (`home-reads.ts:25`); billing `may()` checks run concurrently with the reads they gate (`agenda.ts:175-178`); per-domain try/catch isolation; **no render-path N+1**; growing-table reads generally carry `household_id` + status + date horizon + `.limit()`.
- **Risk — unbounded hot-path reads:** `listEvents` (`family/repository.ts:37-49`) and `listMeals` (`meals/repository.ts:44-54`) on Home have **no `.limit()` and no upper date bound** → PERF-03.
- **Risk — reconciler/dispatch throughput:** idempotent and triple-capped (40 households/tick, 500/day sweep, 2000-row dispatch slice) but write phase is **serial per household** (`notifications/reconcile.ts:402-445`) → PERF-07.
- **Note:** `notifications/page.tsx:61` awaits a full reconcile *before* reading the inbox — a render-path cost on that one screen.
- **Bundle:** 141 `"use client"` files, server-first; `check:bundle` enforces that help prose, AI prompts, careers code and **zod** stay out of client chunks — but it is a *content* guard, **no size budget** → PERF-16.

### 2.5 Security controls (code inspection)
Strong & real: rate limiting (Postgres-backed, per-identity, ~25 buckets — but **fails open** with only a warn log), SSRF (`security/outbound.ts` + DNS-rebinding-safe `homesend/link-fetch.ts` with socket-pinned address), prompt-injection containment (`homesend/injection.ts`, schema-structural), webhook signing+replay on email/WhatsApp/payments, one-time purpose-bound step-up (`security/step-up.ts`), global CSP/HSTS/headers (`security/headers.ts`), append-only audit with build-enforced coverage (`security/sensitive-actions.ts`).

Gaps (feed the SEC stories): **plaintext household secrets** (SEC-01), **no CI dependency/SAST/secret-history scan** (SEC-02), **Zod on only 44/97 route handlers** (SEC-03), **~100 service-role call sites** unenforced (SEC-04), **CSP `'unsafe-inline'`** in `script-src` (SEC-05), **rate-limit fail-open, no alert** (SEC-06), **no MFA** (SEC-07), **no explicit CSRF Origin check** (SEC-09).

### 2.6 CI gates today (`docs/CI.md`)
PR: typecheck, changed-file ESLint, related unit tests, P0 security suite + eval gates, secret *env-linter*, DB/RLS tests when `supabase/` changes, build + client-chunk content check. Nightly: full Playwright. **Missing:** p95 budget, bundle-size budget, advisor-clean check, dependency/SBOM audit, SAST, git-history secret scan.

---

## 3. Target architecture & principles

Keep the shape that already works; add the pieces that 100k needs. The invariants in `CLAUDE.md`, `docs/agent-platform.md`, `docs/external-providers.md` and `docs/notifications.md` are **not** negotiable (one HomeTalk door, HomeBrain never decides, nothing added above the household's bar, untrusted content fenced, children's privacy, no fake integrations, no paying by voice).

1. **Stateless app, pooled DB.** Every serverless instance reaches Postgres through Supavisor transaction mode; no per-instance state that must be shared (rate limits already live in Postgres — keep that pattern).
2. **One wave, read once, bound everything.** Preserve the parallel-wave + `cache()` + `.limit()`/horizon discipline; make "no unbounded read on a growing table" a lint/review rule.
3. **Authorize server-side, every time.** RLS as the enforcement point; service role only behind an explicit, auditable authz check; "an LLM response is never authorization."
4. **Work that can wait runs off the request** — but through a backbone that scales (a real lease/queue, not tight polling), sized against household count.
5. **Secrets are encrypted at rest**, read through a narrow path, never in a bundle or log.
6. **Measure, then gate.** p95, bundle size, advisor-clean, RLS-coverage and dependency hygiene become CI/standing gates so the wins above can't silently regress.
7. **Multi-tenancy fairness:** one noisy household cannot degrade others (per-household rate buckets + bounded fan-out).

---

## 4. The stories

Each story: **Goal · Why (evidence) · Scope / Out of scope · Acceptance (measurable) · Measure · Size · Priority · Deps · Backlog · Risk/rollback.** Phases are an execution order, not hard gates — P0/P1 security and the quick wins come first.

### Phase A — Quick wins & P0 security

#### Summary
| id | title | P | size | dep |
|---|---|---|---|---|
| PERF-13 | Apply the 3 pending migrations to the live project | P1 | S | — |
| PERF-01 | Index the 2 unindexed FKs on `calendar_subscriptions` | P1 | S | — |
| PERF-03 | Bound `listEvents` / `listMeals` on the Home path | P1 | S | — |
| PERF-09 | B4b — Calendar Day view shares the Today plan's reads | P1 | S | — |
| PERF-10 | B4c — Meals dedupes `recipes` / `consumables` reads | P1 | S | — |
| PERF-11 | B8b — lazy-load health/meal/bill form bodies | P2 | M | — |
| SEC-01 | Encryption at rest for household secrets | P0 | L | — |
| SEC-02 | CI supply-chain scanning (SCA + SAST + secret history) | P0 | M | — |
| SEC-08 | Clear the Supabase security advisors | P1 | S | PERF-13 |

#### PERF-13 — Apply the 3 pending migrations to the live project
- **Goal:** `20261028190000_policy_helpers_set_form`, `20261028171000_child_visibility_set_form`, `20261028170000_chat_rpcs_revoke_anon` are live.
- **Why:** Written and merged in-branch but not applied live (`apply_migration` timed out previously); the set-form wins (e.g. `health_vitals` 711 → 1.5 ms) and the `anon` revoke are not yet realized in production.
- **Scope:** Apply via MCP `apply_migration`, else hand the owner the SQL (dashboard → SQL Editor). Then `npm run verify:live`. **Out of scope:** any new schema.
- **Acceptance:** `list_migrations` shows all three; advisor re-run shows the chat RPCs no longer `anon`-executable; `verify:live` green.
- **Measure:** advisor diff; one warm timing on a child-visibility read.
- **Size** S · **Priority** P1 · **Deps** — · **Backlog** perf · **Risk:** safe-either-order already verified in the notes; rollback = prior migration is additive, revert policy if needed.

#### PERF-01 — Index the 2 unindexed FKs on `calendar_subscriptions`
- **Goal:** Covering indexes on `owner_member_id` and `created_by_member_id`.
- **Why:** Advisor `unindexed_foreign_keys` (2). Member deletes and owner lookups do a seq scan today; cheap to fix before the table grows.
- **Scope:** One migration, two `create index`. **Out of scope:** other tables (FKs already indexed in prior passes).
- **Acceptance:** advisor count → 0; index present live.
- **Measure:** advisor re-run.
- **Size** S · **Priority** P1 · **Deps** — · **Backlog** 26-HomeEvents · **Risk:** negligible; drop index to roll back.

#### PERF-03 — Bound the two unbounded hot-path reads
- **Goal:** `listEvents`/`listMeals` on Home take a `.limit()` and a forward horizon (e.g. fortnight) — or a Home-specific bounded variant.
- **Why:** Only hot-path reads whose cost grows with **per-household history**, not household count (`family/repository.ts:37-49`, `meals/repository.ts:44-54`). A household with a long calendar loads every future row.
- **Scope:** Add bound + horizon param, thread through `home-reads.ts`. **Out of scope:** changing the agenda's shape (it already dedupes).
- **Acceptance:** Home event/meal reads cap at the horizon; no visible change for normal households; a seeded "500 future events" household loads bounded rows (assert row count in a test).
- **Measure:** row count + warm timing before/after on a seeded household.
- **Size** S · **Priority** P1 · **Deps** — · **Backlog** perf / 26-HomeEvents · **Risk:** a horizon that hides a far-future item on Home — mitigate by keeping the full list on the Calendar screen.

#### PERF-09 — B4b: Calendar Day view shares the Today plan's reads
- **Goal:** Day view stops re-reading `family_events`, `school_items`, `obligations` for the calendar when the Today plan already read them.
- **Why:** Carried forward from B4 (backlog note): "the Calendar's Day view reads … once more … share the Today plan's reads." Left alone during a concurrent reshape.
- **Scope:** Pass the already-read rows in, as B4 did for Home. **Out of scope:** week/month views unless trivially shared.
- **Acceptance:** Day view REST calls drop by the three reads (count before/after); no behaviour change.
- **Measure:** REST-call count on `/calendar` day view.
- **Size** S · **Priority** P1 · **Deps** — · **Backlog** 26-HomeEvents · **Risk:** low; revert the wiring.

#### PERF-10 — B4c: Meals dedupes `recipes` / `consumables` reads
- **Goal:** Collapse the double reads (`listRecipesForEdit` + `recipesWithIngredients`; `listGroceries` + `listConsumables`).
- **Why:** Carried forward from B4c. Different column sets read in parallel — costs queries even though not serial waits.
- **Scope:** One read per table with the superset of columns, or share via `cache()`. **Out of scope:** meal-planning logic.
- **Acceptance:** Meals REST-call count drops by two; screen identical.
- **Measure:** REST-call count on `/meals`.
- **Size** S · **Priority** P1 · **Deps** — · **Backlog** 25-HomeFood · **Risk:** wider column read — keep it to columns actually shown.

#### PERF-11 — B8b: lazy-load health / meal / bill form bodies
- **Goal:** Split ~25 form bodies out of their buttons, loaded on open (health 15.2 KB gz `/health` only, `meal-forms` 10.8 KB gz, bill forms).
- **Why:** Carried forward from B8. Form bodies ship on first load of screens that may never open them.
- **Scope:** `next/dynamic`/`useLoadedLater` per form; **browser add + edit check each** (CLAUDE.md requires real-browser verification). **Out of scope:** redesigning the forms.
- **Acceptance:** per-route first-load gz drops measurably on `/health`, `/meals`, finance; each add/edit still works at 360 px and desktop.
- **Measure:** `next build` chunk sizes before/after; `scripts/ui-check.mjs`.
- **Size** M · **Priority** P2 · **Deps** — · **Backlog** perf · **Risk:** a form that fails to lazy-load — covered by the per-form browser check.

#### SEC-01 — Encryption at rest for household-provided secrets
- **Goal:** AI model keys, Gemini voice keys and school-portal passwords are encrypted at rest (envelope encryption: Supabase Vault / app-held key via `pgcrypto`, or a `credential_ref` to a secret manager — the schema comments already anticipate this).
- **Why:** **Top security finding.** Stored plaintext today (`20260919090000_household_ai_credentials.sql:31`; `school/portal-credentials.ts`); confidentiality rests entirely on "no SELECT policy + service-role read." A DB dump or service-role leak = cleartext credentials and portal passwords.
- **Scope:** Choose the mechanism (owner decision §7); migrate columns to ciphertext; encrypt on write, decrypt only in the narrow service-role read path; backfill existing rows; key stored outside the DB (or in Vault). **Out of scope:** rotating the underlying provider keys themselves.
- **Acceptance:** no plaintext secret column remains; a raw `select` of the table yields ciphertext; read path returns usable keys; round-trip test; audit event on decrypt-for-use.
- **Measure:** SQL inspection of stored values; unit + integration test of encrypt/decrypt; confirm no key material in logs (`redact.ts`).
- **Size** L · **Priority** **P0** · **Deps** owner decision on mechanism · **Backlog** 15-Security · **Risk:** a botched migration locks out live households — stage with dual-read (accept plaintext and ciphertext) during rollout, then drop plaintext; reversible until the plaintext column is dropped.

#### SEC-02 — CI supply-chain scanning (SCA + SAST + secret history)
- **Goal:** Add dependency audit (`npm audit` / Dependabot), SAST (CodeQL or Semgrep), and git-history secret scanning (gitleaks/trufflehog) to CI; optionally a container scan for the Dockerfile.
- **Why:** `SECURITY-BASELINE.md` lists dependency/SBOM scanning as **P0**, but `ci.yml` explicitly adds none and the only security scan is a regex env-linter. OWASP A06 / ASVS V1,V10.
- **Scope:** New workflow(s) or CI steps; triage baseline and set the failure threshold (e.g. fail on high/critical). **Out of scope:** fixing every pre-existing advisory in one go — establish the gate, then burn down.
- **Acceptance:** PRs run SCA + SAST + secret-history scan; a seeded vulnerable dep / planted secret fails CI; baseline documented.
- **Measure:** CI run on a test PR; count of findings triaged.
- **Size** M · **Priority** **P0** · **Deps** — · **Backlog** 15-Security / CI · **Risk:** noisy first run — start report-only for SAST, blocking for secrets + high-severity deps; mind the Vercel deploy-slot budget (run on GitHub Actions only, never a deploy).

#### SEC-08 — Clear the Supabase security advisors
- **Goal:** Zero security WARNs: revoke `EXECUTE` on `claim_due_calendar_subscriptions` from `anon`; audit the 25 `authenticated`-executable SECURITY DEFINER RPCs and revoke any not meant to be called via PostgREST; enable leaked-password protection (Auth setting, owner); (pg_net schema move tracked separately in SEC-13).
- **Why:** Advisor `security` findings; `claim_due_calendar_subscriptions` is a job-claim function reachable by `anon` — the one genuinely over-exposed RPC.
- **Scope:** One migration of `revoke`/`grant`; owner toggles leaked-password protection. **Out of scope:** the pg_net schema move (SEC-13).
- **Acceptance:** advisor security WARNs reduced to only the pg_net item (→ SEC-13); the intended client RPCs still work.
- **Measure:** `get_advisors(security)` diff; smoke-test the kept RPCs.
- **Size** S · **Priority** P1 · **Deps** PERF-13 · **Backlog** 15-Security · **Risk:** revoking an RPC the client actually calls — enumerate call sites first; rollback = re-grant.

### Phase B — Foundations for scale

#### Summary
| id | title | P | size | dep |
|---|---|---|---|---|
| PERF-04 | Connection pooling: standardize Supavisor transaction mode | P1 | M | — |
| PERF-02 | Consolidate the 63 overlapping permissive policies | P1 | M | PERF-13 |
| PERF-15 | p95 latency budget as a standing gate | P1 | M | — |
| PERF-16 | Bundle-size budget gate | P1 | S | — |
| PERF-17 | Advisor-clean standing gate | P1 | S | — |
| SEC-03 | Zod coverage audit + boundary lint rule | P1 | M | — |
| SEC-04 | Service-role least-privilege audit + typed wrapper | P1 | M | — |
| SEC-05 | CSP hardening — remove `'unsafe-inline'` | P1 | M | — |
| SEC-06 | Rate-limit alerting + per-household fairness | P1 | S | — |
| SEC-09 | CSRF defense-in-depth (Origin/Referer check) | P1 | S | — |
| SEC-10 | RLS-coverage standing test | P1 | M | — |

#### PERF-04 — Connection pooling: standardize Supavisor transaction mode
- **Goal:** Every serverless path reaches Postgres through the transaction-mode pooler; document and lint the connection string; size the pool against `max_connections` and the chosen compute tier.
- **Why:** `max_connections = 60`. Serverless fan-out at 100k households will exhaust direct connections instantly; transaction-mode pooling is the only way 60 backends serve thousands of concurrent clients. This is the **single hardest scale gate**.
- **Scope:** Verify `@supabase/ssr`/`supabase-js` use the pooled endpoint; confirm no long-lived transactions or session-mode-only features on the hot path; document pool math; add a check that the app env points at the pooler. **Out of scope:** the compute-tier upgrade itself (owner §7) — but quantify what tier 100k needs.
- **Acceptance:** documented pool sizing; a soak of N concurrent requests shows no "remaining connection slots" errors; runbook entry.
- **Measure:** `pg_stat_activity` under a concurrency soak; connection-count graph.
- **Size** M · **Priority** P1 · **Deps** — · **Backlog** 00-Architecture · **Risk:** transaction mode forbids some session features (prepared statements, `SET`) — audit for those; rollback is config.

#### PERF-02 — Consolidate the 63 overlapping permissive policies
- **Goal:** One permissive policy per `{table, role, action}`, combining the conditions with `OR`, preserving today's access exactly.
- **Why:** Advisor `multiple_permissive_policies` (63). Postgres evaluates every permissive policy for a role/action on every row; collapsing them cuts per-row planner + executor work on the broadest set of tables (budgets, consumables, meals, events, obligations, …).
- **Scope:** Per-table migration merging the `_select_member` / `_write_admin` style pairs into a single policy with an `OR`ed `USING`/`WITH CHECK`, keeping set-form helpers and `(select auth.uid())`. **Out of scope:** changing who can see what.
- **Acceptance:** advisor count → 0; the P0 RLS test suite still green (no access change); a warm `EXPLAIN ANALYZE` on a seeded multi-policy table shows equal or better time.
- **Measure:** advisor diff; `EXPLAIN ANALYZE` as `authenticated` on a seeded table before/after.
- **Size** M · **Priority** P1 · **Deps** PERF-13 · **Backlog** 15-Security / perf · **Risk:** an `OR` merge that widens access — gate on the existing RLS tests + a per-table before/after access matrix; roll back per table.

#### PERF-15 — p95 latency budget as a standing gate
- **Goal:** Per-route p95 budgets (reads ≤ 500 ms, writes ≤ 800 ms) tracked and alerted; a CI or scheduled check that flags regressions.
- **Why:** NFR targets exist but **nothing enforces them**. Without a gate, scale wins silently erode.
- **Scope:** Wire Vercel observability / Supabase logs to surface per-route p95; define budgets per hot route; a scheduled job (GitHub Actions, not a Vercel deploy) that reads metrics and alerts on breach. **Out of scope:** the load test that generates traffic (PERF-18) — this gate consumes whatever traffic exists.
- **Acceptance:** a dashboard of per-route p95; an alert fires on a seeded breach; budgets documented.
- **Measure:** the dashboard itself; a deliberate slow route trips the alert.
- **Size** M · **Priority** P1 · **Deps** — · **Backlog** 00-Architecture / 19-Perf · **Risk:** metric source gaps pre-launch — start with synthetic/load-test traffic (PERF-18) feeding it.

#### PERF-16 — Bundle-size budget gate
- **Goal:** Extend `check:bundle` (or add a sibling) with a **size ceiling** per route's first-load JS; fail CI on regression beyond a threshold.
- **Why:** `check:bundle` guards content (no help/prompts/zod in client) but not size; the perf passes keep shaving KB with no floor to defend them.
- **Scope:** Parse `next build` output, compare against a committed baseline per route, fail on >X KB gz growth. **Out of scope:** the content checks (already present).
- **Acceptance:** a deliberate large client import fails CI; baseline committed.
- **Measure:** CI run with a planted heavy import.
- **Size** S · **Priority** P1 · **Deps** — · **Backlog** CI / perf · **Risk:** flaky thresholds — set a generous delta and a per-route baseline, update deliberately.

#### PERF-17 — Advisor-clean standing gate
- **Goal:** A scheduled check runs `get_advisors` (security + performance) and alerts on any new WARN (and tracks INFO counts).
- **Why:** Advisors are authoritative and free; today they're only run by hand. New tables/policies silently reintroduce findings.
- **Scope:** Scheduled GitHub Action calling the advisor API; diff against a committed allowlist of known/accepted findings. **Out of scope:** auto-fixing.
- **Acceptance:** a seeded new unindexed FK / extra permissive policy trips the alert; allowlist documents accepted INFO items.
- **Measure:** the scheduled run output.
- **Size** S · **Priority** P1 · **Deps** — · **Backlog** CI / 15-Security · **Risk:** API access from CI — use a scoped token; never run as a Vercel deploy.

#### SEC-03 — Zod coverage audit + boundary lint rule
- **Goal:** Every API boundary that takes a body validates it with Zod `safeParse`; a lint rule enforces it going forward.
- **Why:** Only **44 of 97** `route.ts` handlers validate; the rest rely on casts/RLS. Server-side input validation is ASVS V5 / the API contract (`API-ARCHITECTURE.md`).
- **Scope:** Enumerate the ~53 unvalidated handlers; add schemas; add a lint/test that fails a body-reading handler with no `safeParse`. Include Server Actions as a tracked (separate) surface. **Out of scope:** changing response schemas.
- **Acceptance:** 100% of body-taking handlers validate; lint rule green and enforced; a new unvalidated handler fails CI.
- **Measure:** the audit list → 0 unvalidated; lint rule in CI.
- **Size** M · **Priority** P1 · **Deps** — · **Backlog** 15-Security / API · **Risk:** stricter validation rejecting currently-tolerated input — stage per handler, log-then-enforce.

#### SEC-04 — Service-role least-privilege audit + typed wrapper
- **Goal:** Enumerate the ~100 `createAdminClient()` call sites; assert each performs an explicit authz check before any cross-household operation; introduce a typed "admin-context" wrapper that requires passing the authorization it relied on.
- **Why:** The service role **bypasses RLS**; the "authorize first" contract is per-call-site and unenforced by types (`db/admin.ts:11-19`). Largest standing authz risk.
- **Scope:** Inventory + classify each site (audit-write, secret-read, worker, platform-admin, etc.); wrap the cross-household ones so the authz decision is a required argument; document the legitimate RLS-bypass set. **Out of scope:** removing the service role (needed for audit/secret/worker paths).
- **Acceptance:** every cross-household admin call goes through the wrapper with an explicit authz token; a test asserts no raw `createAdminClient()` cross-household mutation without it.
- **Measure:** the inventory; a lint/test for raw usage.
- **Size** M · **Priority** P1 · **Deps** — · **Backlog** 15-Security · **Risk:** large touch surface — do it in tranches by domain, each independently shippable.

#### SEC-05 — CSP hardening (remove `'unsafe-inline'` from `script-src`)
- **Goal:** Replace `'unsafe-inline'` with a nonce (or hash) strategy for Next's bootstrap and inline styles.
- **Why:** `security/headers.ts:35` ships `'unsafe-inline'` in production `script-src` — the headline ASVS V14 gap; materially weakens XSS defense.
- **Scope:** Per-request nonce threaded into the Next inline scripts and any inline style; keep the rest of the CSP. **Out of scope:** third-party script policy changes beyond what's needed.
- **Acceptance:** production CSP has no `'unsafe-inline'` in `script-src`; app renders and hydrates; CSP report-only period shows no violations.
- **Measure:** header inspection; browser console; optional CSP report endpoint.
- **Size** M · **Priority** P1 · **Deps** — · **Backlog** 15-Security · **Risk:** breaking hydration/styles — ship report-only first, then enforce; roll back to prior header.

#### SEC-06 — Rate-limit alerting + per-household fairness
- **Goal:** Alert on the "rate limit unavailable" warn (fail-open brown-out); confirm cost-bearing buckets (`ai.model`, `homesend.email`) are keyed per household so one household can't exhaust shared capacity.
- **Why:** `rate-limit.ts:107-110` fails open silently; at 100k a DB brown-out removes all cost control at once. Multi-tenancy fairness.
- **Scope:** Alert on the warn log; review bucket subjects for fairness; consider a short-TTL fallback cap when the RPC is unavailable. **Out of scope:** replacing the limiter (the Postgres store is sound).
- **Acceptance:** an induced RPC failure raises an alert; cost buckets documented as per-household.
- **Measure:** induced-failure test; bucket table review.
- **Size** S · **Priority** P1 · **Deps** — · **Backlog** 15-Security · **Risk:** a fallback cap that over-blocks — keep it generous and time-boxed.

#### SEC-09 — CSRF defense-in-depth (Origin/Referer check)
- **Goal:** State-changing handlers / Server Actions verify `Origin`/`Referer` against the app origin, in addition to the existing `sameSite:"lax"` + POST + `form-action 'self'`.
- **Why:** No explicit anti-CSRF check today; lax+POST is adequate but not belt-and-suspenders for top-level-navigation POSTs. ASVS V4.
- **Scope:** A shared helper applied to mutations; allow the webhook routes (sender-authenticated) through. **Out of scope:** a full double-submit token scheme unless a gap is found.
- **Acceptance:** a cross-origin POST is rejected; same-origin flows unaffected; test coverage.
- **Measure:** cross-origin request test.
- **Size** S · **Priority** P1 · **Deps** — · **Backlog** 15-Security · **Risk:** blocking a legitimate integration — allowlist known senders.

#### SEC-10 — RLS-coverage standing test
- **Goal:** Extend `scripts/test-setup-counts-rls.mjs` into a full coverage assertion: every household table has RLS **enabled**, has at least the expected policies, uses set-form helpers and `(select auth.uid())`, and no table is left world-readable.
- **Why:** The per-row-helper lint exists, but nothing asserts *coverage* (a new table shipped without RLS would pass today).
- **Scope:** Introspect `pg_policies`/`pg_class.relrowsecurity` in the DB test; fail on any household table missing RLS or a required policy. **Out of scope:** platform/reference tables (explicit allowlist).
- **Acceptance:** a seeded RLS-less household table fails the test; allowlist documents platform tables.
- **Measure:** the DB test run.
- **Size** M · **Priority** P1 · **Deps** — · **Backlog** 15-Security · **Risk:** allowlist drift — review it in the same PR that adds a platform table.

### Phase C — Scale-out

#### Summary
| id | title | P | size | dep |
|---|---|---|---|---|
| PERF-18 | Load-test harness + synthetic 100k data + capacity model | P2 | L | PERF-04 |
| PERF-05 | Partition append-only giants (notifications, audit, events) | P2 | L | PERF-18 |
| PERF-06 | De-poll the DB job queue | P2 | M | — |
| PERF-07 | Size & parallelize reconciler / dispatch | P2 | M | PERF-18 |
| PERF-08 | Summary/materialized agenda tables (conditional) | P2 | L | PERF-18 |
| PERF-12 | Async, index-covered account deletion | P2 | M | — |
| PERF-14 | Post-launch unused-index review | P2 | S | PERF-18 |
| PERF-19 | Autovacuum tuning for high-churn tables | P2 | M | PERF-18 |
| SEC-07 | MFA / second factor for Admins | P2 | M | owner |

#### PERF-18 — Load-test harness + synthetic 100k-household data + capacity model
- **Goal:** A repeatable harness that seeds realistic synthetic data (100k households, NFR member/notification ratios) and drives representative traffic; produces a capacity model (connections, QPS, storage, cost) and feeds PERF-15.
- **Why:** **No load test exists.** Every scale claim is unproven without it; this is the keystone of Phase C.
- **Scope:** Seed scripts (respecting RLS/tenant isolation), a traffic model for the hot routes, measurement capture (p95, `pg_stat_statements`, connection counts). Run against a dedicated project/branch, **never** the live household data. **Out of scope:** fixing what it finds (that's the other Phase-C stories).
- **Acceptance:** a documented run at 100k synthetic households with per-route p95, top queries, connection peak, storage footprint and a cost estimate; results in a progress note.
- **Measure:** the harness output itself.
- **Size** L · **Priority** P2 · **Deps** PERF-04 · **Backlog** 19-Perf · **Risk:** seeding real-looking PII — use synthetic generators only; isolate the project.

#### PERF-05 — Partition the append-only giants
- **Goal:** Range/time-partition `notification_events`, `notifications`, `audit_events`, `hometalk_channel_events`, `whatsapp_messages` (and similar) ahead of 10M → 200M rows/month.
- **Why:** NFR says 10M notifications/month at 25k households → ~40M at 100k, ~200M at 500k. Unpartitioned, these dominate storage, vacuum and index time.
- **Scope:** Declarative partitioning by month (or household hash where range doesn't fit), with a retention/detach policy tied to the existing retention work; migrate existing rows. **Out of scope:** changing what's logged.
- **Acceptance:** partitioned tables live; inserts/reads unchanged; old partitions detachable; a load-test insert of N million rows stays within vacuum/latency budget.
- **Measure:** PERF-18 run with partitions vs without; partition pruning in `EXPLAIN`.
- **Size** L · **Priority** P2 · **Deps** PERF-18 · **Backlog** 23-Notifications / 15-Security(audit) · **Risk:** partition migration on a live large table — do it before the tables are large (now), or with a tested online strategy; reversible by merging partitions.

#### PERF-06 — De-poll the DB job queue
- **Goal:** Replace tight polling of `claim_portal_fetch_job()` / `claim_jobs` with a leased + `LISTEN/NOTIFY` or external-queue trigger; reduce idle poll frequency.
- **Why:** `pg_stat_statements` shows ~55k claim calls — a worker hammering the DB-as-queue. At 100k households the poll rate × worker count becomes a standing DB load independent of real work.
- **Scope:** Keep the atomic claim RPC (it's correct); change the *trigger* from tight polling to notify-driven or a managed queue (owner §7 if external); back off when idle. **Out of scope:** the work the jobs do.
- **Acceptance:** claim-call rate at idle drops by an order of magnitude with no latency increase on job pickup; load test confirms pickup latency.
- **Measure:** `pg_stat_statements` claim-call rate; job pickup latency.
- **Size** M · **Priority** P2 · **Deps** — · **Backlog** 24-HomePlaces (connections/portal) · **Risk:** notify delivery gaps — keep a slow safety poll as backstop.

#### PERF-07 — Size & parallelize the reconciler / dispatch
- **Goal:** Confirm the trigger-driven `next_due_at` keeps the per-tick due-set under the caps; raise/parallelize `STAGE_HOUSEHOLDS_PER_TICK` (40) and the 500/day sweep as household count grows; consider parallel write phase.
- **Why:** Reconciler is idempotent and bounded but the write phase is **serial per household** (`reconcile.ts:402-445`); caps assume a small due-set. Unverified at 100k; if the due-set exceeds 40/tick the daily sweep lags.
- **Scope:** Instrument due-set size under load; tune caps; parallelize independent household writes; keep idempotency. **Out of scope:** changing reminder semantics.
- **Acceptance:** at 100k synthetic households, reminders fire within the NFR 1 s decision budget and no backlog grows across ticks.
- **Measure:** PERF-18 run: due-set size per tick, reminder latency, backlog depth.
- **Size** M · **Priority** P2 · **Deps** PERF-18 · **Backlog** 23-Notifications · **Risk:** parallel writes causing contention — bound concurrency; idempotency already tolerates retries.

#### PERF-08 — Summary / materialized agenda tables (conditional)
- **Goal:** If (and only if) the load test shows per-household agenda reads breaching budget, precompute Today/Home rollups into a summary table refreshed off the request path.
- **Why:** The agenda is already one bounded wave; materialization is only worth its complexity if measurements demand it. Listed so it's considered, gated on evidence.
- **Scope:** A per-household summary table refreshed in `after()`/the clock; read it on the hot path, fall back to live reads. **Out of scope:** building it speculatively — **do not start without PERF-18 evidence.**
- **Acceptance:** only opened if PERF-18 shows a breach; then: Home p95 within budget with the summary, staleness bounded and acceptable.
- **Measure:** PERF-18 before/after.
- **Size** L · **Priority** P2 · **Deps** PERF-18 · **Backlog** 19-Perf · **Risk:** staleness/complexity — the reason it's conditional. **What NOT to do yet:** don't build this until data says so.

#### PERF-12 — Async, index-covered account deletion
- **Goal:** Make household/account deletion non-blocking and ensure every cascade FK path is indexed.
- **Why:** `DELETE FROM households … CASCADE` measured ~638 ms with almost no data; at scale a synchronous cascade delete blocks and can time out. Ties to retention/GDPR deletion (RTO/consent).
- **Scope:** Move deletion to a background job with progress; verify FK indexes on the cascade path; batch large child deletes. **Out of scope:** what gets deleted (retention policy already defined).
- **Acceptance:** a seeded large household deletes without blocking a request; all cascade FKs indexed; audit of the deletion.
- **Measure:** deletion timing on a seeded large household; advisor FK check.
- **Size** M · **Priority** P2 · **Deps** — · **Backlog** 15-Security / retention · **Risk:** partial deletion visible mid-run — make it transactional per batch and idempotent.

#### PERF-14 — Post-launch unused-index review
- **Goal:** Re-run the performance advisor against **real** post-launch traffic and drop confirmed-unused indexes.
- **Why:** 152 `unused_index` flags today are almost entirely an artifact of no traffic — dropping now would be wrong. The signal is only valid with real usage stats.
- **Scope:** After meaningful traffic (or a representative load test), diff `pg_stat_user_indexes`; drop only indexes unused across a long window and not needed for a known rare path. **Out of scope:** dropping anything pre-traffic.
- **Acceptance:** a documented review with per-index justification; drops only after a sustained-zero-usage window.
- **Measure:** `pg_stat_user_indexes` over the window.
- **Size** S · **Priority** P2 · **Deps** PERF-18 (or real launch traffic) · **Backlog** 19-Perf · **Risk:** dropping an index a rare query needs — keep the migration reversible; re-create on regression.

#### PERF-19 — Autovacuum tuning for high-churn tables
- **Goal:** Tune autovacuum/fillfactor for churny tables (`rate_limit_counters`, pg_net queue tables, notification tables, idempotency keys) and harden the opportunistic rate-limit sweep.
- **Why:** `rate_limit_counters` sweeps only at `random() < 0.01`; pg_net queue tables see thousands of insert/delete cycles. At scale, bloat and vacuum lag hurt p95.
- **Scope:** Per-table autovacuum settings; a deterministic sweep for `rate_limit_counters`; measure bloat. **Out of scope:** app logic.
- **Acceptance:** bloat stays bounded under the load test; vacuum keeps up.
- **Measure:** bloat estimate + `pg_stat_user_tables` dead-tuple ratio under PERF-18.
- **Size** M · **Priority** P2 · **Deps** PERF-18 · **Backlog** 19-Perf · **Risk:** over-aggressive vacuum costing IO — tune against the load test.

#### SEC-07 — MFA / second factor for Admins
- **Goal:** Offer TOTP/WebAuthn as a second factor, required (or strongly encouraged) for Admins and before the most sensitive actions, layered with the existing step-up.
- **Why:** No MFA today; step-up is password re-confirmation only. ASVS V2 gap. Protects the Admin role that can change autonomy, finance and children's settings.
- **Scope:** Supabase Auth MFA (TOTP) enrolment + enforcement policy; tie into step-up for payment/export/deletion. **Out of scope:** SMS OTP (phishable). Owner decides the policy (§7).
- **Acceptance:** an Admin can enrol a TOTP/WebAuthn factor; sensitive actions require it per policy; recovery path defined.
- **Measure:** enrolment + challenge flow test.
- **Size** M · **Priority** P2 · **Deps** owner policy decision · **Backlog** 15-Security · **Risk:** lockout/recovery — define recovery codes before enforcing.

### Phase D — Hardening & drills

#### Summary
| id | title | P | size | dep |
|---|---|---|---|---|
| SEC-11 | Backups + restore drill + DR & incident runbooks | P2 | M | — |
| SEC-12 | Retention/children-privacy review + pen-test readiness | P2 | M | — |
| SEC-13 | Supabase project hardening (pg_net schema, search_path, extensions) | P2 | S | — |

#### SEC-11 — Backups + restore drill + DR & incident runbooks
- **Goal:** Confirm PITR is enabled at the chosen tier; run a **restore drill** proving RPO ≤ 15 min / RTO ≤ 1 hr; write a DR runbook and an incident-response runbook.
- **Why:** NFR sets RPO/RTO but nothing proves them; a backup you've never restored is a hope, not a control.
- **Scope:** Verify backup config; restore to a scratch project and measure; document steps, owners, comms. **Out of scope:** multi-region active-active (over-engineering for now — see §7).
- **Acceptance:** a timed, documented restore drill meeting RPO/RTO; runbooks committed in `docs/`.
- **Measure:** the drill's measured RPO/RTO.
- **Size** M · **Priority** P2 · **Deps** owner (PITR tier) · **Backlog** 00-Architecture · **Risk:** drill against prod by mistake — restore to a scratch project only.

#### SEC-12 — Retention / children-privacy review + pen-test readiness
- **Goal:** Verify retention/deletion/export controls enforce at scale (building on the retention work already shipped); review children's age-appropriate access and privacy boundaries end-to-end; produce an ASVS-mapped pen-test readiness checklist.
- **Why:** `SECURITY-BASELINE.md` and product rules require data minimization, children's privacy and export/deletion; a pen test will expect an ASVS mapping and evidence. Pulls the SEC stories together into an auditable posture.
- **Scope:** Trace retention jobs, export and deletion for coverage; review child-visibility helpers against the product rules; map controls to ASVS with evidence/gaps. **Out of scope:** the pen test itself (external).
- **Acceptance:** an ASVS coverage matrix with evidence per control and a named gap list; children's-privacy review signed off.
- **Measure:** the matrix; coverage tests for retention/export/deletion.
- **Size** M · **Priority** P2 · **Deps** SEC-01..SEC-10 (evidence) · **Backlog** 15-Security · **Risk:** scope creep — time-box to a readiness checklist, not a remediation of everything found.

#### SEC-13 — Supabase project hardening
- **Goal:** Move `pg_net` out of `public` into a dedicated schema; review the three functions using `search_path = public, pg_temp` (vs the `""` standard); confirm no unintended schema is exposed via PostgREST; review extension placement.
- **Why:** Advisor `extension_in_public` (pg_net); defense-in-depth on function `search_path` and exposed surface.
- **Scope:** Schema move with a grant/search_path fix; set the three functions to an explicit safe `search_path`; review `pgrst` exposed schemas. **Out of scope:** removing extensions in use.
- **Acceptance:** advisor `extension_in_public` → 0; the clocks that use pg_net still fire; functions have explicit safe search_path.
- **Measure:** advisor diff; clock smoke-test.
- **Size** S · **Priority** P2 · **Deps** — · **Backlog** 15-Security · **Risk:** moving pg_net breaks the cron HTTP calls — update the `net.http_post` references in the same migration; test one clock fire.

---

## 5. Standing gates to add to CI (consolidated)

These are the stories that become **permanent gates** so wins don't regress. Run them on **GitHub Actions or a schedule — never as a Vercel deployment** (deploy-slot budget, `CLAUDE.md`).

| Gate | Story | Enforces |
|---|---|---|
| p95 latency budget | PERF-15 | reads ≤ 500 ms / writes ≤ 800 ms per route |
| Bundle-size budget | PERF-16 | per-route first-load JS ceiling |
| Advisor-clean | PERF-17 | no new security/perf advisor WARN |
| `pg_stat_statements` regression | PERF-18 | top-query mean-time watch under load |
| RLS coverage | SEC-10 | every household table RLS-enabled, set-form, correct |
| Dependency / SAST / secret-history | SEC-02 | OWASP A06 supply-chain |
| Zod boundary lint | SEC-03 | every body-taking handler validates |
| Service-role usage lint | SEC-04 | no raw cross-household admin mutation |

---

## 6. Capacity & cost model (estimates — clearly labelled)

Derived from NFR ratios (25,000 households ↔ 150,000 members ↔ 10M notifications/month → **6 members** and **~400 notifications** per household per month). **All figures are order-of-magnitude estimates for planning, not measurements.**

| Dimension | 100k households (est.) | 500k households (est.) | Notes |
|---|---|---|---|
| Members | ~600k | ~3M | 6/household |
| Notifications/month | ~40M | ~200M | Drives PERF-05 partitioning |
| State transitions/month | ~20M | ~100M | NFR: 5M at 25k |
| Peak DB connections (clients) | thousands concurrent | tens of thousands | Only survivable via Supavisor transaction mode onto ≤ a few hundred backends (PERF-04) |
| Direct `max_connections` | 60 today → needs a larger compute tier | larger still + read replica(s) | Owner tier decision (§7) |
| Notification-row storage/year | tens of GB | hundreds of GB | Partition + retention/detach (PERF-05) |
| Read traffic | Home ≈ 36 REST calls/load post-B4; multiply by DAU | — | Keep the parallel-wave shape; summary tables only if PERF-18 says so |

**Cost guardrail check:** NFR caps core app + DB at **US$2,000/mo at 10k active households** (excl. AI/payments/messaging). Linear (optimistic) that's ~US$20k/mo at 100k — but tier jumps (Supabase compute + read replicas, Vercel plan, WAF) are **step functions, not linear**, and the NFR itself flags >25% overage for architecture review. AI/background cost is separately capped at **≤ US$0.75/active household/month**. A real cost model needs the PERF-18 run (compute size, egress, pg_net volume, AI token spend).

**What this implies:** the 25k design point is sound; 100k is mostly a **tier + pooling + partitioning + queue** exercise on top of it, not a rewrite — *provided* PERF-18 confirms the hot paths hold.

---

## 7. Open decisions for the owner

1. **Supabase compute tier & read replicas.** `max_connections = 60` and a small instance will not serve 100k households. Decision: target tier, and whether to add read replica(s) for read-heavy hot paths. (Budget.)
2. **Vercel plan.** Currently **Hobby** (100 deploys/day cap already constrains the workflow). 100k households needs Pro/Enterprise for limits, observability and firewall. (Budget.)
3. **WAF / DDoS / bot protection.** Enable Vercel firewall / attack-challenge, or front with a WAF? Needed for abuse at scale beyond app-level rate limits. (Budget.)
4. **Secret-manager mechanism for SEC-01.** Supabase Vault, `pgcrypto` with an app-held key, or an external KMS? Determines the encryption-at-rest design.
5. **MFA policy (SEC-07).** Mandatory for Admins, or opt-in? Which actions force a second factor? Recovery mechanism?
6. **Async backbone (PERF-06/07).** Stay on `pg_cron + pg_net + LISTEN/NOTIFY`, or adopt a managed queue (e.g. QStash/SQS-style) for workers and the delivery clock? (Operational + possibly budget.)
7. **PITR / backup retention tier (SEC-11).** Confirm the plan that meets RPO ≤ 15 min / RTO ≤ 1 hr. (Budget.)
8. **DR ambition.** Single-region with PITR (proposed), or multi-region? Multi-region is likely over-engineering for launch — confirm.

---

*Review note: approve stories individually. Phase A (quick wins + the two P0 security items) can start immediately and independently; Phase C's scale work is gated on PERF-18 (the load test) so we build against evidence, not guesses. Nothing in this PR changes application code.*
