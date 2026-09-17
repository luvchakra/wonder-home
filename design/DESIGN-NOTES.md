# WonderHome — Design notes

Working notes that sit alongside `UI-MOCKUP-IMPLEMENTATION-SPEC.md`. The spec is
the contract; this file records how we are reading it.

## The mockups are look and feel, not a feature list

`WonderHome-Approved-UI-Mockup-Reference.png` and
`WonderHome-Mockup-Sheet-B-Onboarding-and-Meals.png` guide the **visual
language** — surfaces, colour, spacing, card shapes, tone of voice, the general
feel of a family-oriented product rather than an enterprise console.

They do **not** define the menu or the feature set. Navigation, screens and
behaviour come from `UI-MOCKUP-IMPLEMENTATION-SPEC.md` and the module backlogs.
Where a mockup shows a control that no story calls for, the story wins; where a
story needs a surface the mockups never drew, design it in the same visual
language rather than forcing it into a screenshot.

## The two mockup sheets differ

Both are approved references and neither is complete on its own:

| | Sheet A (bundled reference) | Sheet B |
|---|---|---|
| Splash & onboarding | — | yes |
| Meals & cooking | — | yes |
| Responsibilities | yes | — |
| School | yes | — |
| Member profile (child) | child view | fuller profile |

`UI-MOCKUP-IMPLEMENTATION-SPEC.md`'s required-screen list matches Sheet A only.
Two consequences to keep in mind while building:

- **No onboarding surface is specified anywhere**, though stories 01-001 and
  01-002 need household creation and invitation acceptance. Sheet B's splash
  screen is the only visual reference for it.
- **Module 10 (Meals & Cooking) has eight stories and no screen in the spec.**
  Sheet B's Meals screen is the reference until the spec says otherwise.

## Where the tokens came from

`packages/core/src/ui-theme.css` derives from both sheets:

- warm near-white page background, white cards, soft shadow, ~1rem radii
- deep navy text, muted navy for secondary copy
- restrained teal primary for actions ("Pay", "Review", active nav)
- semantic states kept distinct from the primary: amber for attention, red for
  risk, green for handled, blue for informational updates

Tokens are defined once on `:root`, redefined for dark mode, and consumed
through Tailwind theme variables. A module never introduces its own palette.

## Interaction rules worth repeating

From the spec, these shape components rather than screens:

1. Never make a user tick off routine household work to keep WonderHome accurate.
2. A card either carries a real next action or stays out of the actionable queue.
3. Every action explains: what happened, why it matters, what WonderHome
   recommends, what you can do.
4. Pending-approval and already-executed AI changes must look different.
5. Personalized views are permission-filtered by the API, never hidden with CSS.
6. Empty states say what WonderHome can do next; error states offer a recovery.
