# UI simplification: one place for each job

**Status:** Proposed on 2026-10-28. Waiting for the owner's decisions in §8. No code has changed yet.
**Asked for:** "Simplify the UI. Similar functional aspects in one place, merge wherever possible. Make it simple."
**Rules applied:** `docs/design-principles.md` 6 (five areas), 13 (one door), 14 (no two buttons for the same job), 17 (group by decision), 21 (card opens to detail), 23 (every setting has one editor).

---

## 1. The problem in one paragraph

WonderHome has about 60 signed-in screens. Most of them are good on their own. The trouble is that **one job often lives in two to five places**:

- Notifications are set up on three pages.
- Connections (WhatsApp, voice assistants, school portals, Instamart) are spread over five pages.
- A family member can be edited on two pages.
- A new event can be started from four screens.
- Household setup has two different wizards.
- Settings has five ways in.

The More menu lists 15 domains in 5 groups, and Manage Household is a second menu inside it. A person has to remember *which* copy of a job to use. This design gives each job one home and turns every other mention into a read-only value with a link to that home.

## 2. Principles for this pass

1. **One home per job.** Every editor, form or toggle lives on exactly one page. Other pages show the value and link there (this extends rule 23 from settings to every entity).
2. **Merge by the reader's question, not by the database.** The test: would the person ever want these two pages open at the same time? If yes, they become one page with sections or tabs.
3. **Two layers, not three.** A domain is reached as primary tab → page, or More → page. No menus inside menus.
4. **"You" and "Household" side by side.** A personal setting and its household default show on the same page, in two sections. The Admin-only section is hidden from everyone else (route policy and server checks unchanged).
5. **Nothing breaks.** Every removed URL gets a permanent redirect, so old notification links, e-mails, bookmarks and help links keep working.

## 3. What stays the same

- The **five primary areas**: Home, Calendar, HomeTalk, Family, More (rule 6). Swipe, tab bar and sidebar are unchanged.
- **HomeTalk is the one door** (rule 13). `/home-send` stays the single named exception. `/chat` (people talking to people) stays, because it is a different job from talking to the assistant.
- **Domain pages** stay as they are: Groceries, Meals, Bills, Health, School, Home & Upkeep, Househelper, Places, HomeBrain.
- **Screen anatomy** stays: IconTile rows, expandable cards, the opening sentence and closing quote.

## 4. The merges

Each merge lists its one new home, what folds into it, and the old URLs that redirect.

### M1. Notifications: one inbox and one settings page

| Today | After |
|---|---|
| `/notifications` (inbox) | **Unchanged.** The bell is the way in; drop the duplicate row from More's Manage list. |
| `/settings/notifications` (your channels, quiet hours, smart reminders) | **One page: Settings → Notifications**, with three sections: |
| `/household/notifications` (household kinds, default timing, channels off, escalation, quiet hours; Admin) | · **For you**: channels, quiet hours, smart reminders |
| `/household/delivery` (is it reaching people; Admin) | · **For the household** (Admin only): kinds on/off, default timing, escalation, channels off · **Is it reaching people?** (Admin only): the delivery report as an expandable card |

Quiet hours are shown **once**, as "Household: 22:00–07:00 · You: 23:00–07:00". The household line is editable only by an Admin. This replaces two separate quiet-hours forms whose relationship nobody can see.

Redirects: `/household/notifications` → `/settings/notifications#household`, `/household/delivery` → `/settings/notifications#delivery`.

### M2. Connections: one page for everything WonderHome is linked to

Today the same idea, "WonderHome is linked to an outside thing", lives on `/household/connections`, `/household/integrations`, `/household/integrations/school`, `/settings/whatsapp` and `/settings/voice-assistants`. The connect step for Instamart is inside `/groceries/order`, and the `/settings` row "Connected accounts" points at integrations.

**After: Settings → Connections**, one page grouped by what the reader is linking (rule 17):

| Section | Folds in |
|---|---|
| **Needs you** (expired, failing) | the "Needs you" list from integrations |
| **Messaging**: WhatsApp (yours; every adult's for Admins) | `/settings/whatsapp`, the messaging row from integrations |
| **Voice assistants**: Alexa and others, who each speaks for, unlink | `/settings/voice-assistants` |
| **School**: portals, forward-a-circular address | `/household/integrations/school`, school-kind connections |
| **Calendar & e-mail** | calendar and email kinds |
| **Shopping**: Swiggy Instamart, connect/disconnect | the connect block on `/groceries/order` (ordering itself stays there) |
| **Weather, payments, smart home, devices** | the remaining integration kinds and devices |
| **Developer keys** (Admin) | developer keys |

Each row follows rule 4: IconTile, name, one line of status in words, one action (Connect, Fix, Test or Unlink).

Other screens show status and link here. HomeSend's channel card, School's "connect your portal" prompt and Groceries' "Connect Instamart" all open the matching section.

Redirects: `/household/connections`, `/household/integrations`, `/household/integrations/school`, `/settings/whatsapp`, `/settings/voice-assistants` → `/settings/connections#<section>`.

### M3. People: Family is the only place to manage a person

| Today | After |
|---|---|
| `/family`: member cards, role control, child quiet, location toggle, pets (editable) | **Family is the single people page.** Each member card expands (rule 21) to profile, role, quiet, location and remove. |
| `/household/members`: invite, pending invitations, add child / helper / pet, role control, remove | Its jobs move onto Family: one **Add** button in the header (adult, child, helper, pet: a picker, per rule 20). **Pending invitations** become a section on Family. Admin-only controls stay Admin-only. |

Two copies of the role control become one. The six links from Family to `/household/members` disappear.

Your **own** profile is still edited only in Settings (rule 23). An Admin edits someone else's in Family.

Redirect: `/household/members` → `/family`.

### M4. Calendar: one place to plan, one place for an event

| Today | After |
|---|---|
| `/today` (timeline: My day / Family / Household, "Needs a person", "Looking ahead") | Becomes the **Day view of Calendar**: Calendar → Day shows the plan with the same three lenses. The Calendar tab already highlights for `/today`; now there is only one screen behind it. |
| `NewEventForm` on Calendar, Family, Today and Home | **One "Plan something" sheet**, opened from Calendar's header and from Home. Family's and Today's copies go. Home keeps its own entry because it is the screen people start from. |
| `/family/events/[id]` (back link already goes to Calendar) | Moves to `/calendar/events/[id]`, so the URL matches where people come from. |
| School → Calendar tab | The tab becomes a link to "Open in Calendar", filtered to the child (`/calendar?who=<child>`). |
| Family → Upcoming events | A short list (next 3) with "See all in Calendar". |

Redirects: `/today` → `/calendar?view=day`, `/family/events/:id` → `/calendar/events/:id`.

### M5. Setup: one wizard

`/onboarding` (12 screens, first run) and `/household/setup` (6 steps: family, responsibilities, playbook, policies, connections, teach) set up the same things.

**After:**
- `/onboarding` is the **only** guided setup. It also handles resume, from the Home resume card.
- After setup, each step's page **is** its editor:
  - family → Family
  - responsibilities → Responsibilities
  - playbook, policies and autonomy → Settings → Household → How we run things
  - connections → Connections
- "Teach WonderHome" moves into HomeBrain → Review, which is already where corrections happen.

Redirect: `/household/setup?step=x` → the step's editor, or `/onboarding?step=x` while setup is unfinished.

### M6. Settings: "You" and "Household" in one place

Today Settings is personal and Manage Household (`/household`) is a second grouped menu, reached from More. After M1 to M5 have emptied Manage Household of notifications, members, connections and setup, what is left is small.

**After: Settings has two tabs.**

- **You** (everyone): profile, Language & Region, Notifications, Privacy, Location sharing, Assistant & voice, Connections, Your plan.
- **Household** (Admins only; the tab is hidden for everyone else):
  - Address. One editor; `/places` shows the home and links here.
  - How we run things: Playbook, Policies, AI autonomy.
  - Responsibilities (link).
  - Activity log.

Inside the **You** tab:
- **Assistant & voice** merges `/settings/ai`, `/settings/voice` and the voice key. The voice key lives **only** here; it is no longer on both pages.
- **AI data sharing** lives only in Privacy. The assistant page shows the value and links there.
- **Location sharing**: Family keeps the toggle only for a child, where a guardian sets it. For yourself, Family shows the value and links to Settings.

Redirects:
- `/household` → `/settings?tab=household`
- `/household/address` → `/settings?tab=household#address`
- `/household/activity` → `/settings?tab=household#activity`
- `/settings/voice` → `/settings/ai`

### M7. Fewer doors into the same page

| Destination | Doors today | After |
|---|---|---|
| Settings | More profile card, More Manage list, ViewerMenu, sidebar bottom, Manage Household | ViewerMenu + sidebar bottom (desktop) / More profile card (phone) |
| HomeBrain | More, ViewerMenu, Help page | More only. The ViewerMenu keeps profile, help and log out. |
| Notifications inbox | Bell, More Manage list | Bell only |

### M8. The More menu after the merges

Five groups and 15 items become three groups and 11 items, each item a real domain:

```
Family & People    Responsibilities · Kids & School · FamilyChat · Househelper
Home & Food        Groceries · Meals & Recipes · Bills & Finance · Home & Upkeep · Health & Fitness
Smart tools        HomeBrain · HomeSend · HomePlaces
──────────────
Settings (profile card at the top) · Help · About · Sign out
```

"Manage" disappears as a group. Notifications is behind the bell, and Manage Household and Settings are now one page.

## 5. Before and after, in numbers

| | Before | After |
|---|---|---|
| Pages that edit notification preferences | 2 (+1 report page) | 1 |
| Pages for connections / integrations | 5 | 1 |
| Pages where a member's role can change | 2 | 1 |
| Screens with a new-event form | 4 | 2 (Calendar, Home) |
| Setup wizards | 2 | 1 |
| Doors into Settings | 5 | 2 |
| More menu | 5 groups, 15 items, plus a sub-menu | 3 groups, 11 items, no sub-menu |
| Signed-in routes removed (redirected) | | 14: `/today`, `/household`, `/household/members`, `/household/address`, `/household/connections`, `/household/integrations`, `/household/integrations/school`, `/household/notifications`, `/household/delivery`, `/household/setup`, `/household/activity`, `/settings/whatsapp`, `/settings/voice-assistants`, `/settings/voice` |

Counts come from the route inventory taken on 2026-10-28 (`apps/web/app/**/page.tsx`, `packages/core/src/navigation/*`).

## 6. Delivery plan

These are separate PRs, ordered so each one is useful on its own and safe to ship. Every PR does the following:
- Adds its redirects to `next.config`.
- Updates `security/route-policy.ts` so each section keeps its old gate.
- Updates the help guide words in all eight languages.
- Updates the E2E specs that open the old URLs.
- Checks that notification sources with an `href` to an old route now point at the new one.

| PR | Merges | Size | Notes |
|---|---|---|---|
| 1 | M7 + M8 (doors and More menu) | S | Navigation config only; no pages move. |
| 2 | M1 Notifications | M | Server actions are reused; only the page composition changes. |
| 3 | M3 People | M | Moves invite / add / remove into Family; Admin gates are re-tested. |
| 4 | M4 Calendar | M | Today's lenses move into the Day view; event route moves. |
| 5 | M2 Connections | L | Largest; the Connections framework (2026-10-28) is the base. |
| 6 | M6 Settings tabs + Assistant & voice | M | Manage Household retires here. |
| 7 | M5 Setup | M | Retire `/household/setup` last, once every step has an editor. |

Each PR is checked with `node scripts/ui-check.mjs` at 360 px and desktop, plus the touched unit and E2E specs. The ones touching permissions (3, 6) also run their E2E specs locally before merge.

## 7. Risks and how they are handled

- **Old links in sent notifications and e-mails.** Permanent redirects, kept for at least a year.
- **A merged page reveals an Admin section to a non-Admin.** Each section is rendered only after the server check that guards it today; route-policy tests cover the new anchors.
- **Merged pages get long.** Sections are expandable cards (rule 21), most-needed first (rule 17). Settings → Connections opens with "Needs you" and collapses healthy sections.
- **Performance.** A merged page starts all its section reads in one `Promise.all` and keeps every list bounded (CLAUDE.md, Performance).
- **Rule 23 lists WhatsApp and Voice assistants as their own Settings rows.** M2 and M6 change that list; `docs/design-principles.md` is updated in the PR that ships them.

## 8. Decisions for the owner

| # | Decision | Recommended |
|---|---|---|
| D1 | One **Connections** page under Settings, absorbing WhatsApp, Voice assistants, school and integrations (M2) | Yes |
| D2 | Retire **Manage Household**; Settings gets **You / Household** tabs (M6) | Yes |
| D3 | Retire **Today** as its own screen; it becomes Calendar's Day view (M4) | Yes |
| D4 | Retire `/household/setup`; `/onboarding` is the only wizard (M5) | Yes |
| D5 | Remove HomeBrain from the profile menu (M7) | Yes |
| D6 | Order of the PRs in §6 | As listed |

Once these are answered, the stories go into the backlog and `tracking/PRIORITY-ITEMS-REPORT.md`.
