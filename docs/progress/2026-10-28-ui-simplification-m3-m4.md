# UI simplification, part 2: people on Family, Today in the Calendar (00-014)

**Date:** 2026-10-28 · **Design:** `design/UI-SIMPLIFICATION-v1.md` M3 and M4

## What was done
- **People (M3):** Family is now the one place a person is managed.
  - Each person opens to their role control and **Remove**.
  - **Relationships** sits below the people.
  - An Admin's **Add to the family** section at the foot of the page holds invite, pending invitations, and add a child, helper or pet.
  - Every Invite and Add pill on the page leads there.
  - `/household/members` redirects to `/family`; server actions revalidate `/family`; setup steps and HomeTalk's place list point to Family.
- **Calendar (M4):**
  - **Today's plan** (My day / Family / Household) sits under today in the Calendar's Day view. Its lens is `?lens=`.
  - `/today` redirects with its lens, and every Today link goes to `/calendar?view=day`.
  - Event pages moved to `/calendar/events/[id]`; `/family/events/*` redirects (308).
  - Family shows the next three events with "See all in Calendar" instead of a second planning form.
  - The Today empty state no longer has its own Plan something; the Calendar's button does that job.
- **School's Calendar tab stays.** It is where school events are edited and school messages are read. This was decided while building and is recorded in the design.
- **Help:** "Home and Today" and "Members, roles…" are rewritten in all eight languages to say where things now live.

## Verified
- Typecheck and lint pass.
- 106 unit test files (1660 tests) pass: navigation, conversation, HomeBrain validate and evaluations, i18n, help, household, identity, chat, calendar, security and the web `_lib`.
- The production build passes.
- Browser check on a QA household on the live project, at 360 px and 1280 px, with no overflow:
  - Family shows Add to the family with its five forms.
  - The Day view shows Today's plan, including its Household lens.
  - `/today` and `/today?view=household` land on the Day view with the right lens.
  - `/household/members` and `/family/events/*` return 308.

## Open
- 00-015 (Connections) and 00-016 (Settings tabs, one setup wizard).
