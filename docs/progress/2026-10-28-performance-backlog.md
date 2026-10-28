# Performance backlog from the 2026-10-28 audit

Works through "Backlog" in [2026-10-28-performance-audit.md](2026-10-28-performance-audit.md), one PR per item. Each section says what changed, the numbers before and after, and what was verified.

## B1: the last per-row policy helpers in set form

**Migration:** `supabase/migrations/20261028190000_policy_helpers_set_form.sql`.

What it does:
- Adds six set-form helpers, each `security definer`, granted to `authenticated` only:
  - `wh.role_households(roles)`
  - `wh.finance_households()`
  - `wh.my_household_children()`
  - `wh.my_health_consents()`
  - `wh.my_participant_events()`
  - `wh.my_visible_events()`
- Rewrites every policy in place (`alter policy`) that called one of these per-row helpers: `may_see_health`, `may_see_event`, `is_event_participant` (2 more, on `family_events`), `is_child_of`, `has_role` or `may_see_finance`.
- Also rewrites the `is_member`, `is_household_admin` and `member_id` calls on `storage.objects`.
- The migration header gives the branch-by-branch equivalence.
- It fails if any policy, in any schema, still calls a per-row `wh` helper.
- The old helpers stay for non-policy callers.

**Guard:** `scripts/test-setup-counts-rls.mjs` now checks every schema, not only `public`, and lists all eleven per-row helpers.

**Live equivalence** was checked on the live project inside one transaction that rolled back:
- The check applied the migration, then compared every changed policy's old and new `using` and `with check` expressions, row by row, across every row of the table.
- It ran for each of the 6 active profiles plus one outsider.
- 56 policies were rewritten. Of the 476 expression comparisons, 0 differed; 516 rows were true under the new expressions.
- This is stricter than comparing visible counts, because it covers the write checks as well as the reads.

**Timing on the live project**, as `authenticated` with a Head's JWT claims:
- One household with 3,000 synthetic rows in each table, rolled back.
- Each figure is the best of 3 runs of `select count(*)`.

| Table | Rows visible | Before | After |
|---|---|---|---|
| `health_vitals` | 3,000 | 711.7 ms | 1.5 ms |
| `family_events` (participants-only) | 3,006 | 355.6 ms | 5.5 ms |
| `event_participants` | 3,000 | 1,271.1 ms | 10.9 ms |
| `obligations` | 3,003 | 2.0 ms | 1.3 ms |

**Verified locally:**
- `test:db` on a fresh local database with every migration applied: 789 tests, 788 pass, 0 fail, 1 skipped.
- `lint:migrations` passes on all 191 migrations.

**Live:** not yet. `apply_migration` times out in cloud sessions, so the owner runs the file in the SQL Editor.
- Then check with `select count(*) from pg_policies where coalesce(qual,'')||coalesce(with_check,'') ~ 'wh\.(may_see_health|may_see_event|is_event_participant|is_child_of|has_role|may_see_finance|is_member|is_household_admin|member_id|may_see_child|may_change_child)\(';`. It should return 0.
- Then run `npm run verify:live`.
- No code reads a changed value, so the migration is safe before or after any deploy.

**QA cleanup:** no QA accounts or households were created. Every synthetic row was inside a rolled-back transaction.

## B2 + B3: voice engines, drawer and avatar menu load after the page

They are batched in one PR because both defer app-wide client code, are measured the same way, and touch the same note.

### B2: voice engines
- **`ui/live-talk-engines.tsx`** now holds both live engines, `useLiveVoice` and `useGeminiLive`.
- `LiveTalkProvider` stays at the root so a conversation still outlives the screen it started on.
- The provider mounts the engines (through `React.lazy`) the first time a screen calls `configure`. Only HomeTalk's composer calls it, so on `/ai` the engines are ready before the mic is tapped and the start stays inside the tap.
- A `start` that comes before the engines arrive waits for them (`pendingStart`).
- The provider keeps the engines' state in its own state, updated only when a value changes. It no longer re-renders on every engine render.

The audit suggested moving the provider into a signed-in layout group. There is no such group: every route sits at the root. Building one would move 30+ route folders and their relative imports. Loading on `configure` keeps the engines off every page that cannot talk, `/ai`'s siblings included.

### B3: drawer and avatar menu
- **`shell/nav-drawer-panel.tsx`** holds the drawer (Radix Dialog and its contents).
- **`shell/viewer-menu-content.tsx`** holds the avatar menu (Radix DropdownMenu, Popper and the install sheet).
- `shell/when-idle.ts` `useLoadedLater` fetches each part once the page is idle, or at once on a tap that comes first, and keeps the loaded component in state.
- It does not use `React.lazy`: a Suspense reveal is held back about 300 ms on first show. Measured with `React.lazy`, the drawer opened in 453 ms, against 134–156 ms on `main`. With state, it opens in 127–179 ms.
- Until its code arrives, the avatar is a plain button with the same name and look (`viewer-menu-trigger.ts`). A tap opens the menu as soon as the code is here (`defaultOpen`). On close, focus goes back to the avatar explicitly, because Radix did not return it when the menu had opened by itself.

### Numbers
First-load JS, gzipped, from `next build`. Each figure is the route's client-reference entry chunks plus the root main files. `main` is at 971e5a9.

| Route | `main` | B2 only | B3 only | B2 + B3 |
|---|---|---|---|---|
| `/` | 265.0 KB | 258.3 | 242.2 | **235.4** (−29.6) |
| `/sign-in` | 203.0 | 196.2 | 203.0 | **196.2** (−6.8) |
| `/today` | 261.9 | 255.1 | 239.2 | **232.4** (−29.5) |
| `/groceries` | 261.0 | 254.2 | 237.9 | **231.1** (−29.9) |
| `/meals` | 265.8 | 259.0 | 243.2 | **236.5** (−29.3) |
| `/health` | 263.2 | 256.5 | 240.4 | **233.6** (−29.6) |
| `/family` | 259.3 | 252.5 | 236.6 | **229.8** (−29.5) |
| `/ai` | 285.4 | 283.3 | 282.5 | **280.3** (−5.1) |

### Verified
These ran in the browser against a production build pointed at the live project, signed in as a QA household:
- **B2:** the engine chunk is never requested on `/sign-in`, `/today` or `/groceries`. It is requested on `/ai`. Leaving `/ai` keeps the app working with no console errors, at 360 px and 1280 px.
- **B3, 360 px:** the drawer opens with all 15 links, closes on Escape and reopens.
- **B3, both widths:** the avatar menu shows all 6 items, focus moves into it, Escape returns focus to the avatar, and Enter reopens it.
- **B3, early tap:** a tap before the code arrives was checked 6 of 6 times (3 runs at each width). The menu opens, focus returns to the avatar, and Enter reopens it.
- **Not changed:** after the drawer closes, focus goes to the page body, the same as on `main`.
- Typecheck is clean for all workspaces.
- vitest on `components/` and `/ai`: 9 files, 50 tests pass.
- `check:bundle` passes.
- The E2E shell and landing specs: 38 of 38 pass.
- `e2e/screens.spec.ts` would not parse in this container (`Unexpected token (425:0)`). It is unchanged since #382, so this is not from this change.
- **Not checked:** a real microphone session, because the container has no audio devices. The engine start path itself is unchanged once the engines are mounted.

## B4: one read per table on Home, Today and Meals

**What changed**
- **The agendas take rows a screen already read:** `familyAgenda`, `mealAgenda`, `financeAgenda`, `schoolAgenda` and `shoppingAgenda` each take an optional `events`, `meals`, `obligations`, `items` or `consumables`.
  - Each agenda keeps exactly the rows its own read would return: events still to end, meals from today in UTC, and the whole list for the others.
  - So every count stays the same, "N of M checked" included.
- **`householdAgenda(…, rows)`** takes those reads as the same promises the screen awaits.
  - `agendaReads(view)` says which tables the agenda reads for a person, so a screen shares only those.
- **Home** (`_lib/home-reads.ts` `homeRows`):
  - Events and meals are read once per request through React `cache()`.
  - The rows are shared by the agenda, the fortnight list and the cat's thought, which streams in its own Suspense boundary.
  - Each read starts at the earliest window any of them needs, with no upper bound. Each part keeps its own window.
- **Today's household lens**, now in the Calendar's Day view (`calendar/_components/today-plan.tsx`, moved there by #425):
  - When the agenda runs, events, meals, bills, school items and the cupboard are each read once, wide enough for both.
  - The plan keeps its own window of the rows.
  - The mine and family lenses keep their narrow windowed reads.
- **Meals:**
  - One `meals` read, from the earlier of the week's Monday and today (UTC).
  - The agenda keeps today onwards. The week is its seven days.

**The agenda windows**, settled together with the "checked" wording:
- `familyAgenda` and `mealAgenda` keep reading from now with no upper bound. They grow only with future plans, not history.
- Bounding them would change the "N of M checked" count that Home shows, for no measurable gain.
- No visible number changes.

**Numbers:** Supabase REST calls per page load, from a production build against the live project, in the QA household. They were counted by wrapping the server's `fetch`.

| Page | `main` | B4 | Repeated table reads removed |
|---|---|---|---|
| `/` (Home) | 42 | 39 | `family_events` ×3 → 1, `meals` ×2 → 1 |
| Today, household lens (old Today page, before #425) | 30 | 26 | `family_events`, `meals`, `obligations` and `school_items`, each ×2 → 1 |
| Today, household lens (Calendar Day view, after #425) | 46 | 42 | `family_events` ×4 → 3, `school_items` ×3 → 2, `obligations` ×3 → 2, `meals` ×2 → 1 |
| `/meals` | 17 | 16 | `meals` ×2 → 1 |

- Every removed read was one of the unbounded ones: the agenda's whole history of school items and bills.
- Load times from this container are dominated by its distance to ap-south-1, so they are not quoted.

**Verified**
- **Rendered text unchanged:** the text of Home, Today (household and mine lenses) and Meals was compared between `main` and this branch, in a QA household seeded with 5 events (earlier today, running now, tomorrow, in 10 days, next month), 4 meals (yesterday to next week) and 2 bills.
  - The text was identical twice: once before and once after rebasing onto #425.
  - The only difference was the cat's bubble, which appears at random. Its facts in the page payload were identical on both builds.
- **Unit test:** `home/agenda-shared-rows.test.ts` uses an in-memory table with the real filter semantics. It proves that `familyAgenda` and `mealAgenda`, given wider rows, return exactly what their own read returns, and do not read the table again.
- Typecheck is clean, and ESLint is clean on the changed files.

**Follow-ups found**, added to the audit backlog:
- **B4b:** the Calendar's Day view (#425) reads `family_events`, `school_items` and `obligations` once more for the calendar itself. It can share the plan's reads the same way. That code was being reshaped by another session today, so it was left alone.
- **B4c:** Meals reads `recipes` twice and `consumables` twice. These are different column sets, in parallel: `listRecipesForEdit` and `recipesWithIngredients`, and `listGroceries` and `listConsumables`. They cost queries, not waiting.

## B5: the HomeTalk turn

All of this is in `apps/web/app/_lib/hometalk-turn.ts` and `packages/core/src/homebrain/context-store.ts`.

- **Rate limit before the allowance.**
  - `hitRateLimit("hometalk.turn")` now runs before `consume`. A turn refused for speed no longer spends the household's allowance.
  - The number of round trips is unchanged (one each). This is a correctness fix the audit found alongside the timing work.
- **One wave of session reads.**
  - `pendingAmaf`, `pendingWelcome` and the ordinary turn's `pendingAction`, `recentTurns`, `pendingClarification` and `recentFocus` all start together once the session is open.
  - Before, they ran in three steps: AMAF, then the welcome, then the four reads.
  - All six only read. Each is awaited where it was awaited before, so a turn that AMAF or the welcome answers fails only as it did before.
  - This saves **2 sequential database round trips on every ordinary turn**.
- **A context behind only by age answers now and is rebuilt after the response.**
  - `storeIsOnlyAged` is true only when no write has marked the row since it was built and it was built on the household's today, so the row is simply past the one-hour limit.
  - Such a row holds what a rebuild would hold, short of a change no write announced. The hourly limit exists for exactly those changes, so they show one turn later than before.
  - A row a write marked, or one built on an earlier day, is still rebuilt inline before it answers. A change the household has just made is never answered from old facts.
  - The rebuild runs through the same `after()` the store already uses for write-triggered rebuilds (`enableContextStore`). Outside a request, it rebuilds inline as before.
  - This takes the whole inline rebuild, about twenty domain reads, off the first turn after a quiet hour.
- **`homebrain_misses`** is written in `after()` rather than as a floating `void` promise. A serverless instance that ends with the response still writes the row, and the turn never waits on it.

**Verified**
- `context-store.test.ts` has two new cases for `storeIsOnlyAged`. It is true when the row is behind by age alone, and false when the row is current, marked by a write, or built on an earlier day. All 17 pass.
- vitest over `_lib`, the household API routes, `homebrain` and `conversation`: 53 files, 944 tests pass.
- `npm run eval` (deterministic): 211 of 211 cases. Unsafe actions are 0 of 26. All gates pass except operations, which is "not yet" as before.
- Typecheck is clean, and ESLint is clean on `hometalk-turn.ts`.
- **Not measured end to end:** a live turn needs the service-role key, which this container does not have. The saving is counted in round trips from the code path.

## B6 + B10: `/ai` history alongside the offer; a loading shape per screen

They are batched because both are about how soon `/ai` shows something.

**B6** (`ai/page.tsx`):
- The open session's history (`listMessages`) now starts alongside `offerToFillDetails` instead of after it.
- The offer is said in that same session, because `openSession` finds the member's current one. So the history read in parallel is the right one.
- The page already appends the offer's message when the read missed it.
- Only when the offer had to open a new session is that session read after it, as before.
- This saves **1 sequential round trip** on every adult load of `/ai` on a server with the service role, which is production.
- `offerToFillDetails` itself is 3–4 round trips: what is waiting, the session, its recent messages, and the write.
- When the history already holds 30 messages, the list can now show the offer plus the 30 before it. Before, it showed 29 before it. Nothing is lost or reordered.

**B10:**
- `_components/screen-loading.tsx` holds the root skeleton, now with a shape: `dashboard` (as before), `list` (heading, tabs, rows) or `chat` (turns, then the composer).
- `loading.tsx` now exists for `/ai` (chat), and for `/family`, `/groceries` and `/meals` (list).
- The root `loading.tsx` renders the same markup as before.

**Verified** against a production build pointed at the live project, signed in as the QA household, at 360 px:
- `/ai`, `/family`, `/groceries` and `/meals` each answer 200, and the streamed HTML carries the route's own loading shape before the screen.
- Each then renders its heading (HomeTalk, Our Family, Groceries, Meals & Cooking), with no horizontal overflow and no console errors.
- Typecheck is clean, and ESLint is clean on the changed files.
- **Not exercised here:** the offer path needs the service-role key, which this container does not have.

## B7: Admin Home's setup progress from rows Home already read

**What the audit found:**
- The setup count itself, `household_setup_counts`, is one RPC of 16 counts in Home's first wave, about 6 ms warm.
- Working those counts out from Home's own rows would need reads Home does not do: playbook items, policies, assets, obligations, food preferences, recipes and enrolments. So it stays.
- The repeated reads came from guided setup's progress card. While setup is under way, `loadOnboardingSnapshot` read members, pets, responsibilities and availability a second time, all rows Home had just read.

**What changed**
- **`household/onboarding-repository.ts`:**
  - The facts are now built by one pure `factsFrom`, which `loadOnboardingSnapshot` also uses.
  - The new `loadOnboardingFacts` takes the members, pets, responsibility keys and helpers' working days as promises, and reads only the school enrolments, alongside them.
- **`_screens/home-dashboard.tsx`:**
  - Members, pets and responsibilities are each read once.
  - Setup's progress gets the reads as they are, plus the availability windows Home already reads for its helper card. A read that fails still hides the setup card, rather than showing progress from an empty list.

**Numbers:** Supabase REST calls on Home, for an Admin whose guided setup is under way.

| | `main` | B7 |
|---|---|---|
| REST calls | 39 | 36 |
| Repeated table reads | `member_availability` ×2, `responsibilities` ×2 (plus `household_members`, the session's own) | none beyond the session's own `household_members` |

With B4, Home went from 42 calls to 36.

**Verified**
- **Rendered text unchanged:** Home's text on `main` and this branch was identical, with guided setup in progress for the QA household. That includes the card's "43% · Household setup · Good start · Next: Review home responsibilities".
- **Unit test:** `household/onboarding-facts.test.ts` checks the facts from given rows: inactive members left out, a child's school from the enrolments, a helper's working days counted once per weekday, an accepted responsibility not suggested again. It also checks that only `school_enrolments` is read.
- vitest over `household`: 19 files, 289 tests pass.
- Typecheck is clean, and ESLint is clean on the dashboard.
