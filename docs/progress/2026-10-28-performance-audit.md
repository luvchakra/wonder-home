# Performance audit: child-visibility RLS in set form, near-term windows, zod out of the browser (2026-10-28)

Requested: a deep, evidence-based performance audit (server data path, database,
caching, bundle, rendering, edge) that builds on the 2026-10-19 and earlier
2026-10-28 passes, ships the safe high-value fixes, and leaves a prioritised
backlog. It also takes in the open follow-up on unbounded hot reads.

## How it was measured
- **Supabase advisors**, both kinds, on the live project. Performance: no unindexed
  FKs and no `auth_rls_initplan` left. What remains is 178 "unused index" and 62
  "multiple permissive policies", both advisory. Security: 5 `chat_*` SECURITY DEFINER
  RPCs callable by `anon`, plus 25 callable by `authenticated` (intended, guarded) and
  `pg_net` in `public`.
- **`pg_stat_statements`**, top 30 by total time. The heaviest app query is
  `household_setup_counts` (807 calls, mean 54 ms with cold planning). PostgREST's schema
  reloads (`pg_timezone_names` and the type introspection) are off the request path.
- **Live data is tiny.** The largest household has 7 events and 29 responsibilities, so
  plans on today's rows prove nothing about growth. Volume was simulated **inside a
  rolled-back transaction** on the live project: 3,000 school items for one real
  household, timed as `authenticated` with a real member's JWT claims.
- **Bundle**: a production build (`next build`, Next 16.3.4), with first-load JS per route
  summed from each route's client-reference manifest and gzipped at level 9.
- **Code review** of Home, Today, Family, Meals, School and HomeTalk, plus
  `_lib/session.ts`, `_lib/agenda.ts` and the middleware.

## Findings, ranked by impact × effort

| # | Finding | Evidence | Impact | Effort | Status |
|---|---|---|---|---|---|
| 1 | `wh.may_see_child` / `wh.may_change_child` are per-row helpers in 50 policy uses on 15 school and child tables. `school_items` has two permissive policies with the same qual, so the helper ran twice per row. | 3,007-row `school_items` read: **891 ms** before, **2.0 ms** after. 52-row window: **15.4 → 0.51 ms**. | Very high (scales with every school row) | S | **Shipped** |
| 2 | Today and the look-ahead read every bill and school item the household ever had. | Same household: unbounded 3,007 rows / 1,255 KB vs 52 rows / 21 KB in the window. | High | S | **Shipped** |
| 3 | A window by household and due date had no usable index: `school_items_due_idx` and `obligations_due_idx` are partial (open rows only). | Plan before: Index Scan on `school_items_child_idx` across every household, 756 buffers for 52 rows. | Medium (grows with all households) | S | **Shipped** |
| 4 | `/settings/voice` shipped all of zod v4 (408 KB raw) because the client form imported option constants from the module that defines the zod schema. | First load **1,106 KB / 309 KB gz → 714 KB / 217 KB gz** (−92 KB gz, −30%). Zod is now in no client chunk. | Medium (one route) | S | **Shipped** + guard |
| 5 | HomeSend write and verify paths read the household's whole bill or school history to `.find()` one id. | 4 call sites in `home-send-writes.ts` and `home-send-plan-actions.ts`. | Medium (grows with history) | XS | **Shipped** |
| 6 | Meals and School awaited the plan check (`may()`, one `household_subscriptions` trip, about 5,000 calls in stats) before starting their batch. | `meals/page.tsx`, `school/page.tsx` | 1 RT per load | XS | **Shipped** |
| 7 | 5 `chat_*` SECURITY DEFINER RPCs could be called by `anon`. `revoke … from public` doesn't remove Supabase's direct `anon` grant. The bodies refuse non-members, so nothing leaked. | Security advisor lint 0028 | Security hygiene | XS | **Shipped** |
| 8 | Other per-row helpers are still in policies: `may_see_health` 11, `is_child_of` 10, `may_see_event` 10, `has_role` 10, `may_see_finance` 6, and `is_member` / `is_household_admin` / `member_id` 13 outside `public`. | `pg_policies` scan | High where the tables grow (health, events) | M | Backlog B1 |
| 9 | The voice engine loads on every page, `/sign-in` included (`LiveTalkProvider` imports `use-gemini-live`, `use-live-voice` and `live-float` eagerly). | Chunk of 39.3 KB / 14.4 KB gz on every route | Medium | M | Backlog B2 |
| 10 | The app-shell chunk carries Radix Dialog, DropdownMenu and Popper for the drawer and the viewer menu on 51 routes. | 128 KB / 41 KB gz | Medium | M | Backlog B3 |
| 11 | Home reads `family_events` 2–3× (dashboard +14 d; `familyAgenda` from now, unbounded; setup count). Today's household tab reads events, meals, obligations, school items and consumables twice (page + agenda). Meals reads `meals` twice (`mealAgenda` + the week). | Server audit | 2–5 queries per load | M | Backlog B4 |
| 12 | HomeTalk turn: `pendingAmaf` → `pendingWelcome` → the main batch run in sequence. `consume` runs before `hitRateLimit`. A stale `household_context` is rebuilt on the turn path. | `hometalk-turn.ts:333-410`, `homebrain/context-store.ts:394` | 2–3 RT per turn | M | Backlog B5 |
| 13 | `/ai` page: `offerToFillDetails` → `currentSessionId` → `listMessages` run in sequence. | `ai/page.tsx:93-111` | 1–2 RT | S | Backlog B6 |
| 14 | Admin Home: `loadSetupFacts` counts members, pets, responsibilities and availability, which the dashboard already reads; onboarding reads them a third time. | `setup-repository.ts`, `home-dashboard.tsx:952` | 6–10 queries (Admins) | M | Backlog B7 |
| 15 | No `next/dynamic` anywhere. Sheets and forms (`HomeSendSheet`, finance and meal forms) ship on first load. `/health` (70 KB) and `/ai` (65 KB) are the biggest page chunks. | Bundle audit | 5–15 KB gz each | S each | Backlog B8 |
| 16 | The middleware runs on API routes, `sw.js`, the manifest, fonts and `.js`/`.css`. It does a local `getClaims()`, so no round trip unless the token is refreshing. | `middleware.ts` matcher | Low | XS | Backlog B9 |
| 17 | Only one `loading.tsx` (root). `/ai`, `/family`, `/groceries` and `/meals` show the root fallback while they await. | — | Perceived only | XS | Backlog B10 |

**Checked and healthy:**
- No `select("*")` on a hot path. The one in a repository (`loadVoiceSettings`) is a single-row read.
- No N+1 on the focus pages.
- Home streams: it awaits only the session; Today, the hero, the tags and the body each have their own Suspense.
- Fonts: `next/font`, `swap`, latin subset, two preloads.
- No public image over 200 KB.
- `optimizePackageImports` covers lucide-react and radix-ui.
- `@google/genai` is already lazy-loaded.
- `check:bundle` was green before this change.
- Every page is `force-dynamic`. That is correct for per-household data, and the only platform data (holidays) is already cached per server.

**Measured, not shipped:**
- Rewriting `household_setup_counts` in plpgsql, so its plan is cached per session: 6.24 → 5.67 ms warm (−9%). Not worth a migration.
- `familyAgenda` and `mealAgenda` read from now with no upper bound, but they grow only with future plans, not history. Bounding them changes the visible "N of M checked" count, so that belongs with B4.

## What shipped
- **`20261028171000_child_visibility_set_form.sql`**
  - Adds `wh.my_guarded_children()`, which returns `(household_id, child_member_id)` for each child the caller guards.
  - Rewrites every policy that called `may_see_child` or `may_change_child`, in place (`alter policy`), to the same three branches as set predicates: admin household, own membership, guarded child.
  - Fails if any policy still calls them.
  - Adds `school_items (household_id, due_at)` and `obligations (household_id, due_on)` indexes.
  - Verified on the live project inside a rolled-back transaction: visible row counts on all 15 tables were identical before and after for every active profile (6 of 6 identical).
- **`20261028170000_chat_rpcs_revoke_anon.sql`**: `revoke execute … from anon` on the six `chat_*` RPCs.
- **`scripts/test-setup-counts-rls.mjs`**: the "no per-row helper in a policy" test now also fails on `may_see_child` / `may_change_child`.
- **Near-term windows (`ai/predictions.ts` `lookAheadWindow`)**
  - Today and `householdPredictions` read bills from today−2 d to +16 d, and school items over the same span. That is the 14-day horizon plus a two-day time-zone margin on each side.
  - The window covers everything Today shows (bills due today; open school items due on the household's local today) and everything the look-ahead predicts.
  - A unit test proves that predictions from the window equal predictions from the whole history.
  - The shared readers keep their unbounded default (`listSchoolItems` and `listObligations` take an optional `dueFrom`/`dueTo`), so Bills, HomeSend matching, context and HomeTalk still see everything.
- **By-id reads**: `listSchoolItems` and `listObligations` take `{ id }`. The four HomeSend write and verify sites use it.
- **`voice/settings-options.ts`**: the voice option lists and labels, with no zod. `voice/settings.ts` re-exports them, so server callers are unchanged. `voice-forms.tsx` imports the zod-free module.
- **`check:bundle`** fails if zod (`$ZodError` / `$ZodType`) reaches a client chunk.
- **Meals, School**: `may()` starts alongside the page batch. A refused plan drops the results.

## Verified
- `npm run typecheck` (all workspaces) is clean.
- ESLint is clean on the changed web files.
- `lint:migrations` (189) and `lint:boundaries` (1,643 files) pass.
- vitest: predictions, voice, school, finance, meals, school pages, settings, today and the HomeSend actions all pass (34 + 11 files, 574 tests).
- `test:db` on a fresh local database with every migration applied: 789 tests, 788 pass, 0 fail, 1 skipped.
- `next build` passes, and `check:bundle` passes with the new zod guard.
- **Not done:** a browser check and warm timings on the production build against the live database. The container has no `apps/web/.env.local` (service-role key), so it cannot sign in a QA household. The database numbers above were taken on the live project as `authenticated`. No QA users or rows were created; every synthetic row was rolled back.

## Live migration
`apply_migration` times out in cloud sessions, so the owner runs both migration files in order in the SQL Editor. Until then, the live project still runs the per-row helpers.
- After applying, run `npm run verify:live`.
- Then check with `select count(*) from pg_policies where coalesce(qual,'')||coalesce(with_check,'') ~ 'wh\.may_(see|change)_child\(';`, which should return 0.
- The migrations are safe in either order with the code: the windowed reads work with or without the new indexes.

## Proposed CLAUDE.md rules (Performance section)
Not applied yet; for the owner to accept. Each was earned by a measured finding above.
1. **Window a list read at the hot call site by what the screen can show** (Today: 3,007 → 52 rows). Pass an explicit window from the screen's own horizon plus a time-zone margin, and prove with a test that the output is unchanged. Never change a shared reader's default, and never use a bare `.limit()`.
2. **A write reads back one row by id**, never a list then `.find()`.
3. **No per-row helper in a policy, the child-visibility ones included**: use `wh.my_guarded_children()` alongside the other set forms (891 → 2 ms). Also extend the existing RLS section's list.
4. **A client component never imports a module that imports zod.** Put option lists in a zod-free module (−92 KB gz). `check:bundle` enforces this.
5. **Measure growth, not today's rows**: the live project is pre-launch, so simulate volume inside `begin … rollback` and time it as `authenticated` with a member's claims.

## Backlog (prioritised; each its own PR)
- **B1** (done, [backlog note](2026-10-28-performance-backlog.md#b1-the-last-per-row-policy-helpers-in-set-form); live once the owner runs `20261028190000`): put the remaining per-row policy helpers into set form (`may_see_health`, `may_see_event`, `is_child_of`, `has_role`, `may_see_finance`, and the 13 `is_member` / `is_household_admin` / `member_id` uses outside `public`). Use the same in-place rewrite, prove counts are equal, and extend the guard test.
- **B2** (done, [backlog note](2026-10-28-performance-backlog.md#b2--b3-voice-engines-drawer-and-avatar-menu-load-after-the-page)): load the voice engine on first talk. Move `LiveTalkProvider` into the signed-in layout group (14 KB gz on every route).
- **B3** (done, same note): render the drawer and viewer-menu content on open, or load it with `next/dynamic` (about 20–30 KB gz on 51 routes).
- **B4** (done, [backlog note](2026-10-28-performance-backlog.md#b4-one-read-per-table-on-home-today-and-meals)): one read per table per request. Pass rows into the agendas, or `cache()` the list readers per (household, range), for Home, Today's household tab and Meals. Settle `familyAgenda` and `mealAgenda` windows together with the "checked" wording.
- **B4b** (new, from B4): the Calendar's Day view reads `family_events`, `school_items` and `obligations` again for the calendar itself; share the Today plan's reads.
- **B4c** (new, from B4): Meals reads `recipes` and `consumables` twice each with different columns (`listRecipesForEdit` / `recipesWithIngredients`, `listGroceries` / `listConsumables`).
- **B5** (done, [backlog note](2026-10-28-performance-backlog.md#b5-the-hometalk-turn); a stale context is served only when behind by age alone): HomeTalk turn batching (`pendingAmaf`, `pendingWelcome` and the main reads in one wave). Check the rate limit before `consume`. Serve a stale `household_context` and rebuild it in `after()`. Move the `homebrain_misses` insert from `void` to `after()`.
- **B6** (done, [backlog note](2026-10-28-performance-backlog.md#b6--b10-ai-history-alongside-the-offer-a-loading-shape-per-screen)): `/ai`: start `listMessages` alongside `offerToFillDetails`.
- **B7** (done, [backlog note](2026-10-28-performance-backlog.md#b7-admin-homes-setup-progress-from-rows-home-already-read); the one-RPC count stays, the setup card stops re-reading): Admin Home: work out setup counts from the rows the dashboard already reads.
- **B8** (HomeSend done, [backlog note](2026-10-28-performance-backlog.md#b8-homesends-sheet-loads-on-first-use), `/ai` −19.7 KB gz; forms open as B8b): `next/dynamic` for `HomeSendSheet` and the below-the-fold finance, meal and health forms.
- **B8b** (open, from B8): split the health (15.2 KB gz, `/health` only), meal (10.8 KB gz) and bill form bodies out of their buttons, loaded on open; check each add and edit in the browser.
- **B9** (done, [backlog note](2026-10-28-performance-backlog.md#b9-the-middleware-skips-what-never-carries-a-session)): narrow the middleware matcher (static `js`, `css`, `woff2`, `json`, `txt`, and webhook APIs).
- **B10** (done, same note): `loading.tsx` for `/ai`, `/family`, `/groceries` and `/meals`.
- **Advisory**: leaked-password protection is off (Auth setting, owner). `pg_net` is in `public`. The 62 overlapping permissive policies are a dedicated RLS consolidation pass; `school_items`' pair was the costly one and is now cheap.

## QA cleanup
No QA accounts or households were created. All synthetic rows were inside transactions that were rolled back. The local Postgres used for `test:db` is in the container only. Scratch files are in the session scratchpad, outside the repository.
