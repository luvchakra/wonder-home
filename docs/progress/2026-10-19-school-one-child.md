# Kids & School shows one child at a time; classes live only there

**Date:** 2026-10-19 · **Asked by:** the owner ("you can remove 'everyone' tab from here", with a screenshot of the child picker)

## What changed

- The "Everyone" chip is gone from the child picker on Kids & School (`apps/web/app/school/page.tsx`). With more than one child the page always shows one child: the one in `?child=`, else the first. Overview, Homework and Calendar keep the chosen child. A child id that is not this viewer's falls back to the first child rather than to everyone.
- **Classes outside school are no longer repeated in Family** (the owner: "you do not need to put classes section here, it's covered separately"). `MemberDetail` loses its `classes` prop and the `ChildClasses` block, and the Family page no longer reads `listActivities` (one query fewer per view). Kids & School keeps the full list, its sheets and the Calendar entries unchanged. Help ¶6 under Kids & School no longer says the classes also appear in Family, in all eight languages; the 2026-10-19 release note stays as written, since it was true of that release.
- The unused `school.everyone` word is removed from the eight school catalogs; Kids & School help ¶1 says how the picker works, in all eight languages.

## Verified

- Typecheck, `npm run lint`, i18n and help tests 106/106, `lint:help-links`.
- Browser on a QA household with two children, 360px and 1280px: no Everyone chip, the first child selected on arrival, tapping Manan shows only Manan and Homework keeps him; a child's details in Family open with no classes section while Kids & School still shows it; no horizontal scroll, no page errors.

## QA cleanup

Ran after #247 merged (2026-10-19): QA account `5c8335b0-7d10-4875-8ca3-d132e608796e` and household `d8034f59-b0ec-40db-961e-1b72a45ee5af` ("QA Kids Home", two children, and the Pro subscription row added so Kids & School would open) deleted. Confirmed by SQL: 0 households, members, subscriptions and auth users left for those ids; screenshots removed.
