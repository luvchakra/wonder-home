# The audit trail, and the nine things it was not recording (story 15-006)

**Date:** 2026-09-19
**Module:** 15 — Privacy, Security & Governance
**Status:** Done

## What this found

The audit machinery has existed since story 18-006: an append-only
`audit_events` table with no INSERT policy, writes on the service-role client,
metadata redacted on the way in, and a nineteen-entry `AUDIT_EVENTS` enum.

Eleven of those nineteen events were never emitted by anything.

Roles granted and revoked, invitations created and cancelled, members joining,
accounts connected, the household's own AI key set or removed — none of them
left a trace. The enum named them, which made the trail look complete to anyone
reading the code, and an administrator opening a trail that silently omits half
of what happened concludes that nothing happened. A gap in a record people trust
reads as evidence of absence, which is worse than no record at all.

## What was built

**A catalogue with teeth.** `packages/core/src/security/sensitive-actions.ts`
declares every sensitive action, why it is sensitive, and the file that records
it. `sensitive-actions.test.ts` opens that file and checks the event is actually
written there. A declared action with no emitter fails the build. Adding an
event to the enum without wiring it up is no longer something that can be done
quietly — which is the whole point, because that is exactly how the eleven
accumulated.

Writing the test first was the useful part: it went red on nine of them
immediately and named each one.

**The nine gaps, closed** — at the site where each change actually happens:

| Action | Now recorded in |
|---|---|
| `member.role_granted` / `member.role_revoked` | `identity/households.ts` |
| `invitation.created` / `invitation.revoked` | `identity/invitations.ts` |
| `member.added` | `identity/invitations.ts`, on acceptance |
| `integration.connected` | `integrations/repository.ts` |
| `ai.key_set` / `ai.key_removed` | `ai/credentials.ts` |

Two remaining events moved to `NOT_YET_BUILT`, each tied to the story that will
build the action: `integration.disconnected` (nothing disconnects an account
yet), alongside household update, member removal, child edit, and the export and
deletion requests that are 15-007's. The test asserts every enum entry is in one
list or the other, so an event can be neither recorded nor explained only by
someone editing the catalogue to say so.

**One helper instead of four copies.** `auditChange()` in `api/audit.ts` uses
the service-role client (a member must not be able to forge or suppress their
own trail) and swallows its own failure (a change that completed must not be
reported as an error because the note about it did not save — a caller retrying
on that would make the real change twice). Both were already true in
`configuration-repository.ts`; now they are true in one place.

**A trail the household can read.** `/household/activity`, for administrators,
phrasing each entry as a sentence about people: "Who looks after something
changed · laundry.ready", "What the assistant may share changed · Version 2".
A policy change in the `privacy` category is named on sight, because it is the
household's answer to what may leave the house.

The page closes by saying what is *not* in the trail — nothing anybody said,
wrote or asked, and no keys or tokens, stripped before a record is written
rather than hidden afterwards. A record is only trustworthy if its limits are
stated.

## A detail worth keeping

`revokeInvitation` resolves the revoker from the signed-in session rather than
taking it as an argument. A caller that could name the actor is a caller that
could name somebody else.

## Where the code lives

| Piece | Path |
|---|---|
| The catalogue and the household's phrasing | `packages/core/src/security/sensitive-actions.ts` |
| The coverage test | `packages/core/src/security/sensitive-actions.test.ts` |
| `auditChange`, `listAuditEvents` | `packages/core/src/api/audit.ts` |
| The trail | `apps/web/app/household/activity/page.tsx` |

No migration: `audit_events` and its RLS came with 18-006, and reading it was
already restricted to administrators.

## What was verified

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run lint:secrets` — passed, 423 files
- `npm run test` — 854 passing across 63 files; 26 new in
  `sensitive-actions.test.ts`
- `npm run build` — succeeded, `/household/activity` present
- `npx playwright test` — 202 passing, with `/household/activity` added to the
  gated-areas sweep

## Still open

- **`NOT_YET_BUILT` has six entries.** Each names the story that will empty it.
  15-007 takes two of them.
- **Retention is undefined.** Audit rows accumulate with no policy for how long
  they are kept, which is a Privacy Centre question (15-007) rather than a
  trail one.
- **The trail has no filter or paging.** It shows the most recent hundred. That
  is right for a household and wrong for an investigation; whoever needs the
  second case should add a date range rather than raising the limit.
