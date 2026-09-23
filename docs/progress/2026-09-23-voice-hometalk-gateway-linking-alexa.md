# Voice: one HomeTalk gateway, linked voice identities, and Alexa as a channel

**Date:** 2026-09-23 · **Spec:** `design/voice-integration/01…06`

## What was done

- **Phase 1: the gateway.** Every channel goes through `runHomeTalkGateway` into the same turn the app uses (`apps/web/app/_lib/hometalk-turn.ts`).
  - The gateway lives in `packages/core/src/hometalk/gateway.ts` and its contract in `contract.ts`.
  - The contract has closed statuses: answered, clarification required, approval required, completed, failed and not authorized.
  - A member mismatch is refused.
  - Idempotency is keyed on the channel and request id.
  - A failure says "Nothing was changed" and never shows its insides.
- **Phase 2: external voice identity and account linking.**
  - WonderHome is the OAuth 2.0 authorization server: authorization code, S256 PKCE, and hashed tokens with prefixes (`voicelink/oauth.ts`, `repository.ts`).
  - Consent page: `/oauth/voice/authorize`. Token endpoint: `/api/v1/oauth/voice/token`.
  - Linked assistants are listed at `/settings/voice-assistants`, where a member can revoke one.
  - Scopes only ever narrow what the member may do (`voicelink/scopes.ts`), and payments and orders are never allowed by voice.
  - A voice turn runs under the member's own RLS session (`member-session.ts`).
  - Migration `20260925100000_external_voice_identities` applied live.
- **Phase 4: Alexa.** `/api/v1/voice/alexa` verifies requests the way Amazon documents: the certificate chain URL, the certificate itself, an RSA-SHA256 signature over the exact body, a 150-second timestamp window, and the skill id.
  - An unlinked speaker gets the LinkAccount card.
  - A clarification or approval keeps the session open.
  - The interaction model is generated from code, and a test checks the committed files match it (`integrations/alexa/`).

## Verified

- Gateway tests: 17.
- Voice-link tests: 16, plus 8 database tests.
- Alexa tests: 21.
- Full gates green; `verify:live` 149/149 after phase 2.

## Still open — needs a person

- **Alexa.** Create the skill in the Alexa developer console and set `ALEXA_SKILL_ID`, `ALEXA_OAUTH_CLIENT_ID`, `ALEXA_OAUTH_CLIENT_SECRET` and `ALEXA_OAUTH_REDIRECT_URIS`. Steps are in `integrations/alexa/README.md`. Until then the endpoint refuses everything.
- **Not built yet:** phase 3 (Gemini Voice, Live API) and phases 5–6 (the capability matrix, voice golden scenarios, and per-channel metrics).
