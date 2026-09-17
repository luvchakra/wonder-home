# WonderHome — Architecture Decisions

## ADR-001 — Next.js responsive web/PWA instead of React Native
**Decision:** Use Next.js App Router with responsive mobile-first UI.
**Reason:** Matches WonderArk stack, keeps one codebase for mobile/desktop and avoids introducing a second client runtime.

## ADR-002 — Supabase PostgreSQL
**Decision:** Supabase is the system-of-record database and auth/session foundation.
**Reason:** Matches WonderArk core and provides PostgreSQL, RLS and SSR integration.

## ADR-003 — AI provider abstraction with Anthropic primary
**Decision:** Vercel AI SDK is the abstraction; Anthropic Claude is the primary provider; Google Gemini and OpenAI are supported alternatives.
**Reason:** Preserves provider flexibility while establishing a deterministic default.

## ADR-004 — API-first domain architecture
**Decision:** UI and AI agents consume `/api/v1`; domain services own business logic.
**Reason:** Enables mobile/desktop reuse, integrations and safe agent tooling.

## ADR-005 — Security by construction
**Decision:** Tenant isolation, RBAC, RLS, audit and secret handling begin in bootstrap and identity/API stories.
**Reason:** Security cannot be bolted on after domain implementation.

## ADR-006 — Provider-neutral external integrations
**Decision:** External providers are adapters behind canonical interfaces; unavailable providers use deterministic mocks/fixtures.
**Reason:** Prevents fake integrations and avoids blocking unrelated development.
