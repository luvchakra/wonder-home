# The languages each member speaks, and how well

**Date:** 2026-10-17

The owner asked that, when choosing family members' languages, a person can tick more than one, each with a "fluency meter". Separately, saving that page went nowhere logical; that fix shipped in #202.

## What changed

**Data.** `member_languages` holds one row per member per language, with a fluency of `basic`, `conversational`, `fluent` or `native`.
- `language` is an ISO 639 code from the picker, or the household's own words for a language not listed ("Konkani").
- It is separate from `household_members.language`, the one language a person reads WonderHome in, and never changes it.

**Who may do what** (RLS, `scripts/test-member-languages-rls.mjs`).
- Every member reads the household's list.
- A member changes their own, and an Admin changes anyone's.
- A row can never name a member of another household, and another household reads none of it.

**Screen.** Settings → Language & Region → Member languages: each person's row has "Languages they speak".
- **Adding.** A picker of 24 languages, named in the reader's own language (`Intl.DisplayNames`), with "Another language…" to type one that is not listed (rule 20).
- **The fluency meter.** Each language has a four-step meter, from "A few words" through "Can chat" and "Fluent" to "First language", tapped rather than typed. The level's word is always shown beside it (rule 3: never colour or height alone).
- **Removing.** An icon button with a label removes a language (rules 11 and 12).
- **Saving.** Saving replaces only what changed (`replaceMemberLanguages`) and goes back to Language & Region with "Saved".

**HomeTalk knows it.** The household context's people facts carry `speaks: "Marathi (native), English (fluent)"`, strongest first, and `goesBy` for a preferred nickname (`context/builders.ts`).

**Privacy.**
- A person's data export includes their languages (`privacy/export.ts`).
- A fulfilled deletion request removes them, and also resets `nickname_preferred` (`privacy/fulfill-deletion.ts`).

**Also.** On wide screens the app-language dropdown on that page now sizes to its content, so "Household default (English)" is no longer cut (rule 15).

**Help.** "Language" now describes Member languages and the meter, in all eight languages, using each language's own label for the page.

## Verified

- typecheck and ESLint; the migration and help-link lints.
- 3,042 unit tests, including the new `member-languages.test.ts` and the updated deletion test.
- The RLS test passes 6 of 6 against a from-scratch database (100 migrations).
- The migration is applied to the live project, and `verify:live` passes 229 of 229, including two new checks.
- **Browser, on a production build at 360 px and 1280 px**, with a QA account on the live project:
  - adding Marathi as First language, English as Fluent, and a typed "Konkani";
  - saving, which lands on Language & Region with "Saved";
  - the rows match after a reload, and the database holds the same three;
  - no horizontal scroll.
  - The first layout squeezed long names into broken letters at 360 px, so the meter moved under the name.

**Cleanup.** The QA account, household and files from both browser runs today were deleted once each was tested:
- **#202:** user `3c1fd521…` and household `802f162e…`, with its three photos in `avatars`.
- **This change:** user `1efb66de…` and household `bd7db44f…`.

A SQL count found nothing left.

## Still open

- **HomePlaces**, the next piece the owner asked for.
