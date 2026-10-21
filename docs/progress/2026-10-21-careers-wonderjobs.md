# Careers, powered by WonderJobs (17-010)

**Date:** 2026-10-21 · **Asked by:** the owner

WonderHome now has a public Careers section. WonderJobs (https://jobs.wonderapps.biz) runs everything behind it: the jobs, storing applications, emails to the applicant and the hiring team, reminders, decisions and data deletion. This app shows what WonderJobs returns and forwards what an applicant submits. It stores no applicant data.

## What was built
- **The client:** `packages/core/src/careers/wonderjobs.ts`.
  - The host is fixed. An override (`WONDERJOBS_CAREERS_URL`) is honoured only for an https host on wonderapps.biz, with no credentials and no other port.
  - Every call sends a Bearer key, has an 8 s timeout and uses `cache: "no-store"`.
  - A GET is retried once on a network error or a 5xx. A POST is never retried.
  - 401 is "wrong key", 404 "not found", 400 and 409 carry WonderJobs' own message, and 429 is "busy" with `retry-after`.
  - The job list is kept in memory for 60 s per key. The status endpoint and anything about an applicant are never cached.
  - Logs carry only the endpoint, the job id, the status code and the time taken.
- **The key:** Supabase Vault, through migration `20261021080000_careers_key.sql`.
  - The functions `careers_key_set`, `careers_key_clear`, `careers_key_read` and `careers_key_status` are executable by the service role only.
  - `careers_settings` keeps the last four characters.
  - `careers_key_events` is the append-only audit of who saved or cleared the key and when, with the last four only. A deleted profile's id may become null; nothing else may change.
  - Clearing overwrites the Vault secret with nothing.
  - `WONDERJOBS_CAREERS_KEY` is used only when no key is saved.
- **Server-only wiring:** `apps/web/app/_lib/careers.ts` (`import "server-only"`). `npm run check:bundle` now also fails if `/api/careers/v1`, `careers_key_read` or `WONDERJOBS_CAREERS_KEY` reach a client chunk.
- **Staff page:** `/platform-admin/careers`, for platform owners and operators (new capability `careers.manage`). It offers:
  - paste and save;
  - the mask (`wjcs_••••••••abcd`);
  - Test connection, which reports Connected with the job count, Wrong key, or Unavailable;
  - Clear;
  - the list of the last ten changes.
  
  Anyone else gets a 404.
- **Public pages:**
  - `/careers` lists the jobs with title, location, work mode, type, salary range and skills. It also shows "No open positions right now", "Careers isn't set up yet" or "Careers is unavailable right now" with Try again. Platform admins alone see the reason.
  - `/careers/[id]`:
    - the description as plain text blocks, never HTML;
    - Share, using the share sheet or a copied link;
    - JobPosting JSON-LD with every "<" escaped;
    - the Apply form, with every field labelled and each error tied to its field.
    
    The consent line carries WonderJobs' `retentionMonths`, and has no period when that is null. The form has a hidden `website` honeypot: when it is filled, the visitor is told it was sent and nothing is called. "Application sent…" shows only after WonderJobs' 200. A 400 or 409 message is shown as it is, and a 404 says "This position is no longer open".
  - `/careers/status?t=` shows the job, company, status label, applied date and last update. Withdraw asks first. The token goes to WonderJobs only in a POST body. The page is noindex, `Referrer-Policy: no-referrer` and no-store, set both in `next.config.ts` and in its metadata.
- **Protection:**
  - Applications are rate-limited to 10 an hour per hashed client address (`careers.apply`), and status looks and withdrawals to 30 an hour (`careers.status`).
  - Both actions are Next server actions, so Next's own same-origin check refuses a cross-site POST. The CSP needs no change, because the browser never calls WonderJobs.
- **Routing and links:** `/careers` is public in `route-policy.ts`. `robots.txt` allows the list and each job, and disallows `/careers/status`. The landing footer has a Careers link.

## Verified
- Unit tests:
  - client: 11;
  - key store, format and validation: 13;
  - pages and actions, rendered on the server with WonderJobs mocked: 16;
  - admin actions: 5;
  - route policy and robots.
  
  Together with the security suite: 242 pass.
- Typecheck, ESLint, `lint:migrations`, production build, `check:bundle` and `tracker --check` all pass.
- Live database: all four functions are executable by `service_role` only, neither `anon` nor `authenticated` can read either table, RLS is on, and the trigger is in place.
- Browser QA at 360px and 1280px, light and dark, with no horizontal scroll:
  - "not set up" for a visitor, and the reason for an admin;
  - save shows only the mask, and the page never contains the key;
  - Test connection with a made-up key was answered 401 by the real WonderJobs, shown as "Wrong key";
  - `/careers` then read "unavailable";
  - Clear, with both changes listed;
  - the status page's headers.

## Open
- The job list, a job page and the form with real jobs were checked only through the server-rendered tests. A browser run needs a real key.
- The live project took the migration in seven `apply_migration` steps. The tool cancels a call that contains `drop` or `delete`, so clearing overwrites the Vault secret instead of deleting its row.
- The careers pages are English, as the landing and legal pages are.

## Cleanup
- The QA account `1916d7f3-…` and its platform admin row are deleted.
- Two audit rows (the QA save and clear) stay in the append-only `careers_key_events`, now unattributed. No key is saved.
