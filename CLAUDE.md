# WonderHome — Claude Code build contract

Read on every turn, so keep it short. Mechanics live in `docs/` (pointers below). Rule numbers and headings are cited from code; keep them stable.

## Mandatory startup
0. **Fetch `main` before anything else:** `git fetch origin main`, then `git merge origin/main` (or start from it if the branch has no unmerged work). Repeat after any resume or context reset.
1. Empty repo → start with `backlogs/00-Project-Bootstrap-and-Architecture.md`.
2. Read `TECH-STACK-AND-NFR.md`.
3. Find the work: `tracking/IMPLEMENTATION-ORDER.md`, then the first **Next** / **Not Started** row of `tracking/PRIORITY-ITEMS-REPORT.md`. Don't read `tracking/PROGRESS.md` whole (129 KB); `grep -n` the story id.
4. Read `architecture/API-ARCHITECTURE.md` and `architecture/SECURITY-BASELINE.md`. Read `database/SUPABASE-DATABASE.md` when touching the database.
5. UI work: `design/UI-UX-REQUIREMENTS-v3.md` and `design/DESIGN-NOTES.md`, grepped for the screen or component (DESIGN-NOTES is 73 KB).
6. Product direction: `design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md` is authoritative (grep for the topic). Real LLM reasoning behind the conversation engine and "Talk to WonderHome" as a P0 primary control surface come first. It reprioritises work inside the backlogs and does not replace them.
7. Pick the first dependency-ready incomplete story, weighted by step 6.

## Token economy
Cost ≈ context size × turns. Every turn re-reads this file, the conversation and every tool result. Measured baseline and results: `docs/progress/2026-10-24-token-economy.md`.
- **Short sessions.** One batch of finished work per session. `/compact` or a new session after each batch. State lives in `docs/` and PRs, not in chat.
- **Batch.** Group small related requests into one branch and one PR. Add to the open PR while CI runs.
- **CI waits.** On a CI-completed event, read the check results once and act (merge or fix) in that same turn. No polling, `sleep` loops or repeated status checks.
- **Text before pixels.** For UI, run `node scripts/ui-check.mjs <path> [--click role:name] [--find role:name] [--shot out.jpg]` (Playwright; prints each element's text and box, and flags horizontal overflow at 360 px). Screenshots only when the look matters: one per change, cropped, JPEG at quality 60. Never read full traces, videos or full-page screenshots; read the error summary.
- **Read narrowly.** `grep -n` first, then read only the line range needed. Don't re-read a file already in context or just edited. Never read these whole: `docs/PROGRESS.md` (236 KB), `tracking/PROGRESS.md` (129 KB), `design/DESIGN-NOTES.md` (73 KB), `design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md` (50 KB), `package-lock.json` (365 KB), `packages/core/src/i18n/messages/areas/**/*.ts` (locale files up to 254 KB), `apps/web/app/_lib/hometalk-turn.ts` (123 KB), `docs/testing/HOMETALK-HOMEBRAIN-INTEGRATION-TEST-CASES.md` (87 KB), `supabase/seed/**/*.csv`, `supabase/migrations/20261020231000_companion_sayings.sql` (174 KB), `packages/core/src/school/companion-sayings.json`, `docs/ai-releases/*.json`, and the mockup PNGs in `design/` (about 2 MB each; open only the screen you change).
- **Quiet output.** Pipe through `tail -n 40` or `grep -E "error|fail"`. Use `git -q` and `npm --silent`. Run only the touched area's tests (`npx vitest run <path>`, `npx playwright test <spec>`), never the full suite unless asked.
- **Short replies.** The outcome and what the owner should check. Don't narrate each step.
- **End every message with the IST time to the second**, on its own last line, read fresh from `TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M:%S IST'` (e.g. `2026-10-25 01:33:08 IST`). Every reply, never a reused time (owner, 2026-10-25).

## Mission
Build **WonderHome**, an AI-driven Household Operating System, on the stack below. Greenfield. Mobile-first responsive Next.js/PWA, not React Native.

## Autonomous execution
- Per story: In Progress → inspect existing code → implement → test → typecheck/lint/build → fix → update docs, migrations, contracts → Done → update overall and module trackers → continue.
- Don't ask "what next?". Ask only for genuinely blocking product, security/privacy, destructive-migration, production-credential or irreversible-architecture decisions.

## Stack is fixed unless explicitly changed
Next.js 16 App Router · React 19 · TypeScript 5.9.x · Tailwind CSS 4 · Radix UI + Lucide React · Supabase PostgreSQL with `@supabase/ssr` / `@supabase/supabase-js` · Vercel AI SDK · Anthropic Claude primary, Google Gemini and OpenAI configurable · Zod + React Hook Form · Vitest + Playwright · npm workspaces (`apps/web`, `packages/*`).
No React Native, other backend framework, Clerk, Prisma or other ORM without an explicit architecture decision.

## Design principles — keep every screen close to the mockups
Approved sheets in `design/` are the look. Read the UI contract (Mandatory startup 5) before UI work.

1. **Warm, never clinical.** Cream page, white cards, soft shadows, generous rounding and whitespace. Never grey, never pure-white page, never a dense dashboard.
2. **One handwritten line per screen**, closing it: `ScriptAccent` or `QuoteCard`, once, decoration only. Nothing a household must read is said only in script.
3. **Blue commits, domains colour, state speaks in words.** Primary Blue for every committing action and the active nav state. A domain colour sits on its `IconTile` only, never on text. Amber = attention; red = genuinely critical only; green = handled. Colour never carries meaning alone: wording and the offered action do.
4. **Every row:** tinted `IconTile`, name, one line of reason, then the single thing to do. Nothing to do → no action.
5. **Botanical framing:** `LeafDecor` in corners of the signed-out frame, landing hero and closing section. Faint, behind content, never over readable text.
6. **Five primary areas at every size**, assistant raised in the middle of the phone tab bar: Home, Calendar, HomeTalk, Family, More. Calendar replaced Today on 2026-10-18 (D1 of `design/FAMILY-CALENDAR-PHASE0.md`); Today's plan is one tap from the Calendar's day view. Domains live in the desktop sidebar and behind More.
7. **A human sentence opens every screen** (greeting with the person's name, plain-language lede) and a warm one closes it. No bare table dropped on the page.
8. **Imagery is warm family life**, illustrated in the household's tones. Never stock photography or stretched screenshots; product visuals are real components in device frames.
9. **Numbers are arithmetic someone can explain.** A ring, metric or percentage counts things the system evaluated. Never invent one; never show a figure without a source.
10. **Mobile-first and real.** Every screen works at 360px with no horizontal scroll, honours `prefers-reduced-motion`, has empty, error and loading states, and never offers a button that does nothing because its provider isn't live.
11. **A name is never truncated** (person, household, grocery item, outcome): no `truncate`/ellipsis. Wrap to a second line first. Row actions are icons with `aria-label` (not tooltip-only), not full-width text buttons.
12. **Every entity can be added, updated and removed.** A change can revise what it said and undo the add. "Removed" fits the entity (retire, deactivate, stand down, cancel) and is never a hard delete that orphans history. "Add" stays reachable once a first instance exists, not only from the empty state.
13. **One door to the assistant.** HomeTalk is the one door, reachable wherever the mic icon is. No screen adds its own "Ask AI", "HomeTalk" or "Assign with AI" shortcut. Manual add/update/remove is the screen's own job. HomeSend's paperclip is a second input modality of the same door. `/home-send` is the one deliberate second surface (drop zone plus inbox awaiting confirm) on the same pipeline; no future screen may cite it as precedent.
14. **No two buttons for the same job.** Before a header or empty state gets a second action, ask what each does. Two "add this" pills (manual and `/ai`) is a duplicate; the AI-routed one goes. A second control earns its place only if it does something different a reader would name.
15. **Show the whole thing.** Names, amounts, dates and status words are never cut to fit. Fixed chrome (tab bar, raised assistant button, sticky header) reserves clearance so the last row or closing `QuoteCard` never sits behind it. When you resize fixed chrome, re-check the page's padding.
16. **Swipe moves between the five areas** in `PRIMARY_NAVIGATION` order. A full-width horizontal swipe on a primary screen goes to the next or previous area. It is additive: tabs and sidebar stay. Ignore it when a horizontal scroller, carousel or swipeable row underneath wants it, and never fire it inside a sheet, dialog or form. Respect `prefers-reduced-motion`.
17. **Group by what the reader is deciding**: the thing most likely to need them first, then what they'd do next, then the record of what happened. Put a control beside what it acts on, even if that moves existing content.
18. **A stat tile takes the width its label needs.** `MetricGrid`/`StatChips` never squeeze three or four tiles into a phone row. On a narrow screen a tile is full width or one of two (rule 19); widen only at `sm` and up with room for every label. Same test for any new row of small cards.
19. **Two cards per row on a phone, never three.** Hard constraint for every card grid:
    - at most two per row; ~48% width each with one consistent gap;
    - stack vertically when the content needs more width (rule 15 wins);
    - primary information is a full-width card, never one of a pair;
    - secondary shortcuts (domain tiles, quick links, at-a-glance counts) use the two-column grid;
    - never shrink type or tap area to make a row fit.
    - **Owner's exceptions, not precedent:** Kids & School Overview counts (2026-10-18) and Bills & Finance Overview counts Need you / Upcoming / Settled (2026-10-20) sit three across as `ExpandableMetricRow` (stacked, labels wrap, open tile's entries in a full-width panel below). Groceries' To buy cards At home / Not counted yet / Mark as bought (2026-10-20) and HomeBrain's Registered / Learned / Need review (2026-10-21) sit three across as `MetricCard stacked`. Any other three-across grid is the owner's call.
20. **A choice is picked, not typed.** A known set (category, relationship, unit, status, frequency) is a dropdown, tag picker, radio group or checkbox list. Free text only for names, notes and amounts. Before adding a text input, ask whether its answers are a known set. Units use `ComboboxField` backed by `VITAL_UNITS` (`health/vitals.ts`). Every picker has an inline Add-new… for a value not yet listed.
21. **A card opens to its full detail.** A summary card carries a down chevron that expands in place to every field and action. The chevron is the only way in; no second "view more" link. Use `ExpandableRow` (one list row), `AgendaExpandableRow` (any domain's `HomeAssessment` row), or `ExpandableMetricGrid` with `MetricDetailList`/`MetricDetailRow`/`MetricDetailEmpty` (stat-card grid). Never hand-roll open/close.
22. **Money is decimal.** Amounts in the currency's major unit everywhere entered or shown (42.50, never 4250). Convert to minor units only at a provider's API boundary, and convert back before showing anyone anything.
23. **Every setting has one editor.** `/settings` holds the profile and one chevron row per setting, each opening its own page: Language & Region, Notifications, Voice and Voice assistants, AI Assistant (`/settings/ai`), Privacy and Location sharing (`/settings/location`; a child's is set by a guardian in Family), WhatsApp, Connected accounts, Your plan (`/settings/plan`). Other screens may show a value and link there, but never keep a second form, write path or default. Onboarding writes through the same repositories Settings uses. A person's own profile is edited only in Settings; an Admin changes someone else's in Family. A row appears only when this person can use what it opens; nothing unbuilt is listed.

**Brand.** The sheet is `design/WonderHome-brand-guidelines.png`. The wordmark is WonderHome, one word, in the brand ink, solid colour (`WORDMARK_LETTERS` in `packages/core/src/brand/mark.ts` is the one source). The mark is the rounded tile in `mark.ts`; `npm run brand` writes the icons and CI checks they match. Tagline: "Less mental load. More family time!" Tokens live in `packages/core/src/ui-theme.css`; typeface Sora; hexes in `docs/design-brand.md`. Never hand-draw a second logo, paste a raster of the logo, or reach for a hex the tokens don't carry. Use the shared kit `@wonderhome/core/ui/*`. No screen invents its own card, row, pill or tile. A new pattern goes into the kit, with a note in `design/DESIGN-NOTES.md` naming the rule it encodes.

## The agent platform: HomeTalk, HomeBrain, HomeSend
Detail: `docs/agent-platform.md`. Read it before changing conversation, HomeBrain, HomeSend, HomePlaces, voice or evaluation code. One pipeline, three real surfaces, each wired end to end.

- **HomeTalk** (`/ai`, `packages/core/src/components/ui/talk-composer.tsx`) is the one door (rule 13). Spoken and typed turns both run through `conversation/engine.ts`.
  - Every action is grounded before a proposal exists (`conversation/grounding.ts`): names via the Wave 1 resolver, dates via `conversation/temporal.ts` (code decides the day, in household time), references via `conversation/references.ts`. Still uncertain → one focused question, never a guess.
  - A correction replaces a pending proposal or undoes an executed write through its domain service, both kept on the record (`conversation/corrections.ts`).
  - Multi-request sentences are split (`conversation/decompose.ts`); a dependent part runs only if its earlier part happened.
  - Consent (`conversation/consent.ts`): an adult's everyday, undoable change is done at once ("Say undo to take it back"). Changes touching someone else are asked once. Paying and ordering always wait for a tap on screen. Child, helper and agent actions follow autonomy. An Admin's "Ask before acting" makes every act a question.
  - A reminder is a notification to the speaker alone, held until `scheduled_for`. An add that changed nothing says "Nothing to change", never "Done".
  - Models see facts only. `withoutServerOnly` strips anything the server decides (ids, grounded dates, undo records). Replies are composed in English, the record; other languages go through `conversation/reply-language.ts`. A new action needs a `REPLY_CLASSES` entry.
  - Extend `conversation/evaluation.test.ts` when an understanding changes; never loosen it.
- **HomeBrain** (`conversation/brain.ts`, `ai/model-client.ts`) gives the reasoning behind a reply. It is a real model call behind the same consent, minimisation and entitlement gates, and never decides: every downstream gate runs on its output.
  - No model answer reaches a person unvalidated: `homebrain/validate.ts` refuses invented names, dates, amounts, events, health or integration claims and "I've done it" claims. Extend it when a new kind of invention appears; never route around it.
  - "Why?" is answered from evidence in `homebrain/why.ts`, never by a model.
  - The household context is one server-only row (`household_context`, `homebrain/context-store.ts`). Never read it from a session, and never answer from a row older than the last write.
- **HomeSend** (`packages/core/src/homesend/`, `ai/classify-intake.ts`, `/home-send`) is the intake. Every input enters through `homesend/ingest.ts` and ends in `IntakeUnderstanding`. A new input type is a new `ingest*` entry point, never a second pipeline.
  - Nothing reaches a domain table until a person confirms. Bills, health documents and receipts always wait for a person.
  - Nothing is added on its own unless HomeSend is more than 95% sure: every detail found in the text sent (`homesend/verify.ts`). Photos and files always wait. The `understanding` eval gate keeps HomeSend above 95% in category and end to end.
  - Told in HomeTalk about a new dated thing (`file_with_homesend`), the sentence goes through `ingestText` like a paste, never straight to a table.
  - A class outside school is its own kind, never school work (`activity_item`, 08-027): filed under the child's class of that name in Kids & School, the class added in the same step when missing. An event or invitation (`event`) goes on the calendar through `addFamilyEvent`.
  - All content is untrusted: `injection.ts` fences it and ignores instructions aimed at WonderHome. Links are fetched only through `link-fetch.ts` (public addresses, DNS pinned, every redirect checked).
  - Duplicates are shown and moved dates are offered as updates, never a second copy (`reconcile.ts`). Document plans (`homesend/plan.ts`) apply only through `applyDocumentPlanAction`, and never on their own when there are two or more records.
  - Failed items are kept under "Failed safely", never dropped. Every routed item can be undone through `homesend/changes.ts`, never a raw delete.
- **HomePlaces** (`packages/core/src/homeplaces/`, intent `find_places`) is a read, never a write. Where and when come from the record; assumptions are said back. Never store a placeholder name.
- **Voice channels are doors into HomeTalk, never second brains.** Every channel asks through `hometalk/gateway.ts`; `completed` is only the executor's own record. What each channel may do is `voicelink/capabilities.ts`. A new voice capability is an allowlisted tool mapped to a HomeTalk utterance, never a tool that reaches a table. Paying and ordering are never by voice. Spoken replies pass through `conversation/speech.ts` `speakable`.
- **Agents** run a governed pipeline: `ai/gather-assessments.ts` → `ai/specialists.ts` `coordinate()` → `ai/orchestrator.ts` → `ai/tools.ts` `authorizeToolCall()` (scope → entitlement → permission → autonomy) → `ai/executors.ts`. Autonomy reads "observe" on any error. AI agents use governed tools and never mutate Supabase directly.
- **One evaluation** (`npm run eval`, `packages/core/src/evaluation/`) runs golden cases A–E, all synthetic. Release gates block CI; Unsafe Action Rate must stay zero. When a case catches a defect, fix the product, never the expectation. An `includes` entry may list one fact's wordings, never a different fact. Add a case whenever an understanding, reconciliation or answer rule changes. Corrections are evidence (`evaluation/evidence.ts` → `ai_corrections`). Approvals bind to the exact proposal (`conversation/approval.ts`); a stale or changed approval is refused.
- **Production hardening**
  - Rate limits go through `security/rate-limit.ts` `hitRateLimit`. They fail open and say the pause is temporary.
  - Plan burst and fair-use numbers are plan data read only by `billing/repository.ts` `consume`. A domain module never hard-codes a number.
  - Gate a feature only on the entitlement service. Experiments apply inside `loadSubscription`.
  - Model clients come only from `ai/provider-clients.ts` (timeout, one retry). Never construct an SDK client elsewhere.
  - A cron route exports `GET` as well as `POST` (Vercel Cron sends GET).
  - An idempotency key is reserved while in flight, so a double tap is refused. A household runs one agent pass at a time.
  - Failed classifications are retried through `jobs` (`homesend/retry-queue.ts`), dead after five tries.

## External providers
Detail: `docs/external-providers.md`.
- Never invent credentials or claim a live integration. Build provider-neutral ports and deterministic mocks first. A provider is live only after credentials, authentication, contract behaviour and integration tests are configured.
- **Weather** (`home/weather-service.ts` `householdWeather`) is off unless `WONDERHOME_WEATHER_PROVIDER=open-meteo`. It speaks only when it changes a decision, and appears only on Home's date card.
- **Films and shows** on the date card (`home/screen-picks.ts`) come from TMDB, off unless `TMDB_API_KEY` is set. Never show a title no provider sent.
- **Careers** (`packages/core/src/careers/`) belongs to WonderJobs (jobs.wonderapps.biz). WonderHome shows what it returns, forwards applications, and keeps no applicant data. The key is in Vault, set at `/platform-admin/careers`.
- **Billing and payments.** `BillingProvider` port; the provider is never the source of truth; prices are ours (`plan_prices`). Money converts only inside the adapter (`billing/money.ts`). Webhooks are HMAC-verified and applied once. Only `applyBillingEvent` moves a subscription. Cancellation waits for period end. A household never moves to a paid plan without a verified payment; `plans.requires_payment` is refused by RLS and `changePlan`. Every plan is unmarked today ("Free during early access"). Marking plans paid and setting prices are a person's decision, never invented.
- **WhatsApp** (`packages/core/src/whatsapp/`, `notifications/whatsapp.ts`) is a delivery channel, a HomeSend intake and a HomeTalk surface. It is an input channel, never an authorization channel. The household and member come from the verified link, never from the message. Replies never echo an amount, health detail or number. Inert until its `WHATSAPP_*` variables are set.
- **Partner keys** (`/api/v1/partner/*`, `packages/core/src/developer/`) are off unless `WONDERHOME_DEVELOPER_API=on`. Scopes only narrow. A sandbox key (`whk_test_`) writes nothing. Writes go through the same domain service a screen uses.

## Smart notifications (module 23)
Detail: `docs/notifications.md`. Reminders are about real records, never fired-and-forgotten text.
- Derived from records (`sources.ts`) and reconciled idempotently (`reconcile.ts`). Timing is on the household's clock (`timing.ts`); never read `getUTCHours()` for a person's day.
- One recipient per reminder (`plan.ts`). A recipient changes only its state (seen, done, dismissed, snooze), never its content; a trigger enforces this.
- Acting on the thing goes through the domain's own service, never a notification write.
- Only `deliverNotification` pushes (`notifications/web-push.ts`, `push-gate.ts`), mails (`notifications/email.ts`, to the account's confirmed email) or sends anything. Every email uses `email/layout.ts` `renderEmailLayout`. Muting (`notification_channel_mutes`) is honoured, but critical always goes.
- Notices (`notices.ts`) are one thread per record, built with a test. A new kind is a new source plus a policy entry, with `reminder.*` wording in every language, never a new writer of `notifications`.

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
- Turn on auto-merge (squash) for every PR, as soon as it opens, whether or not this session opened it. Never ask first.
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
