# Voice on by default, with platform defaults a household can override

Owner, 2026-11-22: "these should be also configurable on platform level and should be switched on by default. on user level, the keys should be allowed to be changed, which can override platform admin values".

## What changed

- **Platform admin → AI & providers → Voice and Alexa** gains four settings (`platform/settings/registry.ts`):
  - `WONDERHOME_GEMINI_VOICE_KEY`: WonderHome's own Google AI (Gemini) key for live voice. A secret, owner-only, Vault-backed like every provider key, store-only (`STORE_ONLY_KEYS`), never shown back.
  - `WONDERHOME_VOICE_ENGINE_DEFAULT` (Gemini Live), `WONDERHOME_VOICE_PROVIDER_DEFAULT` (Google), `WONDERHOME_VOICE_SHARE_GOOGLE_DEFAULT` (on). Each can be turned off there.
  - `WONDERHOME_FLAG_VOICE_CONVERSATION` now defaults to **on** (`config/flags.ts` too).
- **One resolver**, `packages/core/src/voice/defaults.ts`: member's own choice (engine only) → household's saved setting or key → platform default or key → built-in fallback (browser speech, WonderHome's own live loop, nothing to Google). Used by the Gemini gate (`apps/web/app/_lib/gemini-live.ts`, which every `/voice/gemini/*` route, `/ai` and Settings → Voice call), `voice/repository.ts` `loadHouseholdVoice` (every `loadVoiceSettings` reader) and Settings → AI Assistant. The key goes through `resolveModelKey`, no second path: household voice key → household assistant key if Google's → WonderHome's voice key → WonderHome's assistant key if Google's. A household assistant key on Anthropic/OpenAI no longer hides WonderHome's voice key.
- **Defaults fill only what was never chosen**, at read time; no row is rewritten.
  - Voice to Google is a new optional `googleVoice` in the household's versioned `AI data use` policy rule (no migration): absent = the platform default; an explicit "Don't share" always wins, and a household that turned sharing off altogether stays off. A form that doesn't send the field keeps the stored answer.
  - Speech provider: null = never chose (migration `20261122210000_voice_provider_follows_platform_default.sql`, safe either order: before it, "Default" saves the resolved default, exactly what the household hears today).
  - Household live engine: it has had no editor since 2026-10-29, so its old column default "wonderhome" reads as never chosen; "gemini_live" counts as the household's answer. Members choose "Default (from WonderHome)" or an engine on Settings → Voice.
- **Settings**: Settings → Voice shows "Default (from WonderHome): …" for the engine and speech service until someone picks. Settings → AI Assistant → Gemini voice key shows "Using WonderHome's key" / "Your own key", and removing your own falls back to WonderHome's. "What the assistant may share" says in plain words when WonderHome's default sends voice to Google, with "Share voice conversations with Google": Default / Share / Don't share.
- Help guide voice section (all eight languages, updated 2026-11-22); settings-search entry `ai-share-google-voice` in all eight. Paying and ordering by voice stay impossible (`consent.ts`, `voicelink/capabilities.ts` untouched).

## Verified

- `voice/defaults.test.ts`: member > household > platform > fallback for key, engine, provider and sharing; explicit household off beats platform on; Gemini gate opens with a platform key only; registry defaults match the reader.
- Touched tests (voice, voicelink, config, platform settings, privacy, i18n, help, settings-search, settings registry): all pass. Typecheck, ESLint on changed files, `lint:help-links`, `lint:migrations`, `npm run build -w apps/web`, `check:bundle` (no settings-store code in client chunks): pass.
- Browser, 360 px and 1280 px, QA household on the live project: Settings → Voice shows the Default choices, no overflow; Settings → AI Assistant shows the voice-to-Google line and the three choices; "Don't share" saved and stored as `googleVoice: false`; saving Voice with "Default" before the migration stores the resolved default and leaves the member's engine null.
- Cleanup: QA user `abf87648-…` and household `40a83b83-…` deleted; counts zero on households, members, policies, voice settings, subscriptions.

## Open / needs a person

- The owner pastes WonderHome's Google AI key once: Platform admin → AI & providers → Voice and Alexa → Gemini voice key. Until then Gemini Live says it needs a Google key (the speech key `WONDERHOME_SPEECH_KEY` is separate and also unset).
- Apply the migration (SQL in the PR).
