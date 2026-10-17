# Household setup: home address and schools from Google Maps, photos, nicknames, birthdays, and clearer owners

**Date:** 2026-10-17

The owner asked for these while going through setup on the live app. All of it ships in one change.

## What changed

**Order of setup.** Language, region, currency and time zone come first now. Welcome's Start goes to the personalize steps when they have not been done or put away; finishing them, or choosing Later, goes back into family setup at the basics step (`moveAction`, `afterLocaleSetup`). Before, they were asked after everything else.

**Home address** (`household_addresses`, `household/address.ts`).
- Asked on the basics step, under the counts.
- Edited and removed later under Manage Household → Home address (`/household/address`). Both screens write through `saveAddressFromForm` (rule 23).
- Picked from Google Maps when the deployment has a key; typed otherwise. A typed address is saved as written, with no point.
- **Who sees it:** the household's adults and Admins only. Helpers, children and other households get nothing, by RLS (`test-household-address-rls.mjs`).
- **Who writes it:** an Admin, only in their own name.

**Place search** (`packages/core/src/places/`). This is a provider-neutral port with one adapter, Google Places (New).
- **Key.** The key is `GOOGLE_MAPS_API_KEY`, used only on the server. The browser calls `searchPlacesAction` and never Google, so neither the CSP nor the client bundle changes.
- **Throttling.** Every search is an Admin's, rate limited per member (`places.search`, 120 per 10 minutes) and debounced in the browser.
- **Saving.** A picked place posts only its id. The server re-reads it (`pickedPlace`, a narrow field mask, the same session token) before saving, so an address or a point never comes from the browser.
- **Map preview.** The saved home's preview is a Static Maps image fetched by the server and inlined as a data URL. Typed addresses get an "Open in Google Maps" link instead.
- **Without a key.** The fields are plain text inputs, with no dead search box (rule 10).

**Schools near home.**
- The children step and the guided school question use the same picker, limited to school types and biased to a 15 km circle around the saved home, with the distance shown.
- A picked school stores its place id, address and point on `school_enrolments`.
- Saving a different school makes it the child's current one. The old enrolment stays on record, with `active = false`, never deleted.

**Photos during setup.**
- Adults, children, helpers and pets each have Add, Change and Remove photo on their card, saved with the form.
- Photos are shrunk in the browser to a 512 px JPEG (`_lib/shrink-photo.ts`). The server checks the bytes are JPEG, PNG or WebP (`_lib/photos.ts`).
- Pets' photos live in the same private `avatars` bucket under `<household>/pets/<pet>` (`pets.photo_path`), so the existing storage policies govern them. Family shows a pet's photo in its row.
- **Bug fixed.** The Settings photo upload failed with "try again" because phone photos are larger than the 4.5 MB a request may carry. Nothing ever reached Storage. `MemberAvatarControl` now shrinks first too.

**Nicknames and preferred name.**
- Adults, children and helpers have a Nickname field and a Preferred name tick (`household_members.nickname_preferred`). The Family/Settings profile form has the tick too.
- Home's and setup's greeting use the nickname when it is preferred (`membership.preferredName`, `calledName`).

**Dates of birth.**
- Adults, children, helpers and pets each have a date of birth on their setup card. A child's date of birth replaces the stated age.
- Birthdays were already kept in step with `date_of_birth` by `wh.sync_member_occasion_events`, so adding or changing one adds or moves the birthday event with no new code.

**Helpers do more than one thing.** "What do they do" is now checkboxes plus one in the household's own words, saved as "Maid, Cook". `helperCovers` already matched each word, so suggestions follow every ticked role.

**Responsibilities.** The single "X, with Y" picker became two plain choices, Primary and "Backup if they're away", on each suggestion and on the add-your-own form. `setupWizard.review.withBackup` was removed.

**Pet suggestions.** Checked and left as they were. They already offer feeding and vet visits for every pet, morning and evening walks for a dog, and the litter box for a cat.

**Language & Region → members.** Saving everyone's language now goes back to Language & Region with "Saved", rather than reloading the same form.

**Gemini Live when it is unavailable.**
- Where the reason is one an Admin can change, HomeTalk's engine picker and Settings → Voice show a link to the right place:
  - a non-Google key → AI Assistant;
  - the data-use agreement → AI Assistant's sharing section;
  - the plan → Your plan.
- The link carries `returnTo` (`_lib/return-to.ts`, same-site paths only). Saving the key or the sharing choices sends the person back, and those pages show "Back to HomeTalk" meanwhile.
- The deployment's own voice switch has no link, because no household setting changes it.

**The privacy note.**
- A kit component, `PrivacyNote`, puts one small line under every form that asks for personal details:
  - setup's basics, adults, children, and pets and help steps;
  - Manage Household → Home address;
  - the profile card in Settings.
- The line reads: "You're trusting us with your family's private details…" Its "How we protect it" link opens `/legal#your-information` in a new tab.
- That section says in plain words what the software actually does, links to the official texts of India's DPDP Act 2023 and Europe's GDPR, and says plainly that no formal audit has been done.
- `docs/privacy/your-personal-information.md` holds the same words and maps each promise to where the code enforces it. A compliance or certification claim is deliberately not made: that needs a legal review.

## Verified

- typecheck and ESLint (the whole app), plus the migration, embed, boundary, secret and help-link lints.
- 3,036 unit tests, including the new `places/google.test.ts` and `calledName`, and 64 script tests.
- The new RLS test passes 5 of 5 against a from-scratch database, which applied all 99 migrations.
- Production build; `check:bundle` finds no guide text in client chunks.
- The migration was applied to the live project. `verify:live` passes 227 of 227, including five new checks for this change.
- Words are in all eight languages, and help (setup, voice, family) is updated with new dates.
- **A browser walk-through** on a production build, at 360 px and 1280 px, with a QA account on the live project and the Google key set locally.
  - **Setup order.** Welcome → language setup → basics.
  - **Address.** Typed, then searched and picked: "Prestige Lakeside Habitat…" came back from Google and was saved with its place id and point.
  - **School.** Searched near home: "Greenwood High – ICSE/ISC Campus (Sarjapur)", 4.4 km. Its full address and point were re-read on the server, and the typed school it replaced is kept with `active = false`.
  - **People and pets.** Photos for an adult, a child and a pet; nickname and preferred name; dates of birth, with both birthday events created by the trigger; helper roles saved as "Maid, Cook"; pet species and date of birth.
  - **Responsibilities.** Primary and Backup pickers on review.
  - **Settings.** The photo upload works, with the stored photo replaced.
  - **Return link.** `/settings/ai?returnTo=/ai` shows "Back to HomeTalk", and an off-site `returnTo` is ignored.
  - Home greets "Ashu" when that nickname is preferred.
  - **Layout.** No horizontal scroll anywhere checked. A picked address wraps whole words; Change is an icon button with a label (rule 11).

## Still open

- **Google Maps key.**
  - The owner gave a key, and it is set as `GOOGLE_MAPS_API_KEY`, a sensitive Production variable in Vercel. It takes effect on the next production deployment.
  - It answers Places (New). Maps Static API is not enabled for it, so the map preview is skipped (the code checks the response is an image) until someone enables that API in Google Cloud.
  - Restricting the key to those two APIs, and a daily quota, are worth doing in Google Cloud.
- **Next, as the owner asked:**
  - **Languages each member speaks.** Several languages per member, with a fluency level for each.
  - **HomePlaces.** A module for place-based questions ("somewhere for dinner tonight", "somewhere for her after school"), built on this place search with the home and school points.
