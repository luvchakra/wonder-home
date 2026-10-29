# Header back arrow goes Home (2026-10-29)

Owner: "if user clicks on back button, it should take user to home page" (Responsibilities).

## What was found
The arrow was already a real `<Link>` (`mobile-header.tsx`), not history. Each page passed its own `back.href`, and every first-level screen passed `/more`, so the arrow landed on the More menu.

## What changed
- `packages/core/src/navigation/back-target.ts`: `backTarget({ pathname, explicit })`. `/more` as a named parent means Home; any other named parent (nested screen) is kept; with none named the parent path segment is used; unknown or unsafe input gives `/`.
- `AppShell` runs `back.href` through it, so no page needed editing. Aria-label and the `<Link>` are unchanged.
- Tests: `back-target.test.ts` (first-level to `/`, nested to parent, unknown to `/`).

## Screen to target
| Screen | Before | Now |
|---|---|---|
| Responsibilities, Kids & School, Chat, Househelper, Groceries, Meals, Bills, Health, HomeSend, HomePlaces, Certification, Home & Upkeep, Settings, Profile, Help, About | `/more` | `/` |
| Notifications | `/` | `/` |
| Settings sub-pages (AI, voice, plan, connections, notifications, privacy, location, language-region) | `/settings` | `/settings` |
| Plan confirmed / billing / checkout; invoice | `/settings/plan`; `/settings/plan/billing` | unchanged |
| Chat thread | `/chat` | `/chat` |
| Recipes (library, mine) | `/meals?tab=recipes` | unchanged |
| Grocery order | `/groceries?view=to-buy` | unchanged |
| Home, Calendar, Family, More, HomeTalk | no arrow | no arrow |

Onboarding screens use their own `back` (step links), outside AppShell; unchanged.

## Verified
core typecheck, `npm run build -w apps/web`, `check:bundle`, vitest on navigation and shell (42 pass). ESLint through the app config ignores files outside `apps/web`, so changed files were not linted here (CI lints them). Not checked in a browser at 360 px: no signed-in test account in this container.

## Open
Responsibilities opened on one outcome (`?outcome=`) is the same page, so its arrow goes Home, not to the unfiltered list.

## Needed from you
Nothing.
