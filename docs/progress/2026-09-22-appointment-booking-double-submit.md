# Fix: appointment booking's "When" step could be skipped, and the wizard could double-submit

A real household reported "Too small: expected string to have >=1 characters"
on step 6 of "Book an appointment" (`/health`, story 21-002's booking
wizard). Investigated and found two distinct bugs in
`apps/web/app/_components/health-appointment-forms.tsx`.

## Bug 1: the "When" step could be skipped entirely

`Field label="Starts" name="startsAt" ... required={step === 2}` only
carried the `required` attribute while the wizard was actually showing step
2. Every other step's div is hidden via Tailwind's `.hidden`
(`display: none`), and an element with `display: none` is barred from
HTML5 constraint validation regardless of its `required` attribute — so
even the always-`required` version would never have blocked anything past
that step. The "Next" buttons are `type="button"`, so no native validation
ever ran on the way through, and the wizard let a household reach "Book
appointment" with an empty `startsAt`. The server action's Zod schema
(correctly) rejected it, but surfaced the raw Zod message
("Too small: expected string to have >=1 characters") instead of something
a household would recognise.

**Fix:** track `startsAt` in component state, disable "Next" while on the
"When" step until it has a value (and disable "Book appointment" too, as a
second line of defence), and show an inline "Choose when this starts."
hint under the field once a submission has been rejected. Also mapped the
schema's field-level errors to friendly copy in
`health-appointment-actions.ts` (`FRIENDLY_FIELD_ERROR`) so a real
validation failure on any other field never surfaces raw Zod internals to
a household again.

## Bug 2: found while reproducing bug 1 — a genuine duplicate-booking bug

Reproducing the block above with Playwright (network-level logging of the
`Next-Action` header identifying which server action a POST invokes) showed
the *same* `createAppointmentAction` invocation firing twice for a single
click on "Book appointment" — once right after the third "Next" click
(the one that moves the wizard from step 4 to step 5), and again from the
real submit click. Two identical `health_appointments` rows landed in the
database from one booking.

Root cause: the footer button was one JSX conditional reusing the same
`Button` component at the same tree position —
`{step < 5 ? <Button type="button" ...>Next</Button> : <Button
type="submit">Book appointment</Button>}` — with no `key`. React
reconciles same-position, same-component-type branches by mutating the
existing DOM node's attributes rather than unmounting and remounting it.
Clicking "Next" on step 4 runs `setStep(5)` synchronously inside the click
handler; React flushes the re-render before the browser's own "activation
behaviour" step for that click runs, so by the time the browser decides
what a `<button>` click's default action should be, the *same* DOM node's
`type` attribute has already flipped from `"button"` to `"submit"` —
triggering the form's real submission as a side effect of the click that
was only supposed to advance a step.

**Fix:** gave the two branches distinct `key`s (`"next"` / `"submit"`), so
React unmounts the old node and mounts a genuinely new one on that
transition instead of patching its `type` attribute in place. Verified via
the same Playwright network-log harness: exactly one `Next-Action` POST per
real submit click, both before and after filling in a date, across a
fresh dev server (to rule out HMR duplication as an alternative
explanation before settling on this root cause).

Grep across `apps/web/app/_components/*.tsx` found this is the only
multi-step wizard in the codebase using this button-swap pattern — no
other component needed the same fix.

## Verified

- Reproduced both bugs against a real dev server + live Supabase project
  with a QA household, confirmed each fix independently:
  - "Next" is disabled and stays disabled while `startsAt` is empty; typing
    a date re-enables it immediately.
  - Exactly one `health_appointments` row is created per real "Book
    appointment" click (checked directly via SQL against the live
    project), confirmed both for a click right after filling the date and
    for the full step-by-step wizard flow.
- Full `npm run verify` (typecheck, lint, unit, DB/RLS, build, 312 e2e) —
  green. (One `test:db` run flaked with a `database does not exist` error
  from a stray connection left by earlier manual debugging in this same
  session — confirmed as a flake, not a regression, by re-running `test:db`
  alone: 339/339.)
- No migration or API contract change — nothing to apply live or re-check
  against `verify:live`.

## What's still open

Nothing further for this fix. Worth keeping in mind for any *future*
multi-step wizard: always `key` a footer button whose `type` differs
across branches at the same tree position, since React's default
reconciliation will otherwise mutate the DOM node's `type` mid-click and
can trigger an unintended native form submission.
