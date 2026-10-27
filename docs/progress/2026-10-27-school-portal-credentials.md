# 2026-10-27 — Connect Loop Learning with a sign-in, stored securely (08-032)

The owner asked to build the Loop Learning adapter: take URL, username and
password, save them securely, stay connected until disconnect, show the button
as connected, and fetch data (on demand + twice daily).

Loop Learning (the Podar schools portal) has **no public API** — it is a SPA /
mobile app, and a parent signs in with a username and password. So we agreed
("you capture, I build"): build the secure connect now; the owner captures the
portal's private requests from a logged-in session, and the live fetch is built
to those next (08-033).

## What was done (this PR)
The secure connect, end to end.

- **Migration `20261027090000_school_portal_credentials.sql`** (applied live,
  verified): stores a connection's `portal_url`, `username`, `password`. The
  password is never readable — the row has no select policy, select is revoked
  on the table and granted back only on the non-secret columns (so an update's
  WHERE still works), exactly the `household_ai_credentials` / `20261017180100`
  pattern. The server reads it with the service role; nothing reachable from a
  browser can. `school_portal_credential_status` (SECURITY DEFINER, Admin-only)
  reports a portal is connected and as whom, never the password. RLS: an Admin
  writes (`wh.admin_households()` set form); reading is nobody's.
- **`school/portal-credentials.ts`**: `setSchoolPortalCredentials` (write, never
  reads the password back), `clearSchoolPortalCredentials`,
  `schoolPortalCredentialStatus`, and `readSchoolPortalCredentials` — the one
  server-only reader (admin client) the connector uses.
- **Server actions** (`(auth)/school-actions.ts`): `connectSchoolPortalWithCredentialsAction`
  (create the integration + store the sign-in, Admin-gated), and
  `fetchSchoolPortalNowAction` (the on-demand control; answers honestly that the
  fetch is not live until the adapter ships).
- **Connect-school screen**: a `credentials` portal (Loop Learning) shows a
  URL/username/password form; once connected the **button changes** to
  "Connected as <username>" (with the stored URL beneath it) plus Edit, Test
  connection, a "Fetch now (last 24h)" section, and Disconnect. The account
  stays connected until disconnected. Nine + five new strings in all eight
  languages.
- **One place for every portal's sign-in, editable** (owner, 2026-10-27): each
  portal card is that portal's management view — the stored URL and username
  show on it, **Edit** opens a prefilled form (URL + username; the password
  field is blank and "leave blank to keep the current password", so the stored
  password is never read back to edit it), and **Test connection** checks the
  sign-in on demand. `updateSchoolPortalCredentials` writes only the non-secret
  columns when the password is left blank. The live Test/Fetch stay honest
  (answer that they turn on once the adapter ships) until 08-033.
- Audit events `school.portal_connected` / `school.portal_disconnected` (never
  carry the password). `school_portal_credentials` registered as excluded in the
  knowledge registry.

## Verified
- `test-school-portal-credentials-rls.mjs` 8/8: the password is unreadable even
  to the Admin who set it; the status RPC never returns it; a non-admin cannot
  write; the service role can read it to run the connector; an Admin can change
  the URL and username while the password stays unread and unchanged; replace
  and clear work; another household sees nothing.
- Per-row-helper RLS guard 5/5; school + homesend suites 565/565; core + web
  typecheck clean; web lint clean; `npm run build -w apps/web` ✓; check:bundle,
  lint:help-links, lint:knowledge, lint:migrations, lint:secrets all clean.
- Live: `school_portal_credentials` RLS on; `get_advisors` security shows
  nothing on the new table (the status RPC is the same accepted SECURITY DEFINER
  pattern as `ai_credential_status` / `voice_credential_status`).

## Open / needs a person
- **08-033 — the live fetch.** No portal is live. The account is connected but
  nothing is pulled until Loop Learning's private endpoints are known. The owner
  is capturing the login + homework requests from a logged-in session; the
  `loop-learning` adapter, the on-demand fetch, and the twice-daily cron (files
  new items through HomeSend per the household's approval settings) are built to
  those next.
- **Interactive 360px/desktop QA** of the sign-in form and connected state is
  pending — do it on the deployed site.
- Honest caveats carried from the plan: automated login to a portal with no API
  very likely runs against its terms of use; the password sits protected by RLS
  + service-role-only reads (the app's established credential model) rather than
  vault encryption, which is a straightforward later hardening.

## Where the code lives
- `supabase/migrations/20261027090000_school_portal_credentials.sql`
- `packages/core/src/school/portal-credentials.ts`
- `apps/web/app/(auth)/school-actions.ts`,
  `apps/web/app/_components/school-connect.tsx`,
  `apps/web/app/_lib/school-connect-labels.ts`,
  `apps/web/app/household/integrations/school/page.tsx`
- `packages/core/src/api/audit.ts`, `packages/core/src/knowledge/registry.ts`
- i18n: `i18n/messages/areas/school/*`
- `scripts/test-school-portal-credentials-rls.mjs`
- Backlog: 08-032 In Progress, 08-033 Not Started
