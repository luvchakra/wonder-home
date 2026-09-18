# The platform's model key, and bring your own

**Date:** 2026-09-19 · **Kind:** feature (user request, outside the backlog)

## What was done

WonderHome now runs the assistant on **its own key by default**, so a family
gets a working assistant without holding an account with a model provider. A
household that would rather use their own sets one in Settings, and theirs
wins. `resolveModelKey` is the whole policy, in one pure function:

1. the household's own key, if configured;
2. the platform's key, from the deployment's environment;
3. neither — and then nothing pretends otherwise. The conversation engine
   answers from its deterministic rules and the screen says so, because
   `CLAUDE.md` is explicit that a provider is live only once it is configured.

**Where the platform key goes.** There is no platform administration screen
to set it on — the platform boundary is API routes only — so it is the
`WONDERHOME_AI_KEY` environment variable, and the Settings screen tells an
operator exactly that rather than pointing at a page that does not exist.
`WONDERHOME_AI_PROVIDER` optionally selects `google` or `openai`; it defaults
to `anthropic`, which CLAUDE.md names as primary.

**Storing a household's key is a deliberate exception**, and the migration
says so at length. The connector framework holds that a table which *can*
hold a provider token eventually does, which is why
`integrations.credential_ref` names where a secret lives rather than holding
one. Bring-your-own-key cannot work that way. So the key is stored and the
exception is paid for: the table has **no SELECT policy at all**, so nothing
reachable from a browser can read a key back — including the household that
set it. The server reads it with the service role, which never reaches a
browser. Whether a key exists is answered by a function that returns the
provider and a timestamp and never the value.

## Verified

- Typecheck, lint, 722 unit tests (13 new for the resolver), production
  build, full E2E suite 188 passed.
- `verify:live` 63/63 against the real project, including a new check that
  nobody can read a household's model key.

## A correction worth recording

That new check failed on its first run, and the check was wrong rather than
the schema. Postgres row level security with no SELECT policy answers by
returning **zero rows**, not by raising — so asserting "this errors" was
asserting the weaker property. It now asserts no rows came back, which is
the security property that actually holds.

## Still open

- No model SDK is installed and no live call is made yet. The key resolves
  and is stored; the `understand` seam in the conversation engine is still
  deterministic. Wiring the provider call is the next step and is the point
  at which "live" becomes true.
- The better future for BYOK is still `credential_ref` pointing at a secret
  manager. When that exists, this table becomes a pointer and the exception
  ends.

## Where

`packages/core/src/ai/model-key.ts`, `credentials.ts`,
`supabase/migrations/20260919090000_household_ai_credentials.sql`,
`apps/web/app/(auth)/ai-key-actions.ts`,
`apps/web/app/_components/ai-key-form.tsx`, `apps/web/app/settings/page.tsx`,
`scripts/verify-live-project.mjs`.
