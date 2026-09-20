# A voice the household chooses (story 04-009)

## What was done

Live conversation shipped earlier today on the browser's own Web Speech
APIs, which are free and genuinely poor: continuous recognition barely
works in Safari, and "a male voice" was a guess from whatever the device
happened to expose. This replaces that with a real speech provider the
household configures, and keeps the browser as the free fallback.

**Google Cloud Speech, behind a provider contract.** `voice/provider.ts`
defines one shape — `speak`, `listen`, `voices` — the same way
`integrations/connector.ts` does for external providers. `voice/google.ts`
is the only file that knows Google's vocabulary; everything above it
speaks in the household's terms. A second provider later means one
adapter, not a rewrite.

**Authentication by API key, read only on the server.**
`household_voice_credentials` has no SELECT policy at all, exactly as
`household_ai_credentials` does not: the key can be set and replaced by an
administrator and read back by nobody, including the household that set
it. The browser never holds it — the page posts audio or text to our own
route, which reads the key with the service role and calls Google.

**Every control Google actually honours, in the household's own words.**

| Speaking | Listening |
|---|---|
| Language and accent (22 offered, any BCP-47 tag accepted) | Language spoken |
| Voice family: Standard, WaveNet, Neural2, Studio, Chirp 3 HD | Up to three more languages, for a household that switches mid-sentence |
| Male, female or either | Recognition model: short phrases, longer speech, commands, Chirp |
| A specific named voice, listed live from Google | Automatic punctuation |
| Speaking rate, 0.25× to 4× | Profanity masking |
| Pitch, ±20 semitones | Words to expect |
| Volume, ±16 dB | Enhanced models |
| Where you listen: phone, headphones, speaker, car, wearable | |
| Whether replies are read aloud at all | |

**Member names are sent as recognition hints automatically.** Nobody
configures this. Proper nouns are what a household assistant mishears, and
hinting them is the single biggest accuracy win available; the screen
offers a box for extra words (a dish, a school, the dog) on top.

**Combinations a provider rejects are dropped, not sent.** Chirp 3 HD
voices synthesise their own prosody and return a 400 for `pitch` or an
effects profile; Chirp recognition rejects `useEnhanced`. The adapter
strips those rather than surfacing a provider error a household cannot act
on. Every Google failure is mapped to something actionable — a refused key
points at Settings, an un-enabled API says so, a spent allowance is marked
retryable — and Google's own prose, which names projects and quotas, is
never passed through.

**One recording format on every browser.** `voice/capture.ts` records with
`MediaRecorder`, then re-encodes to 16 kHz mono WAV. Safari records AAC in
an MP4 container, which Google's speech API cannot read at all; one format
everywhere beats discovering that by being misheard. It also does its own
end-of-utterance detection (energy-based, forgiving of a mid-sentence
pause), because that is the job `SpeechRecognition` was doing for free.

## What is still open

- **Safari's `MediaRecorder` is used but not verified on a real device.**
  The decode-and-re-encode path exists precisely for it, and the logic is
  covered by unit tests, but nobody has run it on an actual iPhone in this
  session. Worth doing before telling a household it works there.
- **No metering of Google's own spend.** WonderHome meters
  `conversation.voice` per turn as before; what a household spends at
  Google is visible only in Google's console. A usage read-back would be a
  sensible follow-up.
- Long-form recognition uses the synchronous endpoint, so an utterance is
  capped at about a minute. That is well beyond a conversational turn and
  refuses cleanly rather than truncating.

## What was verified

- `npm run typecheck` — clean across both workspaces.
- `npm run lint` — clean, no warnings.
- `npm run test` — 88 test files, 1203 tests, all passing. 34 are new and
  cover the adapter's wire format specifically: that rate, pitch and volume
  arrive as Google names them, that pitch and the device profile are absent
  for Chirp, that phrase hints merge and de-duplicate, that the primary
  language is excluded from the alternatives, that each failure maps to the
  right code, and that voice selection falls back tier → gender → language.
- `npm run build` — succeeds; `/settings/voice` and the voice API route
  both register.
- `npm run test:e2e` — 256 passing, up from 252: the new endpoint is picked
  up automatically by the suite that asserts every route refuses an
  anonymous caller and is described in the OpenAPI document.
- `npm run tracker -- --check` — current, with 04-009 recorded.
- The migration is applied to the Mumbai project
  (`kqxndableyysxqhxiorz`).

## What a household has to do

1. In Google Cloud, create or pick a project.
2. Enable **Cloud Text-to-Speech API** and **Cloud Speech-to-Text API**.
3. Create an API key, and restrict it to those two APIs.
4. Paste it into Settings → Voice.

Billing has to be enabled on the project even to use the free monthly
allowances. Google publishes the current figures; they change, so no
number is hard-coded here or in the UI — the screen describes the tiers
qualitatively and says the largest allowance is on Standard.

Separately, live conversation itself still needs
`WONDERHOME_FLAG_VOICE_CONVERSATION=true` on the deployment and a plan
carrying `conversation.voice` (Pro or Max).

## Where the code lives

- `packages/core/src/voice/settings.ts` (+ test) — the schema every layer
  agrees on, and the household-facing vocabulary.
- `packages/core/src/voice/provider.ts` — the contract, the browser
  fallback and a deterministic mock that returns playable audio.
- `packages/core/src/voice/google.ts` (+ test) — the only file that knows
  Google's wire format.
- `packages/core/src/voice/capture.ts` — recording, silence detection and
  WAV encoding in the browser.
- `packages/core/src/voice/repository.ts` — settings, the credential, and
  `resolveProvider`, which decides what a household actually gets.
- `packages/core/src/components/ui/use-live-voice.tsx` — one hook, two
  loops: the provider's and the browser's.
- `packages/core/src/components/ui/{select,slider}.tsx` — new kit pieces.
- `apps/web/app/api/v1/households/[householdId]/voice/route.ts` — speak,
  listen, and what is configured.
- `apps/web/app/settings/voice/page.tsx`,
  `apps/web/app/_components/voice-forms.tsx` — the screen.
- `supabase/migrations/20260920120000_voice_settings_and_credentials.sql`
