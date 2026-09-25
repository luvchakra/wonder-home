# Every signed-in screen in each person's language (story 22-004 slice)

**Date:** 2026-09-25 · **Story:** 22-004 (still In Progress — Help, the entry screens and the setup wizard follow)

## What was done

The rest of the signed-in app now reads its words from the catalog in all eight
languages (en, hi, mr, es, fr, de, ar, zh):

| Area | Screens and sheets | Keys (English) |
|---|---|---|
| Bills & Finance | `/bills`, bill / transaction / budget add-edit-remove, currency picker | 150 |
| Kids & School | `/school`, homework and event sheets, item detail | 88 |
| Health & Fitness | `/health` and all eight health sheets | 228 |
| Househelper, Home & Upkeep | `/househelper`, `/household/home`, helper, backup-service and upkeep sheets | 189 |
| HomeSend | `/home-send`, inbox, channels, intake, plan review, receipt, HomeTalk's paperclip sheet | 323 |
| Manage Household, HomeBrain Review, Home | `/household/*`, `/certification`, the rest of Home and the child's Home | 583 |
| Settings | `/settings` and every sub-page, including plan, checkout, confirmed, billing and invoices | 577 |

**How it is organised.** Each area has its own catalog fragment,
`packages/core/src/i18n/messages/areas/<area>/<lang>.ts`, typed with
`AreaCatalog<typeof <area>En>` so the compiler still refuses a missing key, and
spread into the top-level catalogs. That let seven areas be translated in
parallel without touching one shared file. Client components receive
server-built `labels` (built in plain `apps/web/app/_lib/*-labels.ts` files);
no client module calls the translator or exports a plain value.

**What changed beyond wording.**
- Plural fixes in English: "1 hours ago", "1 minutes", "1 engagement", "1 changes", "1 items", "1 responsibilities" and similar.
- Stored values (bill kinds, statuses, periods, health types, asset categories,
  integration status, scopes) are shown translated; what is saved is unchanged.
- Day initials come from each language's own short names (the old code cut
  English names to two letters).
- A few right-to-left fixes: logical `ms-`/`ps-` spacing and flipped chevrons
  where these screens had physical ones.
- The Settings landing page and the profile photo control were translated here
  too.

## What stays English, and why
- **Household data:** names, titles, notes, document content.
- **Sentences built in core and shared across screens:** agenda rows, Activity
  event titles (`describeAuditEvent`), device and weather sentences, plan
  feature and trial lines, server-action notices and errors. They are English
  on every screen today, and translating them is a separate, core-wide change.
- **Transaction kind options** on Bills: the option text is what is stored, so
  translating it would change data.
- **Static page titles** (`metadata.title`), and the plan catalogue's own
  descriptions (catalogue data).
- **Still to do in this story:** Help, sign-in/sign-up/reset/invite, the welcome
  page, the guided setup wizard and the voice-link consent screen. The legal page
  needs a person's review before it is translated.

## Verified
- `tsc` for core and web, eslint (web), import-boundary lint (936 files), core
  unit tests 202 files / 2944 tests, including catalog completeness and
  placeholder checks.
- Browser: a QA household with its member set to Chinese, 22 screens at 360px and
  1280px (Home, Bills, School, Health, Househelper, Home & Upkeep, HomeSend,
  Settings and six sub-pages, Manage Household and five sub-pages, HomeBrain
  Review): every page 200, no horizontal scroll, no error text, no raw key or
  unfilled placeholder. The only English on those screens is the plan
  catalogue's own descriptions.
- QA data (the test user and household) is removed after the merge.
