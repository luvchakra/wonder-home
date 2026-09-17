# WonderHome — Technical Stack & Non-Functional Requirements

## Product / Project Identity
WonderHome is the project being built from this backlog. It is a greenfield application. The implementation baseline intentionally follows the technical architecture already used by the WonderArk project (`luvchakra/founder-collab`) rather than introducing a new stack.

## Baseline Stack — WonderArk-aligned

| Layer | Decision | Baseline |
|---|---|---|
| Web framework | Next.js App Router | Next.js 16.3.4 |
| UI runtime | React | React 19.2.8 |
| Language | TypeScript | TypeScript 5.9.3 |
| Styling | Tailwind CSS | Tailwind CSS 4 |
| UI primitives | Radix UI | Current WonderArk-aligned Radix packages |
| Icons | Lucide React | `lucide-react` |
| Forms | React Hook Form | `react-hook-form` |
| Validation | Zod | `zod` |
| Database | Supabase PostgreSQL | Supabase JS 2.x |
| Supabase SSR | `@supabase/ssr` | 0.12.x baseline |
| AI application layer | Vercel AI SDK | `ai` 7.x baseline |
| AI providers | Multi-provider | **Anthropic Claude primary**, Google Gemini and OpenAI supported/configurable |
| Unit/component tests | Vitest | 5.x baseline |
| E2E tests | Playwright | 1.x baseline |
| Package architecture | npm workspaces | `apps/*`, `packages/*` |
| Deployment target | Next.js-compatible managed deployment | Keep deployment adapter-neutral; Vercel is the preferred target if already used by the repo |

The versions above are based on the current WonderArk repository package manifests. WonderArk's web app currently uses Next.js 16.3.4, React 19.2.8, TypeScript 5.9.3, Tailwind 4, Vitest and Playwright; its shared core uses Supabase SSR/JS, the AI SDK with Anthropic/Google/OpenAI providers, Radix UI, Lucide, React Hook Form and Zod.

## Architecture Decisions

### Web, not React Native
WonderHome will be a **responsive Next.js web application / PWA-capable web app**, not a React Native application. The approved mockups are mobile-first but must also support desktop. This preserves the WonderArk stack and allows one codebase to serve phone, tablet and desktop experiences.

### Monorepo
Use the WonderArk pattern:
```text
apps/web
packages/core
packages/<domain modules>
scripts/
supabase/
```

Shared domain services, API contracts, UI primitives and security utilities belong in packages rather than being duplicated in `apps/web`.

### AI
Use the Vercel AI SDK abstraction. **Anthropic Claude is the default primary provider for WonderHome reasoning/conversation.** Google Gemini and OpenAI remain supported providers through the same provider interface so provider routing can be configured without rewriting business logic. Model IDs are environment/config driven rather than hard-coded into domain code.

AI agents must call governed application tools/services. They never directly mutate Supabase tables.

### Authentication
Use Supabase Auth / `@supabase/ssr` unless an explicit architecture decision later requires another provider. Do not add Clerk merely because it is common in other SaaS projects; the WonderArk baseline uses Supabase directly in core.

### Database
Supabase PostgreSQL with RLS. Application authorization remains mandatory in addition to RLS.

## Non-Functional Targets
These are initial engineering targets for production planning and load testing, not promises of provider performance.

### Scale target
- 25,000 households initially supported without architectural redesign.
- Up to 150,000 household members.
- Up to 10 million notification records/month.
- Up to 5 million outcome/routine state transitions/month.
- Design APIs/stateless workers so horizontal scaling is possible.

### Performance
- Standard authenticated GET API: p95 <= 500 ms under target load, excluding third-party provider latency.
- Standard mutation API: p95 <= 800 ms excluding asynchronous work and third-party provider latency.
- Notification decision calculation: p95 <= 1 second excluding external delivery provider.
- Non-AI page navigation/interactive response: p95 <= 2 seconds on a representative mobile connection for server-rendered content.
- AI conversation first-token target: <= 2.5 seconds; hard request timeout 20 seconds with graceful retry/fallback behavior.
- Long-running AI/integration work must be asynchronous and must not block the request thread.

### Availability / resilience
- Production target: 99.9% monthly availability for core household APIs.
- RPO target: <= 15 minutes.
- RTO target: <= 1 hour for core application/data recovery.
- External provider outages must degrade gracefully and never corrupt household state.

### Security
- 100% of tenant endpoints protected by server-side household/member authorization.
- No critical/high security finding may remain open for production release.
- Secrets must never appear in source, client bundles or application logs.

### Cost guardrails
Initial engineering guardrails, to be validated during load tests:
- Core application + database infrastructure target <= **US$2,000/month at 10,000 active households**, excluding AI, payment, WhatsApp/SMS/email provider charges.
- Background/proactive AI target <= **US$0.75 per active household/month** at default usage; user-initiated AI usage is metered and controlled by plan.
- Any design expected to exceed a guardrail by >25% must document the cause and receive an architecture review.

### AI quality / safety
- Consequential action tool calls require deterministic authorization/policy checks outside the LLM.
- Golden scenario evaluation suite must cover household changes, notification suppression, child boundaries, helper privacy and payment approval.
- AI must prefer clarification over guessing when ambiguity can cause a consequential change.

### Accessibility / UX
- WCAG 2.2 AA target for core flows.
- Touch targets and responsive behavior must support mobile-first use.
- Approved mockups are the visual reference; implementation should preserve their clean, family-oriented style while remaining accessible and functional.
