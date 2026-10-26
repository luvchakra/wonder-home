# 2026-10-26: an email and an in-app message when an AI key stops working; WhatsApp carries an item on

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

- **In-app message.** HomeTalk and Settings → AI Assistant show a banner with the notice's own words.
  - An Admin gets a link to the fix; anyone else is told an Admin has heard.
  - While the voice key has an alert, the live-voice button explains instead of trying.
  - Members read their own household's alerts through `my_household_ai_key_alerts` (migration `20261026140000`, applied live). It checks membership and never returns a key.
- **WhatsApp carries an item on** (`whatsapp/intake.ts` `addOnItsOwn`, `_lib/whatsapp-hometalk.ts` `whatsappAutoAdd`).
  - After "Who is it for?" is answered, or straight away when nothing is missing, the app's own review decides under the member's session.
  - Where the outcome is Pre Approved and the reading is above the household's bar, the item is added through the same governed write and Undo as the app. The reply says so.
  - Otherwise it waits in HomeSend as before. WhatsApp never confirms anything itself.
  - `autoApply` moved out of the server-actions file to `(auth)/home-send-auto.ts`, so both paths share it.

## Verified

- Typecheck passes.
- `e2e/screens.spec.ts` against the live project, phone and desktop: 14/14 passed.
  - It seeds a made-up Gemini voice key and an "out of credits" alert.
  - It checks the banner and its link on HomeTalk and on Settings → AI Assistant.
  - It resolves the alert and checks the banner is gone.
- WhatsApp: 82 tests passed, with three new ones:
  - an item is added after the name;
  - it waits in HomeSend when the household wants to approve;
  - nothing is added while it is still asking.
- Unit tests pass for `ai`, `notifications`, `i18n` and `components`: 695 tests, including the new classification and notice tests.
- `lint:migrations` passes.
- The migration is applied live. Against the real key tables, a recorded alert for the household's Gemini voice key came back from `household_ai_key_alerts`. `authenticated` cannot execute the read function.

## Open

- No provider reports a balance ahead of time, so the email comes at the first refusal, not before.
- A platform key (`WONDERHOME_AI_KEY`) matches no household, so its alerts are recorded but tell no one yet.
- Cleanup: the live check left one alert row for the owner's voice key. It is resolved, so it never shows or emails; the delete prompt went unanswered. Remove it with `delete from public.ai_key_alerts where resolved_at is not null`. The E2E key's alert is deleted after each run. Afterwards: 0 open alerts and 0 E2E users.
