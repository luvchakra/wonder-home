# WonderHome — Claude Code Final Implementation Package

This package is the implementation specification for **WonderHome**. It has been revised after a gap review to address stack ambiguity, greenfield repository bootstrapping, story acceptance criteria, dependency order, non-functional targets and AI/provider architecture.

## Start here
1. `CLAUDE.md`
2. `TECH-STACK-AND-NFR.md`
3. `tracking/PROGRESS.md`
4. `tracking/IMPLEMENTATION-ORDER.md`
5. `architecture/API-ARCHITECTURE.md`
6. `architecture/SECURITY-BASELINE.md`
7. `database/SUPABASE-DATABASE.md`
8. `backlogs/00-Project-Bootstrap-and-Architecture.md`

## Project stack
WonderHome follows the current WonderArk/founder-collab stack: Next.js App Router, React, TypeScript, Tailwind CSS, Radix UI/Lucide, Supabase PostgreSQL/SSR, Vercel AI SDK, Anthropic Claude as primary AI provider with Google/OpenAI alternatives, Zod, React Hook Form, Vitest and Playwright, organized as an npm-workspaces monorepo.

## Greenfield repo
The repository may be empty. Claude Code must bootstrap the project from module 00 rather than assuming an existing application.

## Product principle
WonderHome should reduce household mental load. It manages outcomes silently, resolves routine work where policy permits, and interrupts the right person only when a meaningful decision or intervention is required.

## Running the project

Requires Node 22 (`.nvmrc`).

```bash
npm install
cp .env.example apps/web/.env.local   # fill in your Supabase project values
npm run dev                  # http://localhost:3000
```

Quality gates, all runnable from a clean checkout:

```bash
npm run typecheck        # tsc --noEmit across every workspace
npm run lint             # eslint
npm run lint:migrations  # migration conventions (RLS, household_id, search_path)
npm run lint:boundaries  # monorepo import layering
npm run test             # vitest unit tests + node --test for scripts
npm run test:db          # schema and RLS authorization tests (needs PostgreSQL)
npm run build            # next build
npm run test:e2e         # Playwright smoke tests, mobile and desktop
```

CI runs all of the above on every pull request (`.github/workflows/ci.yml`).

`npm run test:db` builds a throwaway database from the committed migrations and
exercises the real RLS policies as the `authenticated` role. It needs a
PostgreSQL 16 server and the usual `PG*` environment variables; CI provides one
as a service container.

If your environment ships a pinned Chromium that Playwright did not install
itself, point the suite at it instead of downloading another copy:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

## Repository layout

```text
apps/web            Next.js App Router host
packages/core       shared design system, config, Supabase clients, API primitives
supabase/migrations schema history, one logical change per migration
scripts/            CI lints with their own tests
e2e/                Playwright smoke specs
backlogs/           the 21 module backlogs (170 stories)
tracking/           live progress; PROGRESS.md is the source of truth
```
