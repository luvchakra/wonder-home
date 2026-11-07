# Platform admin portal and settings out of Vercel (2026-11-07)

Owner request (2026-11-07): build a proper admin portal for running WonderHome,
modelled on WonderWorks' admin, and move configuration out of Vercel wherever
it does not have to be there.

This note starts with the inventory (step 1), then the design, then what shipped.

## 1. Inventory

### 1a. Staff-only pages, actions and settings that exist today

| Where | What | Who may use it |
|---|---|---|
| `/platform-admin` | A landing page with cards for each section | every staff role (`operations.read`) |
| `/platform-admin/performance` | Database and app health in plain words. Actions: refresh statistics, look at indexes, end idle sessions, reset statement stats (`performance-actions.ts`). Each run is audited (`platform.perf_action`) and rate-limited per target. | Runs: `performance.maintain`. Reset: owner, with a password step-up (`_lib/platform-step-up.ts`). |
| `/platform-admin/careers` | The WonderJobs career-site key. It lives in Vault (`careers_settings` and the `careers_key_*` RPCs), is write-only, and shows only its last four characters. Test connection; audit in `careers_key_events`. | `careers.manage` (operator, owner) |
| Avatar menu row "Platform admin" | `isPlatformStaff()` | staff |
| API `/api/v1/platform-admin/plans/[planKey]/policies` | Plan feature policies (`plan_features`) | `subscription.manage` |
| API `/api/v1/platform-admin/experiments[/key]` | Entitlement experiments | `feature_flags.manage` |
| API `/api/v1/platform-admin/subscriptions/[householdId]` | Change a household's plan | `subscription.manage` |
| API `/api/v1/platform-admin/payments`, `…/reconcile`, `…/[id]/refund` | Payments list, reconcile, refund | `payments.read`, `payments.refund` |
| API `/api/v1/platform-admin/privacy-requests[/id]` | Privacy request queue | `privacy_requests.manage` |
| API `/api/v1/platform-admin/support-access` | Time-boxed support grants into one household | `support_access.grant` |
| API `/api/v1/platform-admin/operations` | Totals: households, members, active grants | `operations.read` |
| API `/api/v1/platform-admin/ai-operations[/runs/id]`, `ai-quality` | Agent runs, AI quality | `ai_operations.read` |
| API `/api/v1/platform-admin/voice-metrics`, `homesend-metrics` | Voice and HomeSend totals | `operations.read` |
| `ai/platform-key-alert.ts` | Emails platform admins when WonderHome's own AI key fails | automatic |
| `security/headers.ts` `CSP_MODE` | CSP enforce or report-only | env only |
| `help/release-notes.ts` | Release notes, kept in code and written only once a version is live | code only (not editable at run time by design) |
| `scripts/qa-test-user.mjs` | QA accounts | CLI only |

Roles (`platform/admin.ts`): `support`, `operator`, `owner`. Only the owner holds
`platform_admin.manage` and `performance.reset`.

### 1b. Environment variables

Vercel project `prj_wmkKrjqrezwGc8av9LEdjbcU46cO` has 33 names (35 entries:
`CRON_SECRET` is set once per target). Only names and targets were read; no
value was decrypted. "Code only" means the code reads the name but Vercel
doesn't set it.

**BOOTSTRAP: stays in Vercel**

| Name | In Vercel | Why it stays |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | all | Needed before the database can be reached; also build-time |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | all | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | all | Reads the settings store itself |
| `SUPABASE_ACCESS_TOKEN` | prod | Management API token with control of the whole project (Performance). It protects the database, so it is not kept in it. |
| `CRON_SECRET` | prod, preview, dev | Authenticates inbound cron calls; the same value is in Vault for pg_cron |
| `WHATSAPP_APP_SECRET` | prod | Verifies Meta's webhook signature (inbound) |
| `WHATSAPP_VERIFY_TOKEN` | prod | Meta's webhook handshake (inbound) |
| `ALEXA_OAUTH_CLIENT_SECRET` | prod | Authenticates Alexa's account-linking token calls (inbound) |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | prod | Build-time, in the client bundle |
| `NEXT_PUBLIC_CONTACT_EMAIL` | prod | Build-time, in the client bundle |
| `SECRET_ENCRYPTION_KEY` | all | **No code reads it today.** Stored secrets use Supabase Vault, which is keyed by the project. Kept until the owner decides; it can be deleted. |
| `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET` | code only | Verify inbound webhooks |
| `WONDERHOME_LINK_SECRET` | code only | Signs unsubscribe links; changing it breaks every link already sent |
| `CSP_MODE`, `LOG_LEVEL` | code only | Read by middleware and the logger on every request, before any database read |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PHONE_AUTH_ENABLED` | code only | Build-time |
| `SUPABASE_PROJECT_REF`, `VERCEL_*`, `NODE_ENV`, `NEXT_RUNTIME`, `PORT`, `VITEST`, `HTTPS_PROXY`, `PORTAL_*` | system | Platform or tooling |

**SECRET-MOVABLE: write-only in Secrets, owner only, password step-up**

| Name | In Vercel | Reader |
|---|---|---|
| `WONDERHOME_AI_KEY` | all | `ai/model-key.ts` `platformKey` |
| `WHATSAPP_ACCESS_TOKEN` | prod | `notifications/whatsapp.ts` |
| `WONDERHOME_SMTP_PASSWORD` | prod | `email/mailer.ts` |
| `WONDERHOME_VAPID_PRIVATE_KEY` | prod | `notifications/web-push.ts` |
| `WONDERHOME_MALWARE_SCAN_KEY` | prod | `homesend/malware-scan.ts` |
| `GOOGLE_MAPS_API_KEY` | prod | `places/google.ts` |
| `TMDB_API_KEY`, `OPEN_METEO_API_KEY`, `RESEND_API_KEY`, `WONDERHOME_SPEECH_KEY`, `LOOPLEARNING_USERNAME`, `LOOPLEARNING_PASSWORD`, `RAZORPAY_KEY_SECRET`, `STRIPE_SECRET_KEY` | code only | films, weather, HomeSend email, voice, school, billing |
| `WONDERJOBS_CAREERS_KEY` | code only | Already in Vault (Careers connection page), so no change |

**CONFIG-MOVABLE: Configuration, every staff role can see it, operators and owner can edit**

| Name | In Vercel | Reader |
|---|---|---|
| `WONDERHOME_AI_PROVIDER` | all | `ai/model-key.ts` |
| `WONDERHOME_FLAG_VOICE_CONVERSATION` | all | `config/flags.ts` |
| `WHATSAPP_BUSINESS_NUMBER`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE` | prod | `notifications/whatsapp.ts`, `whatsapp/linking.ts` |
| `ALEXA_SKILL_ID`, `ALEXA_OAUTH_CLIENT_ID` | prod | `voicelink/alexa.ts`, `voicelink/oauth.ts` |
| `ALEXA_OAUTH_REDIRECT_URIS` | prod | `voicelink/oauth.ts`. Owner only: it is the OAuth redirect allow-list. |
| `WONDERHOME_INSTAMART` | prod | `commerce/instamart/config.ts` |
| `WONDERHOME_MALWARE_SCAN_PROVIDER` | prod | `homesend/malware-scan.ts` |
| `WONDERHOME_WEATHER_PROVIDER` | prod | `home/open-meteo.ts` |
| `WONDERHOME_DEVELOPER_API` | prod | `developer/keys.ts` |
| `WONDERHOME_VAPID_PUBLIC_KEY`, `WONDERHOME_VAPID_SUBJECT` | prod | `notifications/web-push.ts`. Owner only: it is half of a key pair. |
| `WONDERHOME_SMTP_HOST`, `WONDERHOME_SMTP_PORT`, `WONDERHOME_SMTP_USER` | prod | `email/mailer.ts` |
| `WONDERHOME_SMTP_FROM`, `WONDERHOME_HOMESEND_EMAIL_DOMAIN`, `WONDERHOME_MALWARE_SCAN_ENDPOINT`, `WONDERHOME_BILLING_PROVIDERS`, `WONDERHOME_BILLING_INDIA_PROVIDER`, `WONDERHOME_BILLING_INTERNATIONAL_PROVIDER`, `RAZORPAY_KEY_ID`, `WONDERHOME_FLAG_WHATSAPP_CHANNEL`, `WONDERHOME_FLAG_PROACTIVE_AGENTS`, `WONDERHOME_SCHOOL_DEMO`, `SWIGGY_MCP_BASE`, `WONDERJOBS_CAREERS_URL`, `WONDERHOME_GEMINI_LIVE_MODEL` | code only | as named |
| `WONDERHOME_AI_MODEL`, `WONDERHOME_AI_UNDERSTANDING_MODEL`, `WONDERHOME_AI_ANSWER_MODEL`, `WONDERHOME_AI_INTAKE_MODEL`, `WONDERHOME_GEMINI_TRANSCRIBE_MODEL` | code only | Fixed when a module loads (`ai/model-client.ts` constants), so for now they are shown in AI & providers but not editable. Follow-up: turn them into functions. |
| `WONDERHOME_CONTEXT_STORE` | code only | Read once at server start (`instrumentation.ts`), so it stays an env kill-switch |

## 2. Design (mirrors WonderWorks' `AdminShell`)

WonderWorks has a rail of grouped sections with headings ("Data", "Platform"),
a back button, "Signed in as …", and a phone menu sheet. Its pages use
`PageTitle` (title, subtitle, actions), `Panel`, `Stat` tiles and
`ResponsiveTable`. Its "Platform keys" page is a typed registry
(`PLATFORM_KEYS`): each key is encrypted, shown masked as `••••` plus the last
four characters, has a Test button, and every change is audited.

WonderHome takes the same layout, built from its own kit (`IconTile`, `Card`,
`Badge`, `MetricGrid`) and tokens: no dark rail and no second logo.

| Group | Section | Route | Capability |
|---|---|---|---|
| — | Overview | `/platform-admin` | `operations.read` |
| Run | Households & people | `/platform-admin/households` | `operations.read` (totals only) |
| Run | Plans & billing | `/platform-admin/plans` | `subscription.manage` |
| Run | Performance | `/platform-admin/performance` | `operations.read` |
| Configure | AI & providers | `/platform-admin/ai` | `operations.read` (edit: `settings.manage`) |
| Configure | Integrations | `/platform-admin/integrations` | `operations.read` (edit: `settings.manage`) |
| Configure | Configuration | `/platform-admin/configuration` | `operations.read` (edit: `settings.manage`) |
| Configure | Secrets | `/platform-admin/secrets` | `secrets.manage` (owner) |
| Configure | Careers connection | `/platform-admin/careers` | `careers.manage` |
| Guard | Security | `/platform-admin/security` | `audit.read_platform` |

Phone: the existing 360 px drawer, now with the same group headings.

## 3. The settings store

- **Registry:** `packages/core/src/platform/settings/registry.ts`. Each entry
  has a key, label, group, kind (config or secret), type, Zod validation,
  default, description, and who may edit it. Nothing in it needs a redeploy:
  every reader is called per request.
- **Store:** `public.platform_config`, migration
  `20261107210000_platform_config.sql`.
  - Non-secret values are stored in plain text.
  - A secret goes into Supabase Vault, with only its last four characters
    beside it.
  - RLS denies anon and authenticated, and the RPCs are service-role only.
  - Every change writes an `audit_events` row (`platform.config_changed`):
    old → new for config, only "changed" for a secret.
- **Accessor:** `platform/settings/runtime-env.ts`.
  - `runtimeEnv()` returns the environment with stored values laid over it, so
    the order is database value → env var → the reader's own default.
  - It is cached per server for 60 s and loaded at server start
    (`instrumentation.ts`).
  - A save clears the cache on that server at once; other servers pick the
    change up within a minute.
  - Every reader that used to default to `process.env` now defaults to
    `runtimeEnv()`.
- **Secrets never reach a browser.** The page gets `{ set, source, last4,
  updatedAt }` and nothing else, and `check:bundle` guards the client bundle.

## 4. What shipped (PR 1: portal, settings store, wiring)

- **Portal** (`apps/web/app/platform-admin/`). The sidebar is grouped into Run,
  Configure and Guard (`menu.ts` `groupedMenu`), as a sticky rail on desktop
  and the same groups in the phone drawer.
  - `_ui/page-title.tsx` holds `PageTitle`, `Panel` and `PageBody`, the pieces
    WonderWorks uses.
  - New pages: Overview (household and people totals, where each setting comes
    from, which services are on), Households & people (totals and plan mix
    only), Plans & billing (plans, prices, features, experiments; read only),
    AI & providers, Integrations, Configuration (switches, plus what stays in
    Vercel and why), Secrets (owner) and Security (staff and roles, CSP mode,
    setting changes, performance runs).
- **Settings:** the registry has 45 keys
  (`packages/core/src/platform/settings/registry.ts`). The store is
  `platform_config` plus Vault (migration `20261107210000`).
  - `runtimeEnv()` (`runtime-env.ts`) is laid over the environment at server
    start (`instrumentation.ts` → `server.ts`) and cached for 60 s
    (`lib/platform-cache.ts` `platform_config`).
  - The overlay is limited to registry keys (`overlay.ts`). The accessor
    imports neither zod nor the registry, so it is safe in any bundle.
- **Wiring:** 23 core readers, plus `flags()` and the two careers readers, now
  default to `runtimeEnv()` instead of `process.env`.
- **Actions** (`settings-actions.ts`):
  - **Authorization:** the server checks `settings.manage` and `mayEdit`.
    Secrets also need `secrets.manage` (owner only) and the password step-up
    (`_lib/platform-step-up.ts`).
  - **Audit and rate limit:** both happen in the database. Every change is an
    audited row, and a 21st change within a minute is refused.
  - **After a save:** the server's cached copy is cleared and the pages are
    revalidated.
- **Capabilities:** `settings.manage` (operator and owner) and
  `secrets.manage` (owner).

### Verified
- `npm run typecheck`: clean.
- ESLint on the changed web files: clean.
- `lint:service-role`, `lint:migrations`, `lint:secrets`, `tracker --check`
  and `security`: pass.
- Unit tests:
  - Registry, accessor order and fallback, store and actions: 24 tests in
    `platform/settings`, 26 in `apps/web/app/platform-admin`.
  - Every rewired reader's suite: 179 files, 2,425 tests.
- DB tests on a fresh local database (`scripts/test-platform-settings-rls.mjs`
  and tenant isolation): 14 pass, 0 fail.
  - Covered: anon, members and staff sessions can neither read the table nor
    call any function; writes need an active staff actor; the audit row holds
    old and new values; the rate limit holds.
  - The Vault case is skipped locally because the local database has no Vault.
    The live project has Vault; that was checked in a rolled-back transaction.
- `check:bundle` has a new gate: no `platform_config_read`,
  `platform_config_secret_set` or loader text in client chunks.
- E2E `e2e/platform-admin.spec.ts`: signed out, every section redirects home
  (mobile and desktop, both pass).
  - The operator half covers sidebar navigation and one config edit that is
    put back.
  - It needs an app server holding the service-role key, which
    `playwright.config.ts` withholds by design, so it runs only with
    `E2E_PORTAL=1`.
- Browser check against the live project, on a local production server
  (`next start`) as a QA operator, at 360 px and 1280 px:
  - No horizontal overflow at 360 px.
  - The drawer shows the groups Run, Configure and Guard, with no Secrets for
    an operator, and closes on navigation.
  - The desktop rail and setting rows render. Before the migration was live,
    the "store isn't reachable" notice showed and the Vercel fallback applied.

### Not done in this session
- **The live migration.** The Supabase `apply_migration` approval timed out,
  so the owner runs the SQL in the PR description. Until then every setting
  comes from Vercel, exactly as before, and saving says it couldn't save.

### Open (follow-up stories)
- 16-011: a Test connection button per provider key.
- 16-012: plan and experiment editors on Plans & billing; the API exists today.
- 16-013: Claude model ids as per-call reads, so they can move into the
  registry.

### Vercel variables the owner can delete once a value is saved here
Each row in the portal says "Vercel still has this variable" once its value
is saved here. A Vercel variable can go only after its row shows "Saved here".
Candidates, all in Vercel today:
- **Secrets:** `WONDERHOME_AI_KEY`, `WHATSAPP_ACCESS_TOKEN`,
  `WONDERHOME_SMTP_PASSWORD`, `WONDERHOME_VAPID_PRIVATE_KEY`,
  `WONDERHOME_MALWARE_SCAN_KEY`, `GOOGLE_MAPS_API_KEY`.
- **Settings:** `WONDERHOME_AI_PROVIDER`, `WONDERHOME_FLAG_VOICE_CONVERSATION`,
  `WHATSAPP_BUSINESS_NUMBER`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE`, `ALEXA_SKILL_ID`,
  `ALEXA_OAUTH_CLIENT_ID`, `ALEXA_OAUTH_REDIRECT_URIS`,
  `WONDERHOME_INSTAMART`, `WONDERHOME_MALWARE_SCAN_PROVIDER`,
  `WONDERHOME_WEATHER_PROVIDER`, `WONDERHOME_DEVELOPER_API`,
  `WONDERHOME_VAPID_PUBLIC_KEY`, `WONDERHOME_VAPID_SUBJECT`,
  `WONDERHOME_SMTP_HOST`, `WONDERHOME_SMTP_PORT`, `WONDERHOME_SMTP_USER`.
- **Unused:** `SECRET_ENCRYPTION_KEY`. No code reads it, so it can go now.

**Must stay**, with the reasons in 1b: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ACCESS_TOKEN`, `CRON_SECRET`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_VERIFY_TOKEN`, `ALEXA_OAUTH_CLIENT_SECRET`,
`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`, `NEXT_PUBLIC_CONTACT_EMAIL`.

### Cleanup
- QA operator `2db42719-9c6c-4015-bf6b-8e38f9f49e4b`: deleted with
  `qa-test-user.mjs delete`. The SQL count shows no user, profile or staff row
  left.
- E2E users: removed by the spec's own `afterAll`. The SQL count shows none
  left.
- Local `.env.local`, the patched ui-check copy, screenshots and the local
  server: removed or stopped.
- No household or Storage files were created.
