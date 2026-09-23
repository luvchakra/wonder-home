# Add a child from a school notice (story 08-009 Done)

**Date:** 2026-09-24 · **Module:** 08 Kids & School Intelligence · **Story:** 08-009

## What was done

The test spec's live run found that a household with no child on record could
not confirm a school notice. The "For" picker offered only "No children on
this household yet".

Looking closer turned up a worse case. A household with **one** child
auto-assigned any school notice to that child, even when the notice named
someone else. A notice for Aarav went onto Anu's list. That is a guess, and
HomeSend's own rule is never to guess.

- **Resolution** (`packages/core/src/homesend/resolve.ts`).
  - On a school notice where no named person resolves, the first *untitled*
    name that matches nobody is taken as the child the notice is about. It
    is returned as `said` with `unknown: true`, and nothing is selected.
  - A title (Mr/Mrs/Ms/Dr/Principal/Teacher…) is never taken for the child.
  - With children on record, they are all candidates and the question reads
    "Aarav isn't one of your children on record — add them, or choose who
    this is for."
  - A name that resolves still wins over an unknown one beside it.
  - With no name at all, the existing behaviour is unchanged: the only child
    is used, and several children mean a question.
- **Review** (`home-send-intake.tsx`'s `SchoolChildField`). The "For" picker
  keeps the household's children and adds an option: "Add Aarav as a child"
  (or "Add a child"). This follows rule 20's inline add-new.
  - The option is preselected when the notice named someone new or the
    household has no children.
  - It opens a name field (prefilled with the name the notice used) and an
    optional date of birth, plus a line saying they join as a child with you
    as guardian.
  - Only Admins see it (`canAddChild`, passed from the HomeSend page and the
    HomeTalk sheet). Anyone else is told an Admin can add the child from
    Family.
- **Confirm** (`home-send-actions.ts`).
  - `childMemberId: "new"` runs `addChildFromNotice`: `requireHouseholdAdmin`
    and then `createChildMember` with the Admin as guardian, exactly the
    Family screen's rule.
  - The notice is then routed to the new child in the same step.
  - A non-Admin gets "Only an Admin can add a child", and nothing is written.
- **Golden case HS-15.** In household C, whose only child is Anu, a notice
  for Aarav must ask. Before this change it would have been assigned to Anu.

## Verified

- typecheck and lint are clean.
- Unit tests: 2523/2523, including 5 new resolver tests: no children, one
  child never assumed, teacher titles ignored, known names still resolve,
  and a known name wins over an unknown one.
- `npm run eval`: 47/47 with 0/14 unsafe, including the new HS-15.
- Browser QA with a real Gemini reading of a pasted notice:
  - **360px, household with no children.** The picker showed "Add Aarav as a
    child", preselected with "Aarav" filled in. Confirming created the child
    Aarav with the Admin as guardian, the Science project was due 26 Sep on
    his list, and the item was routed (checked by SQL).
  - **Desktop, a second notice for Riya.** The picker offered "Aarav" and
    "Add Riya as a child", preselected, with "Riya" filled in.
  - No horizontal overflow at either width.
- The first QA run found that the name was not prefilled with no children on
  record, so the required field blocked the submit. That led to the resolver
  change above.

## Open

- The non-Admin path is enforced on the server (`requireHouseholdAdmin`) and
  hidden in the UI, but it was not driven in a browser, which would need a
  second account.

## Test data cleanup

The same QA household served 20-006 and was removed after this PR merged.
The 20-006 note (`2026-09-24-billing-abstraction.md`) has the ids and the
counts, all 0.
