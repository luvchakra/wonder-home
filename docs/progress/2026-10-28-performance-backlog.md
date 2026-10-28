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
