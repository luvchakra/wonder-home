# 2026-10-26: an email when an AI key stops working

At the owner's request: Gemini ran out of credits. Live voice and WhatsApp voice notes stopped, and nobody was told.

## What was done

- `ai/key-alerts.ts` classifies a provider's refusal as one of three kinds:
  - `out_of_credits`: "credit balance is too low", `insufficient_quota`, HTTP 402.
  - `key_rejected`: 401, or "API key not valid".
  - `quota_exhausted`: a 429 that mentions quota. Google uses the same words for a spent balance and a per-minute limit.
- `ai/provider-clients.ts` watches every call:
  - Anthropic and OpenAI through a `fetch` wrapper.
  - Gemini by wrapping `generateContent` and `authTokens.create`. A minted voice token never counts as "working", because Google mints one even with no credits.
- Live voice runs in the browser. The page posts Google's close reason to `/voice/gemini/closed`, which records it against the household's voice key. The error message now also shows the reason.
- Storage: migration `20261026130000_ai_key_alerts.sql` adds `ai_key_alerts`, keyed by SHA-256 fingerprint; the key itself is never stored again. It is service role only, with four definer functions. It also allows the `ai_key` notification source.
- `notices.ts` `aiKeyNotices` sends one notice per key to the household's Admin, at high priority so it is emailed. It opens Settings → AI Assistant.
  - Quota refusals are told only after ten minutes.
  - The notice resolves itself on the next call that works.
  - Wording is in all eight languages.

## Verified

- Typecheck passes.
- Unit tests pass for `ai`, `notifications`, `i18n` and `components`: 695 tests, including the new classification and notice tests.
- `lint:migrations` passes.
- The migration is applied live. Against the real key tables, a recorded alert for the household's Gemini voice key came back from `household_ai_key_alerts`. `authenticated` cannot execute the read function.

## Open

- No provider reports a balance ahead of time, so the email comes at the first refusal, not before.
- A platform key (`WONDERHOME_AI_KEY`) matches no household, so its alerts are recorded but tell no one yet.
- Cleanup: one test alert row was recorded live for the owner's voice key and must be deleted before the deploy (`delete from public.ai_key_alerts`).
