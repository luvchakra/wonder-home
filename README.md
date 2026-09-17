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
