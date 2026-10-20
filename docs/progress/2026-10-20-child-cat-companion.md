# A cat companion for the child, and clear ways to earn stars (08-018)

**Date:** 2026-10-20

**Asked by:** the owner: "for the child page, add a cat as companion, cat can come up with new notifications, messages, quotes, ideas, child can give name to the cat. on child page, Tell then clearly the list of activities which can bring them stars"

## What was done
- **The cat.** A ginger cat sits under the game card on the child's Home.
  - Drawing: `CompanionCat` lives in the kit as `ui/companion-cat.tsx`, coloured from the `--wh-cat-*` tokens. Its tail sways and it blinks, and both stop when motion is reduced. The drawing is decorative only.
  - What it says comes from `school/companion.ts`, a pure module. Messages are worked out from the child's own records on each visit and never stored. They come in this order:
    - something new under the child's own bell, using the newest unread title in their language;
    - missions left today;
    - a streak to keep, or praise for one of three days or more;
    - a goal one tick from done;
    - stars to the next level (5 or fewer);
    - the next fun plan on the calendar;
    - a saying and an idea of the day, 12 of each, chosen by the date so they change daily.
  - Controls: "Show me" opens the screen a message is about, and "Tell me another" moves to the next message.
- **The name.** The cat asks for a name first. The pencil renames it, and it has an accessible label.
  - Storage: `child_companions`, migration `20261020180000`, applied live.
  - Access: only the child writes it. The child, their guardians and Admins can read it. Policies use the set forms.
- **Ways to earn stars.** Shown on the Today and Goals tabs. It follows the same rules `childProgress` counts by, so the list matches the stars the child actually gets:
  - each of the child's own goals with its stars (per day, per week, or once);
  - one star for each piece of school work marked done;
  - a level every 20 stars;
  - the streak.

  With no goals yet, it says to ask a grown-up to set one.
- **Words and documentation.** The `kids.cat.*` and `kids.earn.*` words are in all eight languages. Help ¶10 under School is written, and `design/DESIGN-NOTES.md` has a note for the new component.

## Verified
- `companion.test.ts` passes 4/4.
- `scripts/test-child-companions-rls.mjs` passes 4/4:
  - the child names and renames the cat;
  - a guardian reads the name but cannot change it;
  - another adult and another household see nothing;
  - an adult cannot create one for themselves or for the child.
- Typecheck, unit tests and the production build pass.
- Browser check as the QA child at 360px and 1280px:
  - the cat asked for a name and took "Mishti", then was renamed "Biscuit";
  - "Tell me another" moved through today's picnic, a saying and an idea;
  - Ways to earn stars listed "Read for 20 minutes" (+2) and school work (+1);
  - no horizontal scroll and no page errors.

## Open
- The cat doesn't speak aloud; HomeTalk is still the one door for talking.
- New sayings and ideas need new catalog keys, plus a change to the `QUOTES` and `IDEAS` counts.
