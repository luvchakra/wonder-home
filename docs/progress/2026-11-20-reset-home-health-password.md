# Download full data: health records locked with a password (15-014 follow-up)

The owner answered the health question from #576 (2026-11-20): "for health record ask for password and encrypt with that password". Asked which reading he meant, he chose "ZIP, what I can see". The download still holds only what the owner can see: their own health records, their children's, and household-shared ones. Other adults' private health records and private HomeTalk conversations stay out, and no privacy rule changes. What changes is that the health part is now locked with a password he types.

## What changed

- **Asking for the password.** "Download full data" (in the Danger zone and in step 1 of Reset home) asks for a health-records password, with a repeat and show/hide. It explains: "The health records in this download are locked with this password. WonderHome doesn't keep it, and without it they can't be opened."
  - The minimum is 12 characters, longer than sign-in's 8. The format below fixes key stretching at 1,000 rounds, so the password's length is what protects a lost file.
  - It is checked in the browser, in the person's language, and again on the server.
  - When the owner can see no health records at all (`hasHealthContent`: any row in a health table or any file in `health-records`, read as the owner), the download doesn't ask.
- **What goes into the locked archive.** Everything health goes into `health-records-protected.zip` inside the download, and every entry in it is encrypted:
  - `data/health/<table>.json` for all 12 health tables;
  - each file from the `health-records` store, renamed `files/health-records/file-NNN<ext>` so that no stored name appears in clear;
  - `files/health-records/index.json`, mapping each number to its stored name.
  - The rest of the ZIP stays readable as before.
- **The README** (not encrypted) says which part is locked, the format, and how to open it on Windows, Mac, Android and iPhone. It gives only table names and row counts for health. Health files that couldn't be read are counted, never named.
- **Without a password,** health is not read at all. The server refuses (400) when there are health records and the password is missing, too short, or doesn't match its repeat.
- **Where the password goes.** Only in the body of the authenticated POST that carries the step-up. It is never in a URL, a log, storage or the audit trail. The audit entry says `health_encrypted: true|false`, and no model ever sees the password.
- **The form** empties all password fields the moment the request starts. Nothing is kept in browser storage.
- **Memory and speed.** Memory is unchanged: one page or one file at a time, and the inner archive streams. The writer now reads up to 8 tables' first pages ahead (`EXPORT_LOOKAHEAD`), so a slow link costs about an eighth as much. On a far machine one QA home took 16 s instead of about 2 minutes. Production sits next to the database and was already fast.

## Format decision: WinZip AES-256 (AE-2) ZIP

**Why this format.** It is the one standard password-protected format that ordinary tools open on both phone and computer:
- 7-Zip, WinZip and Windows' own extractor in recent builds;
- Keka and The Unarchiver on Mac (the built-in Archive Utility can't);
- ZArchiver on Android, and AES-capable apps such as iZip on iPhone.

`age` or OpenPGP files would need a tool most phones don't have. Legacy ZipCrypto is broken and is not used.

**How it is built.**
- It follows the format's own specification: a random 16-byte salt per file, PBKDF2-HMAC-SHA1 with 1,000 rounds to the AES-256 key, the HMAC key and a 2-byte password check, AES-256 in CTR mode with the format's little-endian counter, and a 10-byte HMAC-SHA1 authentication code per file.
- Every primitive is Node's built-in `crypto`. There is no new dependency, so no licence or bundle impact. `household/zip.ts` is server-only, and `check:bundle` passes with no export code in client chunks.

**Limitation (stated, not hidden).** The specification fixes 1,000 PBKDF2-SHA1 rounds, which is weak against offline guessing if the file and a short password were both exposed. Hence the 12-character minimum and the advice to use a phrase. A stronger key derivation (7z's 2^19 SHA-256 rounds, scrypt in `age`) would mean a format phones can't open.

## Verified (only these)

- **`zip.test.ts`:** WinZip AES entries opened by **7-Zip** (`Method = AES-256`) and **pyzipper**, two independent readers, with the right password. Both fail with a wrong one. Protected bytes never appear in clear. The test runs a 70 KB file across chunk boundaries.
- **`full-export.test.ts`:**
  - With a password, the whole download (outer ZIP) contains no health row text, health file bytes or stored health file name in clear.
  - 7-Zip and pyzipper extract the outer ZIP, then open `health-records-protected.zip` with the password, finding every health table, the file and the index. A wrong password fails.
  - Without a password, nothing health-related is in the archive.
  - The tests also cover password validation, file naming and `hasHealthContent`.
  - All 321 tests in `packages/core/src/household` pass.
- **i18n, settings registry, help:** pass. `lint:help-links`, `lint:boundaries:input`, `lint:service-role`, typecheck, ESLint (web), `npm run build -w apps/web` and `check:bundle` also pass.
- **E2E `e2e/reset-home.spec.ts`** on QA households on the live project, with the reset migration now live and the app server given the service key as in the nightly (`E2E_SERVER_SERVICE_KEY=1`): **10/10** on mobile and desktop.
  - The owner's health record makes the download ask for the password twice.
  - "Too short" is refused in words.
  - The ZIP holds `health-records-protected.zip` and not the record's title in clear, and the fields are emptied.
  - Then the reset: `/onboarding`, the owner alone, records gone, one `household.reset` audit entry, and the other account intact.

## Fixed along the way

- **Duplicate ids.** Two forms on one page had a password field with the same HTML id (`PasswordField` defaults the id to the name), so a label could point at the other form's field. Each field now has its own id (`useId`).
- **A failed audit write no longer blocks a download.** Before, it surfaced as a 500, which can only happen where the server has no service key. It is now logged as `household_export_unaudited` and the download goes ahead.

## Cleanup

E2E QA users and households on the live project were deleted by the spec. One household left by a run that timed out ("E2E Reset 8mry0c", its users already gone) was deleted by id. A service-role check found no `reset-*@e2e.wonderhome-test.internal` user and no "E2E Reset…" household left. The timing and probe users made by hand were deleted in the same scripts. No dev server is left running.

## main was red after #576 (fixed here)

`apps/web/client-writes.test.ts` (the gate for "a browser write never leaves a stale screen") flagged `app/settings/reset-home/reset-forms.tsx`. The download's POST writes a `household.exported` activity entry, and the form did not refresh. I hadn't run that gate in #576. Fixed properly: after a successful download the form calls `router.refresh()`, so a kept Activity screen is dropped. The gate and its test are unchanged. All three `apps/web/*.test.ts` gates pass.

## Everyone downloads their own data (same PR)

The owner added (2026-11-20): "everyone should have similar option to download the data".

**Who** (the coordinator's defaults; the owner can change them):
- **Every adult**, Admin or not, and **every househelper**. Helpers have Settings today, so they get it too, holding only what a helper can see.
- **Never a child.** A parent's or an Admin's download already holds what they can see of the child, and the screen says so to the child.
- **Never by voice, HomeTalk, WhatsApp or an agent.** The rule is `mayDownloadOwnData` in `household/reset-policy.ts`, with unit tests: adult, Admin, helper and owner yes; child no; another household no; any non-app channel no.

**Where:** Settings → Privacy & security → "Take a copy with you" → **Download my data**. It uses the same component and the same route as the owner's "Download full data" in the Danger zone. It replaces the old JSON-only "Download my copy" there, so there are not two buttons for one job (rule 14). The old `/privacy/export` API route is left in place for API clients, but no screen uses it any more. Reset home stays owner-only, unchanged.

**What each person gets:** exactly what they can already see.
- The export was already read through the person's own session and RLS. The route's owner gate became the member gate.
- Storage files were already listed and fetched with the person's own client, so no household-wide admin grant ever reads a file.
- The README now says "everything in this home that you can see … nothing more", and keeps saying what is left out and why.

**Proved in the database test** (`scripts/test-household-reset-rls.mjs`, now 9/9):
- **Equal to what they can read.** For the owner, an Admin, an ordinary adult and a helper, every household table the download reads holds exactly what that person's own session reads (a test-only parity function, table by table).
- **No crossing over.** An Admin's private health record and private HomeTalk conversation are in their own download and in nobody else's: not the owner's, another adult's or the helper's.
- **Role-sized.** A helper's download is smaller than the owner's.

**Same safeguards as the owner's download:**
- Step-up (password, or a recent Google sign-in).
- The health records password and AES-256 lock.
- Streamed, `no-store`, never stored.
- One `household.exported` activity entry per download, written when it finishes: who, `kind: owner|member`, completed, `health_encrypted`, and counts of tables, records and files, never values.
- A new per-person rate limit, `household.export`: 5 an hour, counted only after the step-up succeeds (`docs/security/rate-limits.md`).

**E2E** (`e2e/reset-home.spec.ts`, 12/12 on mobile and desktop on QA households): the other Admin downloads from Privacy & security, is not asked for a health password (the owner's record is private to the owner), and gets "E2E Dal" but not the owner's health record or a protected archive. The member activity entry is written. Each person now signs in once per run and the session is reused, so a run stays well under Supabase's sign-in limit. The reset's wait for `/onboarding` allows 90 s for a far-away runner.
