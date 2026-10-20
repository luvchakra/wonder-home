# The cart, and a child's goals in a brighter WonderHome — 2026-10-20

## What was done

**The cart (backlog 25-021).** Go to cart (with the to-buy count) sits beside Add item on Groceries and opens `/groceries/cart`: every to-buy line with its picture and amount, a price worked out only from the household's own last receipt with a cost (`commerce/cart.ts`), a total over the priced lines saying how many are priced, and a Swiggy Instamart card. Swiggy has no public ordering API, so `commerce/instamart.ts` stays inert until a partner key and an https API URL are configured; each line opens Instamart's own search. Receipt lines now keep their unit (`recordPurchase`), so later prices convert.

**A child's goals and game (backlog 08-017).**
- Kids & School gets a Goals tab. A guardian or an Admin sets, changes and retires goals with a child: the goal, its kind, a picture, how often it counts, the stars each time, and an optional reward and end date. The tab also says where Fun comes from: the family calendar, with a link to it.
- New tables `child_goals` and `child_goal_checkins` (migration `20261020150000_child_goals.sql`, applied live) and an RLS test, `scripts/test-child-goals-rls.mjs`.
- The child's Home opens with a game card showing their level, stars and streak, and where the stars came from. Its tabs are now Today, School (renamed from Homework), Goals and Fun.
  - Today shows the day's missions, what is on the family calendar today, and the next fun thing.
  - "I did it!" ticks off a goal or marks school work done; a second tap takes it back (`reopenSchoolItem`).
- Stars, levels, streaks and badges are counted from records on every read, never stored (`school/goals.ts`, tested).
- Every screen a child opens carries `data-audience="child"`: a brighter page, rounder cards, and a star count beside the bell (riding on the avatar on a phone). Nothing changes for adults.
- A `SegmentedControl` now scrolls its current tab into view on a phone.

## Verified
- Gates passed: typecheck (web, core), ESLint on the changed files, and the related unit tests (375).
- The DB tests ran on a local Postgres: the child goals tests (8) and the setup counts tests, including the per-row helper check.
- These also passed: the migration, embed, help-link, boundary and secret lints; the production build; `check:bundle`; and `tracker --check`.
- The browser was driven at 360px and at desktop width, with a parent and a child QA account on the live project:
  - adding a goal;
  - the child ticking it off (stars 0 → 2, a 1-day streak, the reward line);
  - marking school work done;
  - the Fun, School and Calendar screens in the child's look;
  - the cart's totals: ₹120.50/kg × 2 kg = ₹241.00, and ₹56/l × 1.5 l = ₹84.00, with Eggs left unpriced.
- No screen scrolled sideways.

## Open
- Instamart ordering waits on a Swiggy partner agreement, which is a person's call.
- HomeTalk does not yet read or tick off goals ("what are my goals?"). That is a follow-up.

## Cleanup
QA accounts, household and rows deleted after merge; see the PR.
