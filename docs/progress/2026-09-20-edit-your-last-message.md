# Edit the last thing you said to WonderHome

**Date:** 2026-09-20 · **Kind:** feature (user request), extends story 04-003 (contextual replies)

## What was done

Talk had no way to fix a typo or reword a question without sending a second
message that sat awkwardly next to the first. The household's own **last**
message — and only that one, and only while nothing has come of it yet —
now carries a small **Edit** pill under the bubble. Tapping it drops the
original text into the composer with a "Editing your message" banner above
it (with its own Cancel); sending replaces the old message and its reply
in place, rather than adding a third bubble.

**Client** (`apps/web/app/ai/assistant.tsx`): the edit affordance shows on
the most recent member message, found by walking the list from the end —
but not at all once the reply that followed it already carries an
**approved** or **executed** action, since that is a thing that happened,
not a draft still open to a rewrite. Sending while editing truncates the
local message list back to the edited message before appending the new
turn, the same truncation the server performs, so the screen never shows a
state the database disagrees with. A failed edit's "Try again" carries the
same `editMessageId` through the retry.

**Server** (`conversation/repository.ts`'s `beginEditMessage`,
`apps/web/app/api/v1/households/[householdId]/conversation/route.ts`): the
route accepts an optional `editMessageId` on the same `POST`. Before
anything else reads the session — the pending proposal, the recent turns
the model would see, the Household Brain's memory of the conversation —
the edited message is verified as the household's own, in this session,
and as the *literal last member message*: an edit against anything else is
refused, since the person has said something since and that later thing is
not the client's to discard. Whatever followed it (ordinarily one
assistant reply, and the proposal it may have recorded) is deleted along
with it. An action that already reached `approved` or `executed` refuses
the whole edit outright, with the same reasoning the client uses to hide
the button in the first place — the server is the one that actually
enforces it. The turn then proceeds exactly as a fresh message would: the
model, when one answers, never sees the question it is replacing.

No RLS change: `conversation_messages` and `conversation_actions` have
always been read-only from a member's own client, so the deletion —
like every other write in this route — goes through the admin client the
route already holds, with the household and session ownership check done
in application code first.

## Verified

- `packages/core` vitest — 84 files, 1,160 tests (`beginEditMessage` is a
  thin SupabaseClient-composing function, in this codebase's existing
  convention for such functions: verified by typecheck and build rather
  than a mocked network boundary, matching `recordMessage`,
  `createConsumable` and the rest of this same file).
- `npm run typecheck`, `npm run lint` — clean.
- `npm run test` — 43 pass. `npm run build` — clean. `npm run test:e2e` —
  252 pass, unchanged.
- Static 390px screenshot of the edit pill under the last member bubble
  and the editing banner above a pre-filled composer — right-aligned,
  legible, nothing clipped.
- OpenAPI description for the route updated to name `editMessageId`.

## Still open

- Editing is offered for the last message only, by design — earlier turns
  stay part of the record. A household that wants to correct something
  further back still has "actually, I meant…" as a fresh message, same as
  before this feature.
- No dedicated e2e exercises the edit flow end to end (it would need an
  authenticated session and a seeded conversation); covered today by
  typecheck, the unit suite around the pieces it composes, and the
  existing conversation-route e2e coverage that discovers the route
  automatically.
