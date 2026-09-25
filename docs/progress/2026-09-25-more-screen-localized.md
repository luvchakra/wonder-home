# More screen in each person's language (story 22-004, one screen)

## What was done

`/more` now reads every word of its own in the viewer's language:

- the section names, now passed the same way the nav drawer already did;
- each area's one line of purpose, as 13 `nav.purpose.*` keys applied in
  `requireSession`, so the drawer and any other screen that lists areas
  get them too;
- the viewer's role, as `role.admin`/`adult`/`child`/`househelper`, through
  `roleWords` in `_lib/session.ts`. The header's account menu, More and the
  Settings profile card all show it;
- Help, Get Help and its line, Sign out, and the closing line.

The domain names were already translated through `nav.item.*`.

## Verified

- Typecheck, lint and the unit suite (2903/2903, including catalog
  completeness and placeholders) pass.
- Browser QA on the real project as a Hindi-speaking Admin, at 360px and
  1280px:
  - every section name, purpose, the role ("एडमिन"), Help and Sign out read
    in Hindi;
  - two-up cards wrap the longer Hindi purposes onto a second line and cut
    nothing;
  - there was no horizontal overflow.

## Cleanup

This PR's merge closes the three slices of this session: HomeTalk (#180),
Today (#181) and More. The following are removed once it merges:

- QA user `e876f5eb-bac1-46aa-8b8f-3f57e86648c3`;
- household `e85b1af7-da7c-439c-8e2e-a72369ffb589`;
- the seeded bill and meal rows in that household.
