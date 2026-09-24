# Internationalization, part 1: language, region and currency

**Date:** 2026-09-24. **Stories:** 22-001, 22-002 and 22-003 are Done. 22-004, 22-007 and 22-008 are In Progress. **Spec:** `WonderHome_Master_Internationalization_Localization_MultiCurrency.md` and its 12-screen mockup.

## What was done

- **Separate preferences.** Language, locale conventions, currency, time zone and measurement are now separate choices.
  - A person owns their language, date format, time format and units.
  - The household owns its region, currency, time zone and default language, and only an Admin may change them.
  - Preferences resolve in this order: the person, then the household, then the region's defaults, then the app's defaults. AI never overrides an explicit choice.
- **One formatter.** `packages/core/src/i18n/format.ts` is Intl only, with Latin digits.
  - `i18n/request.ts` sets the locale once per request in `buildSession`. The existing `formatDate`/`formatTime`/`formatToday`/`greetingFor` helpers and both money formatters now follow it without touching every call site.
  - The two `₹`-building money formatters (`finance/payments.ts`, `commerce/policy.ts`) now go through Intl.
- **Catalog.** `i18n/messages/{en,hi,mr,es,fr,de,ar}.ts` hold about 115 stable keys.
  - `translate.ts` supports plurals (via `Intl.PluralRules`, including Arabic's extra forms), interpolation and English fallback. It never shows a raw key.
  - The `Catalog` type makes a missing key a compile error.
- **Settings.** The page lives at Manage → Settings & Profile → Language & Region (`/settings/language-region`).
  - It has sub-pages for language, region (with "also use the usual currency, time zone and units there"), currency, date & time & units, and member languages.
  - A member who is not an Admin sees the household's region and currency read-only, with who decides them.
  - No new top-level navigation item was added.
- **Optional setup.** `/onboarding/personalize` comes after family setup ("Go to my home" leads into it only when the person has never started it) and never replaces it.
  - An Admin gets six steps and anyone else four; they are never asked the household's region or currency.
  - Each step is saved as it is taken, and "I'll do this later" resumes at the same step.
  - Anyone who skipped sees one dismissible Home card.
- **Currency.** The household currency is the default for new bills and transactions only.
  - `CurrencyField` offers the household's currencies plus "Another currency…".
  - Every record keeps its own currency, and nothing is converted.
- **Localized UI.** These surfaces are localized: navigation (tab bar, sidebar, drawer groups and items), the Home header and counts, the setup, the settings pages, and the personalize card. Every other screen is still English, and the language page says so.
- **Right-to-left.** `DocumentLocale` sets `<html lang/dir>` on the client. The root layout stays static, because reading a cookie there would make every page dynamic.
  - The Home hero mirrors its illustration, scrim and date chip in right-to-left.
  - The header uses logical offsets.
  - The wordmark keeps its English direction, and `ScriptAccent` takes `dir="auto"`.
  - On a phone the date chip now sits above the greeting, where a long date previously ran into it (rule 15). This also changes the English layout slightly.
  - The header tagline now wraps instead of running under the bell.

## Data and security

- **Migration.** `20260929090000_localization_preferences.sql` was applied live as `localization_preferences`.
  - It adds closed-code columns on `households` and `household_members`, plus per-person setup state (`locale_setup_status/step/version/at`, `locale_prompt_dismissed_at`).
  - It extends `onboarding_events` with the localization events.
  - It replaces `onboarding_events_insert_admin` with `onboarding_events_insert`. An Admin may record any event. A member may record only their own localization events, and not the household-level ones (currency, time zone, another member's language).
- **Policies.** No new write policy was needed for preferences. Household settings go through `households_update_admin`. A person's own settings go through the existing member self-update, guarded by `wh.guard_member_self_update`.
- **Audit.** Changes are recorded as `member.locale_updated` and `household.locale_updated`.

## Verified

- **Unit tests:** formatter 16, catalog 7 (completeness, placeholder parity, brand names untranslated, plurals including Arabic, fallback, injection-safe interpolation). The payments and commerce money tests were updated to the Intl output.
- **Database:** `scripts/test-localization-rls.mjs`, 9 tests:
  - a member may set only their own language;
  - an Admin may set anyone's language;
  - a language change carries nothing else with it;
  - household settings are Admin-only and never reachable from another household;
  - only closed codes are stored;
  - the events policy.
- **Live:** the migration was applied, and `npm run verify:live` passed 185/185, including 2 new checks.
- **Browser, on the real project at 360px and desktop:**
  - Hindi → India → INR → review, then Home in Hindi with `lang="hi"`.
  - The settings overview and member languages.
  - Bills defaulting to the household currency.
  - Switched to English.
  - Arabic, with `dir="rtl"`, on the settings page and on Home at desktop and phone. This found the hero, header and wordmark problems above, which were fixed and re-shot.
  - No horizontal overflow.
- **Full gate:** `npm run verify` (see the PR).

## Still open

- **22-004:** translate the remaining screens (the family-setup resume card, "See all", domain tiles, and every domain screen).
- **22-005 / 22-006 (PR 2):** multilingual HomeTalk understanding and replies, and notifications rendered per recipient.
- **22-007:** audit any screen that sums amounts across currencies.
- **22-008:** a right-to-left pass over the remaining screens and the phone drawer (it still slides in from the left).

## Where the code lives

- **Core:** `packages/core/src/i18n/`.
- **Shell:** `packages/core/src/components/shell/document-locale.tsx`, plus the labels passed through `ShellViewer`.
- **Kit:** `components/ui/choice-list.tsx`.
- **App:**
  - `apps/web/app/(auth)/locale-actions.ts`
  - `apps/web/app/_components/locale-*.tsx`, `currency-field.tsx`, `personalize-card.tsx`
  - `apps/web/app/onboarding/personalize/`
  - `apps/web/app/settings/language-region/`
- **Map:** `design/I18N-IMPLEMENTATION-MAP.md`.
