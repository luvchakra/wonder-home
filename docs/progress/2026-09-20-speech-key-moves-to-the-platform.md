# The speech key belongs to the deployment, not to a family

## What was done

Story 04-009 shipped Google Cloud Speech with each household configuring
its own API key on `/settings/voice`. That was the wrong level. Creating a
Google Cloud project, enabling two APIs and pasting a credential is a
developer's errand — not something a family should have to do in order to
be understood when they talk. Speech is infrastructure: one project, one
bill, one set of quotas.

So the key moved to the deployment's environment, read on the server
exactly the way `WONDERHOME_AI_KEY` already was:

```
WONDERHOME_SPEECH_KEY=AIza…
```

`voice/platform-key.ts` is the only reader. The browser never sees it —
the page posts audio or text to our own route, which holds the key.

**What stays with the household** is everything about *how* it sounds:
language and accent, voice family, gender, named voice, rate, pitch,
volume, listening device, and the whole listening half. Those differ per
home and remain in `household_voice_settings`, untouched.

**The provider choice became a real control.** It used to be set
implicitly — adding a key turned Google on, removing it turned Google off.
With no key on the screen there was nothing left to imply it, so
`/settings/voice` now opens with "Who does the speaking": the browser's own
voice, or Google. The Google option is only offered where the deployment
has actually configured a key, and everything below dims with the reason
when it is not in use. A household that would rather nothing left the
browser can still say so, which is worth keeping.

## What was removed

- `household_voice_credentials` and `voice_credential_status()` are
  dropped. The table held **zero rows**, so nothing anybody had configured
  was discarded.
- `setVoiceKey`, `clearVoiceKey`, `voiceCredentialStatus`, `readVoiceKey`,
  the two server actions and `VoiceKeyForm` are gone.
- The `voice.key_set` and `voice.key_removed` audit events go with them —
  they can no longer happen. `voice.settings_changed` remains and now
  carries the more interesting fact: whether what is said out loud leaves
  the browser at all.

## What was verified

- `npm run typecheck` — clean.
- `npm run lint` — clean, no warnings.
- `npm run test` — 90 test files pass, including four new ones for the key
  resolver: absent when unset, read when set, and — the one that matters —
  a variable set to an empty or blank string reads as *not configured*
  rather than as a key that Google would then refuse. Whitespace from a
  copy-paste is trimmed.
- `npm run build` — succeeds.
- `npm run test:e2e` — 256 passing.
- The migration is applied to the Mumbai project.

## What a deployment has to do now

1. In Google Cloud, create or pick a project and enable **Cloud
   Text-to-Speech API** and **Cloud Speech-to-Text API**.
2. Create an API key restricted to those two APIs.
3. Set `WONDERHOME_SPEECH_KEY` on the deployment and redeploy.

Households then choose Google in Settings → Voice; nobody needs a Google
account of their own. Billing must be enabled on the project even to use
the free monthly allowances.

The two existing gates are unchanged: live conversation still needs
`WONDERHOME_FLAG_VOICE_CONVERSATION=true`, and a household still needs a
plan carrying `conversation.voice`.

## Where the code lives

- `packages/core/src/voice/platform-key.ts` (+ its test) — the only reader
  of the environment variable.
- `packages/core/src/voice/repository.ts` — preferences only now;
  `resolveProvider` takes settings alone and no longer needs a household id
  or the admin client.
- `apps/web/app/_components/voice-forms.tsx` — the provider choice replaces
  the key form.
- `apps/web/app/settings/voice/page.tsx` — three honest states, none of
  them a credential field.
- `supabase/migrations/20260920190000_speech_key_moves_to_the_platform.sql`
