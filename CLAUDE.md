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
6. Read `design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md`. It is an authoritative product-direction update: real LLM reasoning behind the conversation engine and "Talk to WonderHome" as a P0 primary control surface take priority over chasing full backlog-story coverage. It does not replace the backlogs below — it reprioritizes work within them.
7. Pick the first dependency-ready incomplete story, weighted by that reprioritization.

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

## Design principles — keep every screen close to the mockups
The approved sheets in `design/` (splash and onboarding, the app screens, the
device sheet, the landing page) are the look, not a suggestion. Read
`design/UI-UX-REQUIREMENTS-v3.md` and `design/DESIGN-NOTES.md` before any UI
work, and hold new work against these:

1. **Warm, never clinical.** Cream page, white cards, soft shadows, generous
   rounding and generous whitespace. Never grey, never pure white for the page,
   never a dense dashboard. If a screen could belong to an analytics product,
   it is wrong.
2. **One handwritten line per screen.** Every sheet closes with script —
   "Less mental load. More family time.", "Home runs smoother. Together." Use
   `ScriptAccent` or `QuoteCard`, once per screen, always decoration and never
   a control. Nothing a household must read is said only in the script face.
3. **Blue commits, domains colour, state speaks in words.** The brand's
   Primary Blue is for every committing action and the active nav state. Each household domain
   keeps its own colour, used on the icon tile and never on text. Amber is
   attention, red is only for the genuinely critical, green is handled. Colour
   alone never carries a meaning — the wording and the offered action do.
4. **Every row begins with a tinted icon tile** (`IconTile`), then the name,
   then one line of reason, then the single thing to do. A row with nothing to
   do carries no action, which is itself the message.
5. **Botanical framing on warm surfaces.** `LeafDecor` in the corners of the
   signed-out frame, the landing hero and the closing section — faint, behind
   the content, never over anything readable.
6. **Five primary areas at every size, with the assistant raised in the middle**
   of the phone tab bar. Domains live in the desktop sidebar and behind More.
7. **A human sentence opens every screen and a warm one closes it.** A greeting
   with the person's name, a plain-language lede, and no bare table dropped on
   the page.
8. **Imagery is warm family life** — illustrated, in the household's own tones.
   Never stock-office photography, never a stretched screenshot: product
   visuals are the real components in device frames.
9. **Numbers are arithmetic somebody can explain.** A ring, a metric or a
   percentage is a count of things the system evaluated. Never invent one, and
   never show a figure with no source.
10. **Mobile-first and real.** Every screen works at 360px with no horizontal
    scroll, honours `prefers-reduced-motion`, keeps the three states
    (empty, error, loading), and never offers a button that does nothing
    because the provider behind it is not live.

Use the shared kit in `@wonderhome/core/ui/*` — no screen invents its own card,
row, pill or tile. A new pattern belongs in the kit, with a note in
`design/DESIGN-NOTES.md` saying which rule it encodes.

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

**Regenerate `docs/PROGRESS.md` after every story status change.** Run
`npm run tracker`. It projects all twenty-one backlogs into one page — where
the whole application stands, what is left, and every story with its status —
so nobody has to read twenty-one files to answer "what is done". The backlogs
stay the source of truth: edit the story's row there, then regenerate. Never
edit `docs/PROGRESS.md` by hand; CI runs `npm run tracker -- --check` and
fails when it is out of date.

**Write a progress note in `docs/progress/` after every major activity.** A major activity is anything a reader would want to find later without reading git history: a story or module completed, an infrastructure change (a database or hosting move, a new provider, a region change), a design-system or performance pass, a security fix, or a decision that shapes later work. Name the file `YYYY-MM-DD-short-slug.md` and write it before moving on to the next activity, not at the end of the session. Each note says what was done, why, what was verified (which gates ran and their results), what is still open or needs a person, and where the code lives. `docs/progress/README.md` is the index: add every new note to it. The trackers say *that* something is done; these notes say *what it was and how to pick it up*.
