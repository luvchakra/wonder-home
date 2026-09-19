# The playbook entry form, down to two fields

**Date:** 2026-09-19
**Scope:** `packages/core/src/household/configuration.ts`, `apps/web/app/(auth)/configuration-actions.ts`, `apps/web/app/_components/config-forms.tsx`
**Status:** Done

## What this is

Direct user feedback on the setup wizard's "How the home should run" step
(`/household/setup?step=playbook`), from a screenshot of the form as
rendered on a phone: seven fields — Name, Key, What good looks like,
From (hour), To (hour), Escalate after (hours), plus a dependency picker
once other outcomes exist — before a household could save one outcome.
"This looks too complicated to fill, simplify it, minimum fields to fill
in."

Design principle 10 in `CLAUDE.md` already sets the bar this was failing:
mobile-first and real, and principle 7 asks for a human sentence, not a
form dumped on the page. Story 02-001's own contract for this step
("describe the state you want rather than the steps to get there") only
ever needed two things from a household: what to call it, and what good
looks like. Everything else was already optional in the server-side
validation (`playbookSchema`'s `startHour`/`endHour`/`escalateAfterHours`
were `.optional()`) — the form just showed all of it, always, with no
signal to a household that five of the seven fields were skippable.

## What was built

**The "Key" field is gone entirely.** It asked a household to name the
same outcome twice — once in their own words ("Laundry ready"), once in
the planner's dotted-lowercase format ("laundry.ready") — for a value nobody
setting up a household actually has an opinion about; it only exists so the
planner has a stable reference. `slugifyOutcomeKey` (new, pure, in
`packages/core/src/household/configuration.ts`) derives it from the Name
field instead: "Laundry ready" becomes "laundry.ready" the same way a
household would have typed it by hand. It always produces something
`validatePlaybookItem`'s own regex (`^[a-z][a-z0-9_.]{1,60}$`) accepts,
whatever the input — a name with no letters at all gets an `outcome.`
prefix, a result too short on its own gets `.outcome` appended — so the
one caller (`savePlaybookAction`) never has to re-validate what it derived.
Saving the same name twice derives the same key both times, so retyping a
name is how a household updates an existing entry, the same way retyping
the exact original key would have done before.

**Everything genuinely optional moved behind a single disclosure.** The
hour window, the escalation timeout, and the "what has to happen first"
dependency picker are now inside one collapsed `<details>` labelled "More
detail, if it matters here (optional)" — the same raw `<details>` element
`TeachForm` already uses for "What you can say" a few steps over in this
same wizard, not a new kit component. Nothing about what they save changed;
they are exactly as optional as they always were, just no longer presented
as if a household had to decide about all seven fields before saving
anything.

**What is left visible by default: two fields.** Name, and What good looks
like. Both were already required; nothing about validation changed for
either.

## What was verified

- `npm run typecheck`, `lint`, `lint:boundaries`, `lint:secrets` — clean
- `npm run test` — 1036 unit tests passing (was 1031; +5 for
  `slugifyOutcomeKey`: a plain name, punctuation collapsing to single dots,
  every result matching the planner's own key regex across edge cases
  (digits-only, a single letter, all-whitespace, no-letters-at-all), two
  different names producing two different keys, and the same name producing
  the same key twice)
- `npm run security` — 9/9 P0 areas passing (unaffected; nothing here
  touches authorization)
- `npm run build` — succeeds
- `npx playwright test --project=desktop` — 126/126 unaffected (no E2E
  test asserted on the removed "Key" field or the now-collapsed fields)

## What is explicitly still open

Nothing new. This did not touch the "teach it in a sentence" path
(`TeachForm`/`proposeConfiguration`), which was already the simplest way
into the same configuration and is unaffected — this note only closes the
gap on the structured form for a household that would rather fill in
fields than write a sentence.

## Where

`packages/core/src/household/configuration.ts` (`slugifyOutcomeKey`,
new), `configuration.test.ts`,
`apps/web/app/(auth)/configuration-actions.ts` (`savePlaybookAction`),
`apps/web/app/_components/config-forms.tsx` (`PlaybookForm`).
