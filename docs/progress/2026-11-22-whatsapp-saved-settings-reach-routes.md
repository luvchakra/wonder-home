# WhatsApp outage: saved settings never reached the webhook

**2026-11-22.** All seven WhatsApp settings were saved in Platform admin. The owner's "hi" got no answer, and `whatsapp_events` held one bare `not_configured` (15:08 UTC).

## Cause
Next 16 (Turbopack) compiles `instrumentation.ts` and each route into separate module graphs. In the production build, `platform/settings/runtime-env.ts` is inlined into instrumentation's module (id 8669, scope-hoisted with `config/env`), while `/api/v1/whatsapp/webhook` loads its own copy (id 229239). The store's loader was kept in module-level `let`s and registered only in instrumentation's copy. So the route's copy had no loader, and `settledSettingsEnv()` gave it only the deployment's variables. Nothing saved in Platform admin ever reached it. Whichever WhatsApp setting Vercel lacked at runtime, the webhook refused as `not_configured`.

This was not a Vault or key problem: `platform_config_read()` decrypts inside the database.

The same split can hide saved settings from any route that reads `runtimeEnv()`. The fix covers all of them.

## Fix
- `runtime-env.ts`: its state (loader, saved copy, timestamps, listeners) lives on `globalThis` under `Symbol.for("wonderhome.platform-settings.runtime-env")`. Every module copy in the process now shares one loader. `lib/platform-cache.ts` keeps its map the same way, so a save's `forgetRuntimeEnv` clears the copy every route reads.
- `platform/settings/server.ts` `ensurePlatformSettings()`: the webhook registers the loader itself if the server has none.
- Webhook: before refusing for a missing setting, it reads the store again (`reloadedSettingsEnv`, bounded 2.5 s, at most once per 10 s per server). A value saved a moment ago on another server is no longer refused from an older copy.
- `not_configured` names what was missing: `whatsapp_events.missing_settings` (setting names only, never values) and `settings_store` (`loaded` / `not_loaded` / `no_loader`), plus the same in the server log line. Migration `20261122200000_whatsapp_not_configured_detail.sql` works in either order: until it is applied, the event is written without the new columns.

## Verified
- `whatsapp-settings-reach-webhook.test.ts`: a second module copy (`vi.resetModules()`) built the way production builds the route, with all seven settings in the store and none in the environment, gives a config that has the app secret. It fails on the old code (`expected null not to be null`) and passes now. It also covers the cold wait, the re-read after a save elsewhere, and the 10 s throttle.
- `whatsapp-not-configured.test.ts`: the event carries the names and the store state, and drops anything that is not a setting name.
- Related unit tests: 26 files, 312 tests. Typecheck clean; migration, service-role, secret and boundary lints pass; `next build` passes.

## Open
- The live migration is applied by the owner or the coordinator (this session does not call Supabase).
- Part 2, the "Test WhatsApp" button on Platform admin → Integrations, follows in its own PR.
