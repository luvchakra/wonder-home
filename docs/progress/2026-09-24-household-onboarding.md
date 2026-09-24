# Intelligent household onboarding (story 02-009)

**What.** A new household now goes straight from "Create household" into a
twelve-screen guided setup at `/onboarding`, built to the onboarding sheet:

1. Welcome.
2. Family basics (counters).
3. Household overview.
4. Adults.
5. Children.
6. Pets & household help.
7. Suggested responsibilities.
8–9. Per-category review (Home, Kids, Groceries, Bills & Finance, Pets, Household Help).
10. Readiness summary.
11. Guided setup, one question at a time.
12. "Your home is ready!"

Any screen can be left with "I'll do this later". While setup is unfinished,
Home shows a resume row ("Household setup · Nearly there / Next: … /
Continue") that returns to the step the household left.

**Why.** The spec (`Intelligent_Household_Onboarding_Requirements.md`) asks
for a household to reach a working operating model in minutes without
designing anything from scratch. It also asks that nothing be duplicated, and
that nothing bypass authorization or governance.

## How it is built

**Orchestration only.** Onboarding owns two tables and nothing else:
- `household_onboarding` — draft counts, the step reached, status, and the
  suggestion keys dismissed.
- `onboarding_events` — closed-word, count-only analytics for all 15 spec
  events.

Every fact goes through the domain's own validated, audited write, under the
Admin's own RLS session:

| What setup records | Written by |
|---|---|
| A child | `createChildMember` |
| A helper | `createHelperMember` |
| An adult without a login | new `createAdultMember` |
| Member details | `updateMemberProfile` |
| A pet | `createPet` / `updatePet` |
| Helper days and hours | `replaceAvailabilityPattern` |
| A school | new `school/enrolments.ts` `saveEnrolment` |
| An accepted suggestion | `savePlaybookItem` + `saveResponsibility` |

**Template engine.** `household/onboarding.ts` is pure and deterministic.
- **Owners** are chosen from:
  - age bands (a child owns morning routine from 8, homework from 9, and so on);
  - the adults' stated work arrangement;
  - helper roles (a maid owns cleaning and laundry, a cook owns cooking, a driver owns the school run);
  - load balancing, where a backup counts as half.
- **What it never uses:** gender or relationship. Swapping "Mom" and "Dad" gives identical owners, which is unit-tested.
- **Adult-only outcomes** (`finance.*`, …) only ever go to adults.
- **Suggestions are never stored.** They are recomputed from real records each time, so one can never outlive its facts.
  - Keeping one writes a responsibility.
  - Unticking it records the key as dismissed, so it is not offered again.

**Readiness.** `onboardingSummary` is weighted arithmetic over real records, using configurable `ONBOARDING_WEIGHTS`.
- Each row is done-out-of-total, and a suggestion nobody kept never counts.
- It names one next action.

**Guided setup.** `guidedQuestions` only asks what is missing, most useful first:
1. Schools.
2. Helper hours.
3. Offers to accept a whole category.

Once answered, a question cannot exist any more. "Maybe later" sets it aside for that visit only. Anything else goes to HomeTalk through the same one door (`/ai?q=`).

**Idempotency.**
- People and pets are matched by name within their kind before anything is created.
- Responsibilities and playbook entries are upserts on the outcome key.
- A tab press saves before it moves.
- The review action re-derives suggestions server-side and only takes keep/owner choices from the form. A tampered title or key cannot become a responsibility.
- Owners are checked against the household's real members.

**New fields.**
- `household_members.work_arrangement`.
- A stated age (`age_years` + `age_recorded_on`) for a child whose birthday was not given; a real date of birth always wins, and the age grows with the calendar.
- `household_invitations.member_id`: `wh.accept_invitation` now links a new account to an adult named during setup, rather than adding the same person twice. It only does this for an unlinked, active member of the same household, so an invitation can never take over anyone. `inviteMemberAction` fills it when the name matches.

**HomeBrain.** The context builder now says "Anya is 6, goes to Greenwood High." and "Priya works from home". It also carries `school`, `ageYears` and `workArrangement` as attributes, so the school added in guided setup is grounded context straight away.

**Kit.** Two new components: `Stepper` (the counters) and `ChoiceChips` (work schedule, working days). Both are noted in `design/DESIGN-NOTES.md`.

## Verified

- **Unit tests:**
  - onboarding engine: 24 tests (plus 3 new custom-key assertions);
  - HomeBrain context: 2 new tests.
- **`npm run typecheck` and `npm run lint`:** clean.
- **Database suite `scripts/test-onboarding-rls.mjs`, 11 tests:**
  - an Admin moves setup, members only read it, and outsiders see nothing;
  - events are Admin-only, closed words, with small details;
  - a stated age is always dated;
  - an invitation claims the named unlinked adult and keeps what setup recorded;
  - an invitation never takes over a linked member, and never links another household's member.
- **Live migration:** `20260928090000_household_onboarding` applied through Supabase MCP. `npm run verify:live` passed 183/183, including 6 new checks.
- **Browser golden scenario** on the real project, at 360px and 1280px, with no horizontal overflow on any screen:
  1. Created a household.
  2. Entered 2 adults, 2 children, 1 pet and 1 helper.
  3. Named Kunal (Dad, office) and Priya (Mom, home), Aarav (10) and Anya (6), Mochi the cat, and Lata the maid (Mon–Fri, 9–1).
  4. Kept 27 suggestions, changed the grocery owner to Priya, and dropped school fees.
  5. The summary read 92%.
  6. "Complete setup later" led to Home, which showed the resume row, and Continue returned to the summary.
  7. Guided setup asked for both schools in one question. Saving them turned School to Ready.
  8. "Go to my home" completed setup.
- **Database after the scenario:**
  - 5 members with the right details;
  - the helper's working pattern: 5 windows;
  - 27 responsibilities;
  - `groceries.stocked` owned by Priya;
  - `finance.school_fees` dismissed;
  - all 15 event types recorded.

## Open / for a person

- **Suggestion templates** are a deterministic starting set (Home, Kids, Groceries, Finance, Pets, Help). New templates are additions to `suggestResponsibilities`, each with a test.
- **Existing households** can open `/onboarding` at any time, and it starts on their first press. Home only shows the resume row once setup has begun.
- **Invitation claiming** matches on the invited name. An Admin who invites someone under a different name gets a second member, as before.

## Where the code lives

- `packages/core/src/household/onboarding.ts`, `onboarding-repository.ts`, `onboarding.test.ts`
- `packages/core/src/school/enrolments.ts`
- `packages/core/src/identity/households.ts` (`createAdultMember`, `currentAge`, new fields)
- `packages/core/src/context/builders.ts`, `repository.ts`
- `packages/core/src/components/ui/stepper.tsx`, `choice-chips.tsx`
- `apps/web/app/onboarding/` (page, frame, screens)
- `apps/web/app/(auth)/onboarding-actions.ts`
- `apps/web/app/_components/onboarding-resume-card.tsx`
- `supabase/migrations/20260928090000_household_onboarding.sql`
- `scripts/test-onboarding-rls.mjs`
