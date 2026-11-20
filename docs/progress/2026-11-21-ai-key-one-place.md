# WonderHome's AI key in one place: Platform admin (2026-11-21)

The owner: "can you check entire app of ai key it's configured at multiple places? ensure its only configured once and used from there".

## Why

Platform admin showed the key saved there, yet `ai_key_alerts` kept one alert open (Anthropic, `key_rejected`, 67 refusals since 14 Nov, last 3 h 37 min after the new key was saved). Alerts are keyed by the key's SHA-256, so the refused key was the same old key throughout. The code had four ways to send an old copy:

1. **Vercel variable on a cold or slow server.** `runtimeEnv()` returned plain `process.env` until the saved settings loaded, and kept it when the read failed. `enablePlatformSettings` waited only 3 s.
2. **The GitHub runner never loaded the saved settings at all.** `jobs/runner.ts` read `process.env`, which `background-jobs.yml` filled from the `WONDERHOME_AI_*` secrets. So every Tidy and Sleep step on GitHub ran on the GitHub secret.
3. **Model names were read once, at module load, straight from `process.env`.** These were `model-client.ts` and `live-transcribe.ts`. They were not Platform admin settings at all.
4. **A household's own key** wins for that home. The owner's home has one.

Which copy was refused can't be proven from code. Alerts didn't record a source until now. The likeliest is the **GitHub Actions secret** (path 2): it was used on every scheduled Tidy and Sleep run whatever was saved, and those runs fit a steady refusal every few hours. The other candidates are the Vercel variable on cold starts (path 1) and the home's own key (path 4), if it still holds the old value. From this deploy on, each refusal records its source, and the card says which.

## Audit: before → after

| Setting | Places it could be set (before) | Readers | After |
|---|---|---|---|
| `WONDERHOME_AI_KEY` | Platform admin (vault); Vercel; GitHub secret; `.env*` | `platformKey()` from about 20 readers: HomeTalk turn and routing, translation, Gemini Live gate, HomeSend classify, second read and transcribe, tidy, Sleep and embeddings, trivia, dish ideas, health report, school photo, home cat, settings pages, eval CLI, key alerts. `jobs/runner.ts` read `process.env` directly. | Platform admin only. `runtimeEnv()` drops the Vercel and GitHub copies on any deployment. The runner loads the saved settings itself. |
| `WONDERHOME_AI_PROVIDER` | Platform admin; Vercel; GitHub secret; code default (from the key's prefix, else anthropic) | `platformKey()` | Platform admin, else the prefix or default |
| `WONDERHOME_AI_MODEL`, `_UNDERSTANDING_MODEL` | Vercel; GitHub secret; code defaults | `model-client.ts` constants, read once at load | Platform admin settings (new), re-read live, else the code default |
| `_ANSWER_MODEL`, `_INTAKE_MODEL`, `_SECOND_READ_MODEL` | Vercel; code defaults. Missing on the runner, so the runner ran other models than the site. | `model-client.ts` constants | Platform admin (new), else the default. The runner now uses the same models as the site. |
| `WONDERHOME_GEMINI_TRANSCRIBE_MODEL` | Vercel; code default | `live-transcribe.ts` constant | Platform admin (new), else the default |
| `WONDERHOME_GEMINI_LIVE_MODEL` | Platform admin; Vercel; default | `gemini-live.ts` `geminiLiveModel()` | Platform admin, else the default |
| `WONDERHOME_SPEECH_KEY` (Google speech-to-text and text-to-speech) | Platform admin; Vercel | `voice/platform-key.ts` → `voice/repository.ts` | Platform admin only. Its description is corrected: it is not used for Gemini Live. |
| Embedding models | Code only (`homebrain/sleep/embeddings.ts`) | — | Unchanged: not a setting |
| Household assistant key | `household_ai_credentials` | `credentials.ts` `readHouseholdKey` | Unchanged ("theirs wins"). It is now labelled `household` on alerts. |
| Household Gemini voice key | `household_gemini_voice_credentials` | `readGeminiVoiceKey`, Gemini Live, HomeSend transcribe, embeddings | Unchanged. There is no platform Gemini-voice setting: the fallback is WonderHome's AI key. |
| Household speech key | `household_voice_credentials` | `voice/repository.ts` `readVoiceKey` | Unchanged. The platform equivalent is `WONDERHOME_SPEECH_KEY`. |

**Places WonderHome's own AI settings could come from: 4 before** (Platform admin, Vercel, GitHub secret, module-load `process.env`). **1 after: Platform admin.**

### Precedence by runtime (after)

| Runtime | WonderHome's AI settings come from |
|---|---|
| Vercel request, server action, webhook, `after()`, Vercel cron | Saved settings. Until they are read: unset, and `runtimeEnvForAi()` waits up to about 5 s before a key is sent. If the read fails: no key. |
| Cold start | `instrumentation.ts` waits up to 3 s. Readers then see "no key" until the read lands, never Vercel's copy. |
| GitHub runner | `runJob` loads `platform_config` with the service role it already has. With no key saved, or a failed read, model steps stay on Vercel. |
| Edge runtime | None in this app. |
| Local `next dev`, unit tests | The environment may supply them (tooling). |
| `npm run eval -- --provider configured` | The environment, through `allowAiSettingsFromEnvironment()`. Refused when `VERCEL` is set. |

**First-time setup rule:** there is none. A deployment variable never counts. A new deployment's owner saves the key in Platform admin, and the card says "Vercel has this variable, but WonderHome ignores it. Save the value here to use it." So a removed or replaced key can never silently come back.

## What changed

Built on #588 (HomeSend session, merged first), which already added: `currentPlatformKey()` waiting up to 5 s on a cold server, the runner loading the saved settings (`scripts/jobs.mjs`), the key check on save and "Test key" (`ai/key-check.ts`, `ai-key-health.tsx`), the daily re-tell, superseded alerts (`supersede_ai_key_alerts`) and a one-minute hold on a refused key. #588 still fell back to the deployment variable after the wait; this PR removes that fallback everywhere.

- `platform/settings/runtime-env.ts`: `STORE_ONLY_KEYS`, `aiSettingsFromEnvironmentAllowed()`, `allowAiSettingsFromEnvironment()`, `runtimeEnvForAi()`, `savedSettingsLoaded()`, and `whenSettingsChange()` so model names follow a save.
- `ai/model-key.ts`: `platformKey()` notes where the key came from. `servingModelKey()` is the one "which key serves this home and from where" function, and `providerOfKey` is exported.
- `ai/model-client.ts`, `voicelink/live-transcribe.ts`: model names are live bindings read from the saved settings (`applyModelNames`).
- Registry: six model-name settings added under AI; the speech key description is corrected. "Move all from Vercel" never copies an AI key, since it may be the old refused copy.
- Key check on save and "Test key": #588's (`ai/key-check.ts`); the AI card now also says nothing in Vercel or GitHub is used, and how many homes use their own key.
- Alerts: migration `20261121030000_ai_key_alert_source.sql` adds `key_source` and the four-argument `record_ai_key_alert` (safe in either order; the code falls back to three arguments). The card line, Overview and the daily email name the copy refused. Superseding waits until the saved settings are read, so the platform key is never taken for unused.
- Settings → AI Assistant (all eight languages): one line saying which key answers for this home now and since when. "Use WonderHome's key instead" removes the home's own key after one confirm. The "no platform key" line points to Platform admin, not an environment variable.
- `background-jobs.yml` no longer passes `WONDERHOME_AI_*` secrets.
- Checked `hero-cat.tsx`: it renders only for signed-in adults (not the public landing page) and is pooled per server and language for 3 hours. No change needed.

## Verified

- `npx vitest run` on the touched areas: platform settings, the key check, key alerts, the platform key alert, model key, jobs, platform-admin, settings, i18n. All pass. New tests: `ai-settings-one-place.test.ts` (no direct `process.env` read, no workflow secret, the deployment ignores Vercel before and after load, a failed read means no key, model names follow a save) and `key-check.test.ts`.
- `npm run typecheck`, ESLint on changed files, and the `lint:service-role`, `lint:boundaries`, `lint:boundaries:input`, `lint:migrations`, `lint:secrets` lints all pass. The production build and `check:bundle` are in the PR.
- **Not verified against a live provider:** no key exists in these containers, so the key check is tested with mocked provider responses only.
- Nothing was written to the live project. No `platform_config`, credential or vault row was touched.

## Open / for the owner

- Apply the migration (SQL sent to the coordinator). Until it is applied, alerts record without a source.
- Cleanup, only after the deploy is READY:
  - Vercel: delete `WONDERHOME_AI_KEY`, `WONDERHOME_AI_PROVIDER`, `WONDERHOME_AI_MODEL`, `WONDERHOME_AI_UNDERSTANDING_MODEL`, `WONDERHOME_AI_ANSWER_MODEL`, `WONDERHOME_AI_INTAKE_MODEL`, `WONDERHOME_AI_SECOND_READ_MODEL`, `WONDERHOME_GEMINI_TRANSCRIBE_MODEL`, `WONDERHOME_GEMINI_LIVE_MODEL` and `WONDERHOME_SPEECH_KEY`, whichever exist.
  - GitHub Actions secrets: delete `WONDERHOME_AI_KEY`, `WONDERHOME_AI_PROVIDER`, `WONDERHOME_AI_MODEL` and `WONDERHOME_AI_UNDERSTANDING_MODEL`.
  - If you want your home on the single key: Settings → AI Assistant → "Use WonderHome's key instead".
- Follow-up: the platform alert email goes through the platform mailer, not `deliverNotification`, because platform staff are not household members. Moving readers in `homesend/*` and `hometalk-turn.ts` to `servingModelKey()` is left to those sessions: their `platformKey()` reads are already store-only.
