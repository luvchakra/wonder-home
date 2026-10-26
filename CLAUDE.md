# WonderHome — Claude Code build contract

Read on every turn, so keep it short. Mechanics live in `docs/` (pointers below). Rule numbers and headings are cited from code; keep them stable.

## Mandatory startup
0. **Sync with `main` before anything else:** `scripts/branch-sync.sh`. Never `git merge origin/main` into a branch whose work was squash-merged: it conflicts (`docs/progress/2026-10-26-branch-sync.md`). Repeat after any resume or context reset.
1. Empty repo → start with `backlogs/00-Project-Bootstrap-and-Architecture.md`.
2. Read `TECH-STACK-AND-NFR.md`.
3. Find the work: `tracking/IMPLEMENTATION-ORDER.md`, then the first **Next** / **Not Started** row of `tracking/PRIORITY-ITEMS-REPORT.md`. Don't read `tracking/PROGRESS.md` whole (129 KB); `grep -n` the story id.
4. Read `architecture/API-ARCHITECTURE.md` and `architecture/SECURITY-BASELINE.md`. Read `database/SUPABASE-DATABASE.md` when touching the database.
5. UI work: `design/UI-UX-REQUIREMENTS-v3.md` and `design/DESIGN-NOTES.md`, grepped for the screen or component (DESIGN-NOTES is 73 KB).
6. Product direction: `design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md` is authoritative (grep for the topic). Real LLM reasoning behind the conversation engine and "Talk to WonderHome" as a P0 primary control surface come first. It reprioritises work inside the backlogs and does not replace them.
7. Pick the first dependency-ready incomplete story, weighted by step 6.

## Token economy
Cost ≈ context size × turns. Every turn re-reads this file, the whole conversation and every tool result, so the costliest thing is a turn that didn't need to happen. Measured baseline: `docs/progress/2026-10-24-token-economy.md`; this section's habits: `docs/progress/2026-10-25-token-habits.md`.
- **One request, one session.** After a PR merges, end with "Start a new session for the next request." Never take a new, unrelated request into a session that has already merged one; `/compact` if a request must continue. State lives in `docs/` and PRs, not in chat.
- **Don't wake for PR noise.** With auto-merge on, open the PR, enable auto-merge, schedule the one merge check ("Opening and merging pull requests") and end the turn; don't subscribe to PR activity. Subscribe only when the owner asks to watch a PR or CI has already failed on it. A Vercel bot comment, "subscription created" or "check suite completed" with nothing failing needs no reply beyond one line.
- **Batch.** Group small related requests into one branch and one PR. Add to the open PR while CI runs.
- **CI waits.** On a CI-completed event, read the check results once and act (merge or fix) in that same turn. No polling, `sleep` loops or repeated status checks.
- **Whole ask, first message.** Story id, file or screen, and what "done" means, so no clarifying rounds. No "status?" check-ins; the PR shows state.
- **Ask before investigating** when a request has two plausible readings: one question, before reading any code.
- **Smallest model that fits.** Haiku or Sonnet for questions, small fixes and doc edits; Opus for multi-file stories, defects with no known cause and live-model evaluation work. Switch with `/model`; `/fast` buys speed, not savings.
- **Delegate wide searches.** When finding something needs more than about three greps, hand it to a search subagent; only its summary enters the conversation.
- **Live model runs are cheapest first.** `npm run eval -- --utterance "…"` reads one sentence; `npm run eval -- --cases HT-117,HS-24 --runs 3` repeats only the cases in question. The full provider run (`--provider configured`, 172 cases, about 15 minutes and real API spend) runs at most once per PR, last. Never write throwaway scripts for what these do. From a Claude Code cloud container, Node reaches a provider only with `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` and `ANTHROPIC_BASE_URL` unset.
- **Text before pixels.** For UI, run `node scripts/ui-check.mjs <path> [--click role:name] [--find role:name] [--shot out.jpg]` (Playwright; prints each element's text and box, and flags horizontal overflow at 360 px). Screenshots only when the look matters: one per change, cropped, JPEG at quality 60. Never read full traces, videos or full-page screenshots; read the error summary.
- **Read narrowly.** `grep -n` first, then read only the line range needed. Don't re-read a file already in context or just edited. Never read these whole: `docs/PROGRESS.md` (236 KB), `tracking/PROGRESS.md` (129 KB), `design/DESIGN-NOTES.md` (73 KB), `design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md` (50 KB), `package-lock.json` (365 KB), `packages/core/src/i18n/messages/areas/**/*.ts` (locale files up to 254 KB), `apps/web/app/_lib/hometalk-turn.ts` (123 KB), `docs/testing/HOMETALK-HOMEBRAIN-INTEGRATION-TEST-CASES.md` (87 KB), `supabase/seed/**/*.csv`, `supabase/migrations/20261020231000_companion_sayings.sql` (174 KB), `packages/core/src/school/companion-sayings.json`, `docs/ai-releases/*.json`, and the mockup PNGs in `design/` (about 2 MB each; open only the screen you change).
- **Quiet output.** Pipe through `tail -n 40` or `grep -E "error|fail"`. Use `git -q` and `npm --silent`. Run only the touched area's tests (`npx vitest run <path>`, `npx playwright test <spec>`), never the full suite unless asked.
- **Keep this file short.** It is re-read every turn: detail goes in `docs/`, a pointer stays here.
- **Short replies.** The outcome and what the owner should check. Don't narrate each step.
- **End every message with the IST time to the second**, on its own last line (e.g. `2026-10-25 01:33:08 IST`), never a time reused from an earlier message (owner, 2026-10-25). When this turn already has the current time (a notice's `current-time`, or a command just run), convert that; otherwise read it with `TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M:%S IST'`, in the same call as other work where there is one.

## Mission
Build **WonderHome**, an AI-driven Household Operating System, on the stack below. Greenfield. Mobile-first responsive Next.js/PWA, not React Native.

## Autonomous execution
- Per story: In Progress → inspect existing code → implement → test → typecheck/lint/build → fix → update docs, migrations, contracts → Done → update overall and module trackers → continue.
- Don't ask "what next?". Ask only for genuinely blocking product, security/privacy, destructive-migration, production-credential or irreversible-architecture decisions.

## Stack is fixed unless explicitly changed
Next.js 16 App Router · React 19 · TypeScript 5.9.x · Tailwind CSS 4 · Radix UI + Lucide React · Supabase PostgreSQL with `@supabase/ssr` / `@supabase/supabase-js` · Vercel AI SDK · Anthropic Claude primary, Google Gemini and OpenAI configurable · Zod + React Hook Form · Vitest + Playwright · npm workspaces (`apps/web`, `packages/*`).
No React Native, other backend framework, Clerk, Prisma or other ORM without an explicit architecture decision.

## Design principles — keep every screen close to the mockups
Full rules, the owner's exceptions and the Brand section: `docs/design-principles.md`. **Read it before any UI work** (with Mandatory startup 5). The titles, as code cites them:
1. Warm, never clinical.
2. One handwritten line per screen, closing it.
3. Blue commits, domains colour, state speaks in words.
4. Every row: tinted `IconTile`, name, one line of reason, then the single thing to do.
5. Botanical framing: faint `LeafDecor`, behind content.
6. Five primary areas at every size
7. A human sentence opens every screen
8. Imagery is warm family life
9. Numbers are arithmetic someone can explain.
10. Mobile-first and real.
11. A name is never truncated
12. Every entity can be added, updated and removed.
13. One door to the assistant.
14. No two buttons for the same job.
15. Show the whole thing.
16. Swipe moves between the five areas
17. Group by what the reader is deciding
18. A stat tile takes the width its label needs.
19. Two cards per row on a phone, never three.
20. A choice is picked, not typed.
21. A card opens to its full detail.
22. Money is decimal.
23. Every setting has one editor.

Brand: tokens in `packages/core/src/ui-theme.css`, the shared kit `@wonderhome/core/ui/*`, the one wordmark in `brand/mark.ts`. Never a second logo, a raster of it, or a hex the tokens don't carry.

## The agent platform: HomeTalk, HomeBrain, HomeSend
Summary rules and detail: `docs/agent-platform.md`. **Read it before changing conversation, HomeBrain, HomeSend, HomePlaces, voice, agent or evaluation code.** The invariants:
- **HomeTalk** (`/ai`) is the one door (rule 13); typed and spoken turns run through `conversation/engine.ts`. Every action is grounded before a proposal exists; still uncertain → one focused question, never a guess. A new action needs a `REPLY_CLASSES` entry, a voice-matrix place and an eval case.
- **HomeBrain** gives the reasoning and never decides. No model answer reaches a person unvalidated (`homebrain/validate.ts`); "Why?" comes from evidence, never a model.
- **HomeSend** is one pipeline (`homesend/ingest.ts` → `IntakeUnderstanding`). Nothing reaches a domain table until a person confirms; bills, health documents and receipts always wait. Nothing is added on its own unless more sure than the Admin's bar (95% unless changed, `homesend/auto-add.ts`); photos and files always wait. All content is untrusted (`injection.ts`). Told in HomeTalk about a new dated thing (`file_with_homesend`), the sentence goes through `ingestText`.
- **Voice channels** are doors into HomeTalk (`hometalk/gateway.ts`, `voicelink/capabilities.ts`). Paying and ordering are never by voice.
- **Agents** run the governed pipeline and never mutate Supabase directly. Model clients come only from `ai/provider-clients.ts`.
- **One evaluation** (`npm run eval`): release gates block CI, Unsafe Action Rate stays zero, a caught defect fixes the product, never the expectation.

## External providers
Summary rules and detail: `docs/external-providers.md`, read before touching weather, films, careers, billing, WhatsApp or partner keys. The invariants: never invent credentials or claim a live integration (ports and deterministic mocks first); every provider is off until its own variables are set; prices are ours and a household never moves to a paid plan without a verified payment; WhatsApp is an input channel, never an authorization channel, and its replies never echo an amount, health detail or number.

## Smart notifications (module 23)
Summary rules and detail: `docs/notifications.md`, read before touching `packages/core/src/notifications/`. The invariants: reminders are derived from real records and reconciled idempotently, on the household's clock; one recipient per reminder, who changes only its state; only `deliverNotification` pushes, mails or sends; a new kind is a new source plus a policy entry with `reminder.*` wording in every language.

## Product rules
- Manage outcomes, not micro-task checklists. Normal routines are silent. Househelpers don't update every chore.
- Notifications are precise, timely, recipient-specific, actionable, grouped, threaded and automatically resolved.
- HomeTalk and text share one conversation engine, backed by HomeBrain.
- One household, many identities, personalised views. Children get age-appropriate access and privacy.
- Every Admin is equal: any Admin can make another adult an Admin or step one back. The owner always stays Admin; only adults can be Admins.
- Manage Household defines responsibilities, playbook, routines, policies and AI autonomy. Certification shows what WonderHome believes and lets authorised users correct it.
- AI agents use governed APIs and tools and never mutate Supabase directly. Server-side authorisation is authoritative. Sensitive actions need approval or step-up authentication.

## Non-functional gates
Targets are in `TECH-STACK-AND-NFR.md`. P0 security and authorisation tests are release blockers. Core API targets: p95 ≤ 500 ms for reads and ≤ 800 ms for ordinary writes, excluding external provider latency.

## Verifying UI changes in a browser
- Drive the change in a browser at 360 px and desktop before calling a story done. Types, lint and unit tests prove correctness, not that the feature works.
- Use `node scripts/ui-check.mjs` (see Token economy) for a text-and-box check first; screenshot only when the look matters.
- Sign in as a test household with `node scripts/qa-test-user.mjs create "Name"` (already-confirmed account, service-role key from `apps/web/.env.local`). Public sign-up rejects sandbox domains like `.test` and `example.com`; that is Supabase Auth's validation, not an app bug. Delete when done (see Cleaning up test data).

## Applying a migration to the live project
- A file in `supabase/migrations/` is not shipped. Apply each migration to the live Supabase project in the same session with the Supabase MCP `apply_migration` tool (`mcp__Supabase__list_projects` for the id; `list_migrations` to check).
- Then run `npm run verify:live`. A green `test:db` run (fresh local database) does not prove the live project has it.
- **A migration that changes stored values must be safe in either order** (the 2026-10-26 Responsibilities outage). Before the code ships, every reader of those values, screens included, accepts the old and the new ones; apply the migration right after the deploy is READY, then load the screens that show them.
- Live project: `wonderhome` (`kqxndableyysxqhxiorz`, ap-south-1).

## Row-level security checks membership as a set
- Never call `wh.is_member(x)`, `wh.is_household_admin(x)` or `col = wh.member_id(x)` in a policy: each runs a lookup per row.
- Use the set forms: `x in (select wh.member_households())`, `x in (select wh.admin_households())`, `(x, col) in (select household_id, member_id from wh.my_memberships())`, and `(select auth.uid())` (never bare `auth.uid()`).
- `scripts/test-setup-counts-rls.mjs` fails if a policy still uses a per-row helper.

## Performance: what every change keeps
Production runs beside the database (Vercel `bom1`, Supabase ap-south-1). A page is as slow as its longest chain of awaits plus its slowest query.
- **One wave, not a chain.** Start every independent read in one `Promise.all`. A plan check starts alongside the read it gates; drop the read's result if the check refuses (`_lib/agenda.ts`).
- **Read a thing once per request.** An agenda returns the rows it assessed; pages reuse them. Share per-render data through React `cache()`.
- **One call for many counts.** Reads that always go together become one security-invoker RPC (like `public.household_setup_counts`).
- **Every list has a bound.** Growing tables get `.limit()` or a date range. Ask only for the columns shown.
- **Index what a query filters or joins on.** Every new foreign key and every column a policy or hot query filters by gets an index in the same migration.
- **Platform data is cached per server** with a TTL (`calendar/repository.ts` `holidayRegions`). Household data is never cached across requests.
- **Work that can wait runs after the response** (`after()` or the delivery clock), never on the request path.
- **Nothing server-only reaches the browser.** Catalogs and help words stay on the server; clients get labels as props. `npm run check:bundle` guards this.
- **Measure before and after** on a hot path: `pg_stat_statements` or the advisor first, `EXPLAIN ANALYZE` as `authenticated` with a real member's claims, warm timings on the production build (never a dev server). Put the numbers in the progress note. The 2026-10-19 pass is in `docs/progress/2026-10-19-performance-pass.md`.

## Database query permissions
All SQL against the Supabase project, including `mcp__Supabase__execute_sql`, `apply_migration` and other Supabase MCP tools, is pre-authorised, including destructive statements. Investigate before deleting real household data, and keep QA cleanup to what this session's own account created.

## Opening and merging pull requests
- Every change reaches `main` through a PR, never a direct push. Open a PR for finished work pushed to a story or feature branch; never leave pushed commits with no PR against them.
- **Before every push, run `scripts/branch-sync.sh`.** Auto-merge can land a PR between two of your pushes. When the script says a PR from the branch merged, the next push needs a new PR; never add commits to a branch whose PR merged and leave them without one.
- Turn on auto-merge (squash) for every PR, as soon as it opens, whether or not this session opened it. Never ask first.
- **A PR is done only when it has merged and deployed** (#351 sat red overnight). After enabling auto-merge, schedule one check (`ScheduleWakeup` or `send_later`) for when CI should be done, about 10 minutes. On it:
  - merged → confirm the production deployment for the merge commit is READY, then apply any pending live migration;
  - red CI → read the failing job's log, fix the cause and push (never lower a gate, a coverage count or a test to get green);
  - conflict → `scripts/branch-sync.sh`, push;
  - green and clean but not merged → merge it yourself (squash).
  Reschedule until merged, and tell the owner a change is live only after that. At every session's startup, check this session's and earlier open PRs the same way.
- The repo must allow auto-merge (Settings → General → Pull Requests). If the enable call is refused, say so once in the PR thread or to the owner, then merge yourself once CI is green with no conflict.
- Only four things hold a merge: an open unaddressed review thread; a draft or WIP PR; red CI (fix it, don't wait); a red nightly E2E on `main` (`e2e-nightly.yml`), which is fixed before other work merges. "Flaky" is not a root cause.
- Squash-merge. Docs, trackers, progress notes and test updates go in the PR for the code they describe.

## Where tests run
Full account: `docs/CI.md`.
- **Pull requests:** typecheck, ESLint on changed files, related unit tests, security and evaluation gates, DB tests when migrations change, a build.
- **Pushes to `main`:** every unit test and the whole lint.
- **Full Playwright suite:** nightly at 03:00 IST (`e2e-nightly.yml`, cron `30 21 * * *` UTC), never on a PR.
- **Before merging something risky** (sign-in, permissions, migrations, payments, a cross-feature flow), run its specs locally with `npm run test:e2e -- <spec files>`. It pins the app to a placeholder project.
- Never skip, disable or delete a test to get green. Never re-run a failed run hoping it passes.
- **Pre-launch testing is pre-authorised:** every test, the full E2E and signed-in specs, and QA or E2E users and households on the live project (`E2E_ALLOW_LIVE_PROJECT=1` with `E2E_SUPABASE_*`). This ends the day WonderHome launches; E2E then needs its own project.

## Help content changes with the feature
The user guide is for signed-in members only.
- Where it lives: route gate `security/route-policy.ts`; words `packages/core/src/i18n/messages/areas/help/` (read through `help/words.ts`, never the general catalogs); shape `help/guide.ts`.
- A PR that adds, removes or renames a user-facing feature updates the section's words in all eight languages, the FAQ if one covers it, and the section's `updated` date.
- Write in the UI's own labels. Say when something is AI-generated or done on the person's behalf, and what they stay in control of. Never describe a planned feature as available.
- Checks: `npm run lint:help-links`; `npm run check:bundle` fails if guide words reach client JavaScript.
- **Release notes** (`help/release-notes.ts`, shown at `/help#release-notes`) are written only once the owner confirms a version is live. Add one entry at the top of `RELEASE_NOTES`: that day's date, `fromPr` one after the previous `throughPr`, and `throughPr` the last PR live. Cover each user-facing feature in that range, one item per feature, in UI labels; leave out fixes, CI and docs. Words are `help.release.<id>.title` and `.item.N` in all eight languages. Never edit an older entry except to correct it.

## Where it is hosted
- Vercel team `kunals-projects-9f64757f` (Hobby). Projects: `wonderhome` (`prj_wmkKrjqrezwGc8av9LEdjbcU46cO`, serves `home.wonderapps.biz`, production from `main`); `wonder-apps` (`prj_eAN93HE8LG4URCWU0JlhBQtokWuM`, `wonderapps.biz`). Table and history: `docs/hosting.md`.
- Call the Vercel connector without `teamId`/`slug`; naming the team returns 403 until it is re-authorised.

## Build-slot budget (Vercel's daily deployment cap)
Vercel allows 100 deployments a day, and every deployment it creates counts, including one `scripts/vercel-should-build.sh` cancels. At the cap, production is refused too.
1. Create no deployment you don't need. `vercel.json` `git.deploymentEnabled` is off for `claude/**` and `feature/**`; keep it that way. Previews stay off unless someone will open one. Only one Vercel project may link to this repo.
2. One merge to `main` is one production deploy: merge in larger pieces, squash. Never open a docs-only PR while a code PR is open or about to open.
3. Tests run on GitHub Actions or locally, never on Vercel. Don't add a check that deploys to run tests. A scheduled suite, if one is ever added, runs rarely, uses few shards and skips when `main` hasn't changed since the last green run.
4. Verify before pushing: typecheck, lint, the touched unit tests, and `npm run build -w apps/web` when the build can change. Push once, when ready.
5. Count the last 24 hours before deploy-heavy work (`gh api "repos/luvchakra/wonder-home/deployments?per_page=100"`, by `created_at`). Vercel's API may refuse this session. Above about 70 of 100, stop docs-only merges and anything else that deploys.
6. At the cap: stop pushing to deploying branches, wait until the oldest counted deploy is 24 hours old, then redeploy `main` once. An `api-deployments-free-per-day` or "rate limited" status is infrastructure, not a failing check on the PR; don't push again because of it.

## Cleaning up test data after the merge
Work isn't finished until its test data is gone. After the merge, in the same session and before reporting done:
- Delete every QA account made with `node scripts/qa-test-user.mjs create`, using `node scripts/qa-test-user.mjs delete <user-id>`.
- Delete each QA household and its rows, on the live project and any preview branch. Remove rows inserted by hand with `execute_sql`, and files uploaded to Storage during testing.
- Delete scratch files, screenshots and helper scripts in the working tree, and stop any dev server you started.
- Confirm with a SQL count or a `qa-test-user.mjs` lookup. Delete only what this session created, tracked by the ids it printed. Anything you can't prove is yours, leave in place and name it with the id and the command that removes it. The progress note says the cleanup ran or lists what was left and why.

## Files for the owner
The owner reads on a phone, where downloads fail. When a session makes a file for the owner, the reply also gives its whole content in one copyable HTML code block:
- a document (Word, PDF, Markdown) → one complete HTML document (text, headings, lists, tables);
- an image → inline SVG (draw diagrams as SVG first; a small raster → data URI);
- a table or spreadsheet → an HTML table;
- SQL, code or config → a code block in its own language.
If it can't be given that way (a video, a large photo), say so and offer another route, such as the owner's Google Drive. Never give a truncated block. The file is still sent.

## Progress
- `tracking/PROGRESS.md` is the source of truth. Every story status change is reflected there and in its module backlog. Never fabricate completion.
- **Priority queue:** "work on the next high-priority story" means the first **Next** or **Not Started** row of `tracking/PRIORITY-ITEMS-REPORT.md` that waits on nobody. Update that file in the same PR.
- HomePlaces (`backlogs/24-HomePlaces.md`), HomeFood (`backlogs/25-HomeFood.md`, all grocery and pantry work) and HomeEvents (`backlogs/26-HomeEvents.md`, the calendar) keep their own backlogs. Any work on them, a fix included, updates that backlog in the same PR: status and notes with the PR number, a new story for each open follow-up, and any closed one removed.
- After any story status change: edit the row in the backlog, then run `npm run tracker`. Never edit `docs/PROGRESS.md` by hand; CI runs `npm run tracker -- --check`.
- **Progress notes:** after every major activity (a story or module completed, an infrastructure, hosting or provider change, a design-system or performance pass, a security fix, a decision that shapes later work), write `docs/progress/YYYY-MM-DD-short-slug.md` before moving on. Say what was done and why, what was verified (gates and results), what is open or needs a person, and where the code lives. Add it to `docs/progress/README.md`.
