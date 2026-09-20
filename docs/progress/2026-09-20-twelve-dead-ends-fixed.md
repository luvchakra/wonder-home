# Twelve dead ends, fixed — where a screen said something it could not do

**Date:** 2026-09-20
**Scope:** Certification, Family, Househelper, Manage household (playbook and
policies), Integrations, Members & roles, Notifications, Landing.

## Why

A research pass across the app (the previous note, the UX clarity pass, had
already made the copy honest) listed twelve places where a screen still
*offered* something it could not deliver: a pill that linked back to the page
it was on, a badge that named a state nothing could change, a button that
gave no sign it had been pressed, a "correction" that quietly deleted the
belief instead of correcting it. Each is a small thing; together they are the
difference between an app someone trusts and one they stop tapping in. The
instruction was to fix all of them, one by one.

## What changed

1. **Certification — "Correct" now corrects.** Retiring the old belief and
   saying "Correction saved" used to be the whole action: the item went to
   `corrected` and nothing replaced it, so what the person typed was lost.
   Now the old row keeps its original claim (only status and review stamps
   change) and a new `certification_items` row is inserted with the same
   category, scope, member and risk level, the correction as its claim,
   `source_type: "conversation"`, `source_detail: corrected by <name>`, and
   status `confirmed`. The notice reads back the new belief and says where
   to find it. History stays, and what WonderHome believes is now what the
   person said. — `apps/web/app/(auth)/certification-actions.ts`

2. **Certification — an empty correction is refused.** The schema refines
   `decision === "corrected"` to require text, and the input is `required`,
   so "Correct" with a blank box no longer retires a belief for nothing.

3. **Family — the "needs" rows have real actions.** "Reply", "Gift",
   "Prepare", "Plan" linked to `/family` — the page they were on. There was
   no RSVP or gift feature behind them. Now each row uses `ActionRow` with
   `FamilyNeedAction`, which settles the event's `action_state`
   (`needs_rsvp` → "Replied", `needs_gift` → "Gift sorted", and so on),
   advances a gift through its steps (needed → chosen → ordered → wrapped →
   given), or resolves a schedule conflict ("Sorted" / "Fine as is"). New
   repository functions `settleEventAction`, `advanceGift`,
   `resolveConflict` sit beside the existing family repository; the server
   actions revalidate Family, Today and Home. RLS is unchanged: events are
   updated by their owner or an admin, gifts and conflicts by any member. —
   `packages/core/src/family/repository.ts`,
   `apps/web/app/(auth)/family-actions.ts`,
   `apps/web/app/_components/family-need-action.tsx`,
   `apps/web/app/family/page.tsx`

4. **Househelper — the weekly pattern and profile can be set.**
   `member_availability` and `helper_profiles` had no create or edit path
   anywhere in the app. New `helpers-repository.ts` (`saveHelperProfile`,
   `replaceAvailabilityPattern`, `recordAvailabilityException`), new
   `helper-actions.ts`, and new sheet forms (`WeeklyPatternButton` with
   day checkboxes and HH:MM times, `HelperProfileButton` for admins). The
   pattern form validates at least one day and start before end. The
   helper may edit their own pattern; admins may edit anyone's, as the RLS
   already allowed. — `packages/core/src/household/helpers-repository.ts`,
   `apps/web/app/(auth)/helper-actions.ts`,
   `apps/web/app/_components/helper-forms.tsx`,
   `apps/web/app/househelper/page.tsx`

5. **Househelper — "Record leave" completes.** The AI link for recording
   leave opened a chat that could never execute the intent: the
   conversation route does not yet supply an executable for it. Rather
   than build an intent executor into the conversation engine for one
   case (a deeper feature, out of scope here), a manual `RecordLeaveButton`
   records an `availability_exceptions` row (away or extra), and the empty
   state says plainly that leave is recorded here. The AI link stays beside
   it for the day the route can act on it. **Decision:** the executor is
   still open; see "Still open".

6. **Playbook items and policies can be edited and paused.** Both could
   only be appended from the setup wizard, and the "paused" badge on a
   playbook item had no toggle anywhere. New `PlaybookRowControls` (Edit
   sheet + Pause/Resume) and `PolicyRowControls` (Edit sheet + "Stand
   down"). Editing a playbook item keeps its `outcome_key` (hidden field;
   `playbookSchema` accepts an optional key so the planner's name for it is
   stable). A policy is never edited in place: the sheet saves the next
   version through the existing `savePolicy`, and "Stand down" retires the
   active one via new `retirePolicy`. Both audit with the existing
   `playbook.updated` / `policy.updated` event types. —
   `packages/core/src/household/configuration-repository.ts`,
   `apps/web/app/(auth)/configuration-actions.ts`,
   `apps/web/app/_components/config-forms.tsx`,
   `apps/web/app/_components/playbook-controls.tsx`,
   `apps/web/app/household/page.tsx`

7. **Househelper — "Needs backup" has an action.** The row now offers "Add
   backup", which goes to Responsibilities where backups are set.

8. **Integrations — "Needs reconnecting" says what it means.** Reconnecting
   is the provider's own connect flow, which is not live, and the row now
   says so rather than showing an attention badge with nothing to press.
   "See provider" jumps to the provider card. No "Reconnect" button was
   added, because there is nothing live behind one.

9. **Pending state on every commit button.** New `SubmitPill` and
   `SubmitButton` (`useFormStatus`) with a pending label. Used by
   "Make/Remove admin", invitation "Revoke", and notifications "Done"/"Got
   it". A press now visibly does something before the page revalidates. —
   `apps/web/app/_components/submit-pill.tsx`

10. **Landing copy no longer overclaims.** "Real screens, not pictures of
    them" is now "Drawn with the app's own components, with an illustrative
    family in them." The device frames are the real components with
    fixture data, and that is what the sentence says.

11. **Certification — a persistent way to add a belief.** Once items
    existed there was no entry point to tell WonderHome something new. The
    header now carries "Tell WonderHome something" (to the assistant with a
    seeded example) whenever the viewer may review.

12. **`CertificationAlert.action` is rendered.** The field existed on the
    domain type and was never shown. `CertificationItem` takes an optional
    `badgeLabel`, and the page maps `fix` / `confirm` / `review` / `set_up`
    to "Needs fixing" / "Confirm this" / "Needs review" / "Set this up".

## Verified

`PGHOST=localhost … npm run verify` — typecheck, lint, migration lint,
embed lint, import boundaries, secrets lint, tracker check, brand check,
security tests, unit tests, DB tests, build, and 252 Playwright e2e tests:
all passing. No migration was needed; every write goes through tables and
RLS policies that already existed.

## Still open / needs a person

- **The conversation engine cannot yet act on "record leave" (and other
  household intents).** The chat can understand it but not execute it. An
  intent-to-action executor in the conversation route is the real fix and
  a story of its own.
- A "Reconnect" flow for integrations waits on the first live provider.
- The family "needs" actions record that a thing was handled; they do not
  send an RSVP or buy a gift. That is by design until commerce and
  messaging providers are live.

## Where the code lives

See the file references under each item. New files:
`apps/web/app/(auth)/helper-actions.ts`,
`apps/web/app/_components/{family-need-action,helper-forms,playbook-controls,submit-pill}.tsx`,
`packages/core/src/household/helpers-repository.ts`.
