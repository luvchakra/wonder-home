# WonderHome — Internationalization and Localization

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 22-001 | Locale foundation & formatting | Done | `i18n/locales.ts` (languages, regions, currencies, IANA time zones), `i18n/preferences.ts` (precedence: person → household → region → app default), `i18n/format.ts` (Intl only, Latin digits, a calendar day never shifted by the zone, imperial for presentation only), `i18n/request.ts` sets the locale once per request so the existing date/time/money helpers follow it; 16 formatter tests |
| 2 | P0 | 22-002 | Preferences & Language & Region settings | Done | Migration `localization_preferences` (applied live): household `region`/`currency`/`measurement_system`/`default_language` (Admin only, existing `households_update_admin`), person `language`/`date_format`/`time_format`/`measurement_system` (self or Admin); `/settings/language-region` with language, region, currency, date & time and member-languages pages; audit `member.locale_updated`/`household.locale_updated`; 9 RLS tests |
| 3 | P0 | 22-003 | Optional localization setup | Done | `/onboarding/personalize` runs after family setup, never in place of it: six steps for an Admin, four for anyone else (they never set the household's region or currency); every step saved, "I'll do this later" resumable, a dismissible Home card for anyone who skipped; localization events recorded by the member themselves |
| 4 | P0 | 22-004 | Translation catalog & core UI | In Progress | Own catalog (`i18n/messages/*`, en/hi/mr/es/fr/de/ar, about 500 keys) with plurals, interpolation and English fallback, never a raw key, completeness enforced by the compiler and tests. Localized so far: navigation, Home header and counts, setup, Language & Region settings, the personalize card, the whole Notifications screen (tabs, filters, empty states, confirmations, each row's details, reasons, snooze and dismiss, the daily summary), the Family screen (members, pets, household help, family moments, what needs a reply, upcoming events, each person's and pet's details, role names wherever they appear), the More screen (section names, each area's one line of purpose, the viewer's role, Help, Sign out), the Today screen (views, timeline rows, empty states, what needs a person, looking ahead) with the shared "Add to the family calendar" sheet it and Home open, and the HomeTalk screen's own words (greeting, suggestions, confirm/change/cancel, edit and retry, the composer and its voice states, the action preview's frame, errors, message times, and the conversation search). A suggestion shows in the person's language but still sends its English sentence, which the rules read on every path. Every other screen is still English, and the language page says so |
| 5 | P0 | 22-005 | Multilingual HomeTalk | Done | A person can type or speak in their own language and get the reply in it, and no gate decides anything differently. The model is told the person's language (`languageLine` in `systemFor`) and returns the same language-neutral intent, with days, times, numbers and fixed choices in English words and the household's own words kept as said. A bare yes or no is read in all seven languages, as a whole reply only. Each reply is composed and validated in English, then translated by `conversation/reply-language.ts`: names, bold values, dates, times, amounts, numbers, link targets and brand names become tokens, and the result must carry every token once, with no new digit and no new markup. Otherwise the checked English is shown with a line saying why. A reply is translated only when the household has agreed that every content class it carries (`REPLY_CLASSES`, the answer's facts) may reach its model provider. The English stays the message's content, and the shown text is kept in `metadata.localized` |
| 6 | P0 | 22-006 | Localized notifications | Done | Every smart reminder (bills, school items and school days, meals, groceries, pet care, family plans, and a backup's escalation) keeps `notifications.message`: a `reminder.*` catalog key plus typed values (name, day, time, amount in its currency, list). `/notifications` and delivery beyond the app render it in the recipient's language and formats; `title`/`body` stay the English record, rendered from the same message. Names and items are never translated; an unreadable message shows the stored English. Health, approval and HomeTalk personal reminders still store English only |
| 7 | P1 | 22-007 | Multi-currency household records | In Progress | The household currency is the default for new bills and transactions only (`CurrencyField` picker with "Another currency…"); every record keeps its own currency, nothing is converted; the two money formatters use Intl. Still to audit: any screen that adds amounts across currencies |
| 8 | P1 | 22-008 | Right-to-left readiness | In Progress | `DocumentLocale` sets `lang`/`dir` from the viewer's language; the shell, Home hero, header, wordmark and script accents are direction-aware (logical properties, `rtl:` mirroring, `dir="auto"`), verified in Arabic at 360px and desktop. The remaining screens still need a pass |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose

Let every person in a household use WonderHome in their own language, with their own date, time and measurement conventions. The household keeps one region, time zone and default currency. Language, locale, currency, time zone and measurement are separate choices and are never inferred from one another without the person's say.

Localization changes how WonderHome speaks. It never changes what is stored, who someone is, what they may do, or a record's currency.

Source: `WonderHome_Master_Internationalization_Localization_MultiCurrency.md` (2026-09-24) and its 12-screen mockup. The integration decisions are in `design/I18N-IMPLEMENTATION-MAP.md`.

## Epic Map

- **Epic 22-E01 — Foundation:** stories 22-001, 22-002.
- **Epic 22-E02 — Setup & UI:** stories 22-003, 22-004, 22-008.
- **Epic 22-E03 — AI & Notifications:** stories 22-005, 22-006.
- **Epic 22-E04 — Money:** story 22-007.

## Dependencies

- `CLAUDE.md`
- `design/I18N-IMPLEMENTATION-MAP.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- Story 02-009 (family onboarding), which the localization setup follows.

## Stories

### Story 22-001 — Locale foundation & formatting
**Priority:** P0
**Goal:** One Intl-based formatter reads one resolved set of preferences. No screen builds a date, time, number or amount by hand.

**Acceptance criteria**
- Preferences resolve in this order: the person's own choice, then the household's, then the region's defaults, then the app's defaults.
- Dates, times, numbers, money and units are formatted through `formatterFor(prefs)`, with Latin digits.
- A calendar day is never moved by the time zone.
- The existing helpers follow the request's locale without touching every call site. Outside a request, today's defaults apply.

### Story 22-002 — Preferences & Language & Region settings
**Priority:** P0
**Goal:** A permanent edit path at Manage → Settings & Profile → Language & Region. It adds no new top-level navigation item.

**Acceptance criteria**
- Language, date format, time format and units are a person's own, or an Admin's to set for them.
- Region, currency, time zone and default language are an Admin's alone. Anyone else sees them read-only, with who decides them.
- Every stored value is a closed code, enforced by the database.
- Member languages are reachable from the settings page.
- Every change is audited.

### Story 22-003 — Optional localization setup
**Priority:** P0
**Goal:** An optional, resumable setup that runs after family setup: intro → language → region → currency → date, time & units → review.

**Acceptance criteria**
- It is additive. The family onboarding is unchanged and still comes first.
- A person who is not an Admin is never asked the household's region or currency.
- Each step is saved as it is taken, and "later" resumes from the same step.
- A person who skipped the setup sees one Home card, which they can dismiss.

### Story 22-004 — Translation catalog & core UI
**Priority:** P0
**Goal:** Stable keys, plurals, interpolation and fallback. A person never sees a raw key.

**Acceptance criteria**
- Each catalog is complete for the keys it ships, and the compiler and tests enforce it.
- Placeholders match across languages. Brand names (WonderHome, HomeTalk, HomeBrain, HomeSend) are never translated.
- A missing string falls back to English.
- **Done when:** every screen reads its copy from the catalog.

### Story 22-005 — Multilingual HomeTalk
**Priority:** P0
**Goal:** A person can speak or type in their language and get a reply in it, with every existing gate unchanged.

**Acceptance criteria**
- Understanding returns the same language-neutral intent an English sentence gives. A bare yes or no in any supported language settles a proposal, and a longer sentence never does.
- Every reply is validated in English first, and only a checked translation is shown. Names, items, dates, times, amounts, numbers and links are never handed to the translator and come back unchanged.
- A reply is translated only when every content class it carries may reach the household's model provider. Otherwise the person sees the English with a line in their own language saying why.
- The English stays the record. External voice channels (Gemini Voice, Alexa) are left to their own voice and language settings.

### Story 22-006 — Localized notifications
**Priority:** P0
**Goal:** Each notification is stored as an event plus its parameters and rendered in each recipient's language.

### Story 22-007 — Multi-currency household records
**Priority:** P1
**Goal:** Each record carries its own currency, and nothing is converted.

**Done when:** no screen adds amounts across currencies.

### Story 22-008 — Right-to-left readiness
**Priority:** P1
**Goal:** Every screen reads correctly with `dir="rtl"`.

**Done when:** every screen uses logical properties and mirrors directional icons.

## Module Completion Rule

Stories 22-001 to 22-003 come first. PR 2 (22-005, 22-006, 22-008) must not change what any gate decides.
