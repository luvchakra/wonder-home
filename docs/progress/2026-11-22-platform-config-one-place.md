# Configuration in one place: Platform admin (2026-11-22)

**Why.** Vercel paused the team; after the owner redeployed, WhatsApp went silent (nothing inbound since 21 Nov 18:04 UTC). The likely cause: `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` lived only in Vercel and were missing, so the webhook answered every message with an indistinguishable 401 and logged nothing. Owner: "can you bring these configs to platform admin instead of vercel, check other configs which needs to be brought in platform admin".

## What changed
- **Moved into the registry** (`packages/core/src/platform/settings/registry.ts`), each with label, help line and schema; secrets are `kind: "secret"`, owner-only, Vault-stored, shown as "ends in XXXX":
  - Integrations → WhatsApp: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (plus the webhook URL with Copy on the card).
  - Integrations → Payments: `RAZORPAY_WEBHOOK_SECRET` (the Razorpay card now says saved / using Vercel's / not set), `STRIPE_WEBHOOK_SECRET`.
  - Integrations → HomeSend: `RESEND_WEBHOOK_SECRET`. Integrations → Email: `WONDERHOME_LINK_SECRET`, `WONDERHOME_CONTACT_EMAIL` (replaces `NEXT_PUBLIC_CONTACT_EMAIL`).
  - AI → Voice and Alexa: `ALEXA_OAUTH_CLIENT_SECRET`.
  - Configuration → Features: `WONDERHOME_GOOGLE_SIGN_IN`, `WONDERHOME_PHONE_SIGN_IN` (replace `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` / `NEXT_PUBLIC_PHONE_AUTH_ENABLED`; all readers are server components, so no bundle cost and no client fetch), `WONDERHOME_CONTEXT_STORE`.
- **Safe transition.** Saved value wins; until one is saved the deployment's variable answers (old `NEXT_PUBLIC_*` names via `fallbackEnv`), unlike the AI keys (`STORE_ONLY_KEYS`, unchanged). The row says "Using Vercel's value — save it here to manage it" or "Not set". "Move all from Vercel" moves these too.
- **Cold start.** The WhatsApp, billing and Resend webhooks read through `settledSettingsEnv()` (waits, bounded, for a cold server's first read of the store).
- **Visibility.** The WhatsApp webhook records a `whatsapp_events` row `not_configured` (one a minute per server) when it refuses for a missing setting (migration `20261122180000_whatsapp_not_configured_event.sql`, safe in either order). "Configuration health" on Overview and Integrations lists each required setting missing for a half-set-up service (`platform/settings/health.ts`).
- **Runner.** `scripts/jobs.mjs` already calls `enablePlatformSettings`, so the GitHub runner and the Vercel fallback read the same saved values.
- `/legal` re-renders every 5 minutes so a saved contact email shows without a deploy.

## Audit (variable → class → decision)
| Variable(s) | Readers | Class | Decision |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY | config/env.ts, db/* | Bootstrap | Stay |
| CRON_SECRET | cron routes | Platform-required (Vercel Cron signs with the variable) | Stay; also unsubscribe fallback |
| SUPABASE_ACCESS_TOKEN | platform-performance, advisor scripts | Controls the whole project | Stay (never in its own DB) |
| CSP_MODE | security/headers.ts (request proxy) | Read before the store on every page | Stay (optional) |
| LOG_LEVEL | observability/logger.ts | Read before the store | Stay (optional, default info) |
| NEXT_PUBLIC_SITE_URL | csrf.ts, layout metadata, email links | Origin check + build-time metadata | Stay (optional; Vercel's production URL is used) |
| VERCEL_*, NODE_ENV, NEXT_RUNTIME | many | Platform system vars | Untouched |
| WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN | notifications/whatsapp.ts | Movable | **Moved** |
| RAZORPAY_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET | billing/*.ts | Movable | **Moved** |
| RESEND_WEBHOOK_SECRET | homesend/email-gateway.ts | Movable | **Moved** |
| ALEXA_OAUTH_CLIENT_SECRET | voicelink/oauth.ts | Movable | **Moved** |
| WONDERHOME_LINK_SECRET | notifications/unsubscribe.ts | Movable (enter Vercel's exact value) | **Moved** |
| WONDERHOME_CONTEXT_STORE | homebrain/context-store.ts | Movable | **Moved** |
| NEXT_PUBLIC_GOOGLE_AUTH_ENABLED, NEXT_PUBLIC_PHONE_AUTH_ENABLED, NEXT_PUBLIC_CONTACT_EMAIL | config/*.ts (server only) | Build-time, convertible | **Moved** as WONDERHOME_GOOGLE_SIGN_IN / _PHONE_SIGN_IN / _CONTACT_EMAIL |
| WONDERJOBS_CAREERS_KEY | careers/key-store.ts | Already saved at /platform-admin/careers (Vault) | Env is its fallback; delete once saved |
| AI keys/models, WhatsApp token/number/template, SMTP, VAPID, maps, weather, TMDB, Resend key, malware scan, Instamart, school portals, careers URL, billing providers and keys, flags, developer API | various | Already in the registry | Unchanged |
| PORTAL_POLL_MS, PORTAL_PROXY_SERVER, PORT (Fly portal worker) | apps/portal-worker | Worker process settings, no secret | Stay on Fly |
| E2E_*, WH_TEST_DB, PG*, GITHUB_* | tests, scripts, CI | Tooling | Untouched |

## Verified
- `npm run typecheck` clean.
- `npx vitest run packages/core/src/platform/settings packages/core/src/notifications packages/core/src/config packages/core/src/billing apps/web/app/platform-admin` — all pass; new `platform-config-one-place.test.ts` (saved wins, Vercel fallback, card source, health, no direct `process.env` read) and `notifications/whatsapp-not-configured.test.ts`.
- No Supabase MCP call and no live `platform_config` / Vault write: entering the values is the owner's job.

## Open / needs a person
- Apply the migration (SQL in the PR / coordinator report).
- Owner: enter the values in Platform admin, then delete the Vercel variables (steps in the coordinator report).
- Not done: a "Test" button for the WhatsApp access token against the Graph API (optional; deferred).
