# Configure by conversation (story 02-006)

**Date:** 2026-09-19
**Module:** 02 — Household Configuration & Playbook
**Status:** Done

## What was done

The Head of Family or an administrator can now configure the household in a
sentence. "Priya handles the school run from now on" writes the same
responsibility row the form writes. "Never spend more than ₹2,000 without
asking me" becomes a versioned spending policy. "No notifications between 9pm
and 7am" becomes quiet hours.

It lives as a sixth step in the setup wizard — **Just tell me** — beside the
forms rather than instead of them. Anything the sentence can reach, a form can
reach too.

The story had been sitting at `Blocked | Needs the conversation engine
(module 04)`. Module 04 finished a while ago; the block was stale.

## The three rules it is built on

**Understanding is deterministic.** No language-model provider is configured
with credentials, and `CLAUDE.md` is explicit that a provider counts as live
only once it is. So `readConfigurationSentence` is a small named grammar — six
advertised sentence shapes and a fixed vocabulary of outcome phrases — and it
returns `unknown` for everything else. `UNDERSTOOD_SHAPES` is the honest list
of what it knows, and the screen shows it, because a person told what they can
say gets it right where a person left to guess types something reasonable and
is told "I did not follow that", which reads as the product being broken.

**Understanding is never permission.** The grammar produces a *proposal*.
Whether the person may make the change is `requireHouseholdAdmin` on the
server; whether the change holds together is the same
`validateResponsibility` the forms use. So "Aarav is responsible for the
bills" is refused for a child exactly as it is in the form, and a sentence
cannot reach a write a form could not.

**Nothing is applied without being shown first.** The preview step writes
nothing. The apply step takes the *sentence* back, not the change — re-deriving
it on the server is what stops a crafted form post writing a responsibility
nobody said out loud. It also carries the summary the person actually read: if
the household moved underneath the preview and the sentence now means
something different, the new reading is shown instead of being applied.

## Details worth keeping

- A handover keeps the previous owner as backup. Somebody who used to do it is
  the obvious person to cover, and a handover that silently drops them is how a
  household ends up with nobody to ask.
- A handover does not reset autonomy. Who does it and how far WonderHome may go
  are two different decisions.
- Autonomy is read most-restrictive-first. "Never do the shopping without
  asking me" contains both "never" and "asking"; reading it as anything but a
  restriction would be the worst mistake available here.
- Two people whose names start the same way produce a question, not a coin
  toss with somebody's responsibilities.
- An hour range that starts and ends at the same hour is refused, because the
  form refuses it and a sentence must not be a way around a rule.

## Where the code lives

| Piece | Path |
|---|---|
| Grammar, proposals, fixtures | `packages/core/src/household/configuration-intent.ts` |
| `applyConfigurationChange`, `policyVersions` | `packages/core/src/household/configuration-repository.ts` |
| Preview and apply actions | `apps/web/app/(auth)/configuration-actions.ts` |
| `TeachForm` | `apps/web/app/_components/config-forms.tsx` |
| The step | `apps/web/app/household/setup/page.tsx` (`?step=teach`) |

No migration. Every write lands in the tables stories 02-002 through 02-005
created.

## What was verified

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run lint:secrets` — passed, 413 files
- `npm run test` — 801 passing across 61 files; 32 new in
  `configuration-intent.test.ts`, of which 13 are the fixture assertions the
  acceptance criterion asks for
- `npm run build` — succeeded
- `npx playwright test` — 202 passing

The fixtures assert the negatives as firmly as the positives. "Sort out the
house", "Priya handles it from now on" and "Somebody should do the laundry"
must stay unreadable: a grammar that quietly starts answering them has started
guessing, and when a real provider replaces the grammar these same sentences
are what will tell us whether it asks or invents.

## Still open

- **Story 02-007 (conflict detection)** is the last P0 in module 02 and is
  untouched. `canDependOn()` from 02-001 is the first piece; the rest is two
  responsibilities or two policies that contradict each other.
- The sentence path is **not wired into the assistant at `/ai`**. The
  conversation engine has its own intent vocabulary
  (`packages/core/src/conversation/intent.ts`) and its own proposal boundary;
  joining the two is a real design question — which of the two grammars owns a
  sentence like "Priya handles the school run" — and not something to decide
  in passing. The setup wizard is the deliberate first home for it.
- The grammar's vocabulary is fixed at eight outcome phrases. It should grow
  from the household's own playbook entries rather than a constant, which is
  work for whoever picks up the assistant integration.
