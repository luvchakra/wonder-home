# WonderHome — Claude Code Autonomous Build Contract

## Mission
Build **WonderHome** from this package as an AI-driven Household Operating System. It is a greenfield project and must use the WonderArk/founder-collab-aligned technical stack documented in `TECH-STACK-AND-NFR.md`.

## Mandatory startup
0. **Fetch the latest `main` first, before any other activity.** Run `git fetch origin main` and bring the working branch up to date with it (`git merge origin/main`, or start the branch from `origin/main` if it has no unmerged work). Never begin reading, planning or editing against a stale checkout: another session may have pushed since this one started, and work built on an old base is work that conflicts. Do this again whenever the session is resumed after a pause or a context reset.
1. Inspect the repository. If it is empty, start with `backlogs/00-Project-Bootstrap-and-Architecture.md`.
2. Read `TECH-STACK-AND-NFR.md`.
3. Read `tracking/PROGRESS.md` and `tracking/IMPLEMENTATION-ORDER.md`.
4. Read `architecture/API-ARCHITECTURE.md`, `architecture/SECURITY-BASELINE.md` and `database/SUPABASE-DATABASE.md`.
5. For any UI work, read `design/UI-UX-REQUIREMENTS-v3.md` (the UI/UX contract) and `design/DESIGN-NOTES.md` (the rules the components encode).
6. Pick the first dependency-ready incomplete story.

## Autonomous execution
For each story: mark In Progress → inspect existing code → implement → test → typecheck/lint/build → fix → update docs/migrations/contracts → mark Done → update overall/module trackers → continue automatically.

Do not ask “what next?”. Ask only for genuinely blocking product, security/privacy, destructive migration, production credential or irreversible architecture decisions.

## Stack is fixed unless explicitly changed
- Next.js 16 App Router
- React 19
- TypeScript 5.9.x
- Tailwind CSS 4
- Radix UI + Lucide React
- Supabase PostgreSQL + `@supabase/ssr` / `@supabase/supabase-js`
- Vercel AI SDK
- **Anthropic Claude primary AI provider; Google Gemini and OpenAI configurable alternatives**
- Zod + React Hook Form
- Vitest + Playwright
- npm workspaces with `apps/web` and `packages/*`

Do not switch to React Native, a different backend framework, Clerk, Prisma or another ORM without an explicit architecture decision. The mobile-first requirement means responsive Next.js/PWA-capable web UI, not React Native.

## Product rules
- Manage outcomes, not micro-task checklists.
- Normal household routines are silent.
- Househelpers do not need to update every chore.
- Notifications are precise, timely, recipient-specific, actionable, grouped, threaded and automatically resolved.
- Talk and text share one conversation engine.
- One household has multiple identities and personalized views.
- Head of Family can designate Household Administrators.
- Children have age-appropriate access and privacy.
- Manage Household defines responsibilities, playbook, routines, policies and AI autonomy.
- Certification exposes what WonderHome believes and lets authorized users correct it.
- AI agents use governed APIs/tools and never directly mutate Supabase.
- Server-side authorization is authoritative.
- Sensitive actions require appropriate approval/step-up authentication.

## External providers
Never invent credentials or claim a live integration. Build provider-neutral interfaces and deterministic mocks/fixtures first. A real provider is considered live only after credentials, authentication, contract behavior and integration tests are configured.

## Non-functional gates
Use the targets in `TECH-STACK-AND-NFR.md`. P0 security and authorization tests are release blockers. Core API targets are p95 <=500ms reads and <=800ms ordinary writes excluding external provider latency.

## Progress
`tracking/PROGRESS.md` is the overall source of truth. Every story status change must be reflected there and in the module file. Never fabricate completion.

**Write a progress note in `docs/progress/` after every major activity.** A major activity is anything a reader would want to find later without reading git history: a story or module completed, an infrastructure change (a database or hosting move, a new provider, a region change), a design-system or performance pass, a security fix, or a decision that shapes later work. Name the file `YYYY-MM-DD-short-slug.md` and write it before moving on to the next activity, not at the end of the session. Each note says what was done, why, what was verified (which gates ran and their results), what is still open or needs a person, and where the code lives. `docs/progress/README.md` is the index: add every new note to it. The trackers say *that* something is done; these notes say *what it was and how to pick it up*.
