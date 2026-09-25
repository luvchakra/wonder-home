# Every screen in each person's language — story 22-004 Done

**Date:** 2026-09-25 · **Story:** 22-004 Translation catalog & core UI → **Done**

## What was done

The earlier slice (`2026-09-25-remaining-screens-localized.md`, PR #191) covered
every signed-in domain screen. This one closes the story:

- **Help** (`/help`). The guide, the FAQ and the suggested questions moved into
  the catalog (`areas/help/`, 213 keys); `help/guide.ts` keeps only structure
  (ids — still the anchors — groups, keywords). `localizedGuide(t)`,
  `localizedFaq(t)` and `guideByGroup(t)` return the same shapes in the reader's
  language. The search box answers in that language too
  (`answerQuestionIn(question, t, language)`): English keeps its exact old
  tokenizer, other languages get one that handles accents, Devanagari and Arabic
  marks, French elisions, the Arabic article and Chinese character pairs. The
  server action accepts only a supported language code.
- **Entry screens** (`areas/entry/`, 313 keys): sign-in, sign-up, forgot and
  reset password, invitation, household creation (`/welcome`), the guided setup
  wizard, and the voice-link consent screen. Core-built wizard words (readiness,
  summaries, the "Next" step, guided questions, the final checklist) are written
  by the screen from the same numbers core computes.
- **Signed-out language.** `negotiateLanguage(acceptLanguage)`
  (`packages/core/src/i18n/negotiate.ts`, tested) picks the best supported
  language by q-value and falls back to English; `apps/web/app/_lib/entry-locale.ts`
  builds the translator from it. Nothing is stored. Signed-out Help uses it too.
  The auth and wizard frames set `<html lang dir>` like the signed-in shell.
- **Coverage wording.** The Language & Region note and the guide no longer say
  "some screens are still in English"; they say names and what the family types
  stay as written, and a few short WonderHome messages are still English.
- Small, additive shared-kit props (English defaults unchanged): `PasswordField`
  show/hide labels, `Stepper` labels, `ComboboxField` `optionLabels` (shown words
  change, the stored value does not).

## What stays English, by decision
- Household data, and suggestion templates that become the household's records.
- Sentences built in core and shared across screens: agenda rows, Activity event
  titles, device/weather sentences, server-action notices and errors.
- Static page titles (`metadata.title`).
- **The legal page** — translating legal terms needs a person's review first.

## Verified
- `tsc` core and web, eslint (web), import boundaries (956 files), core unit
  tests 204 files / 2998 tests: catalog completeness and placeholders in every
  language, `negotiateLanguage`, and the localized Help guide and its search per
  language (every section, FAQ and suggestion lands on the same section as in
  English; English output byte-identical to before).
- Browser, real project, 360px and 1280px: a Chinese-speaking member on the
  wizard, household creation, Help and Language & Region; signed out, the four
  auth screens in zh, hi, and pt-BR (falls back to English), with `lang` set and
  no horizontal scroll; Help signed out in Chinese, a typed question answered in
  Chinese with a link to the right section.
- QA data from this session is removed after the merge (see the PR).

## Open
- 22-008 right-to-left beyond the shell and Home stays deferred by the owner.
- A German reviewer may want to glance at two reworded Help strings (a
  suggestion and the "children and bills" FAQ), reworded so the search lands on
  the same section as in English.
