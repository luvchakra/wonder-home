# Razorpay keys: one card, and a step-up a Google-only owner can pass

## Why
The owner (2026-11-20) generated Razorpay test keys and could not save the
key secret: "not working, there is no Configuration → Payments → Razorpay key
id … fix the secrets menu so it takes expected value", then "why its in 2
different places, update it so both values can be taken at same place".

## Cause
Not the schema (`secret(16)` accepts 24 letters and numbers), not Vault, not
the rate limit: the live audit log has no `platform.config_changed` row since
2026-11-08, so no save reached `platform_config_secret_set`. Every secret save
needs the platform step-up, which was "Your password" checked with
`signInWithPassword`. The owner's account signs in with **Google only** (its
only identity is `google`), so it has no password and the check answered
"That password didn't match" every time. Every platform secret, and the
Performance page's step-up actions, were unreachable for that account.
Separately, the owner guide sent the key id to "Configuration", while the
registry puts it on Integrations → Payments.

## What changed
- **Step-up** (`apps/web/app/_lib/platform-step-up.ts`, pure rules in
  `platform-step-up-rules.ts`): an account with an `email` identity still types
  its password; a Google-only account proves it is them by a Google sign-in in
  the last ten minutes, read from the verified session's `amr` claim. The
  screen shows **Confirm with Google** (re-runs `signInWithGoogle` and comes
  back to the same card) instead of a password box it could never fill. Plain
  refusals: "That isn't your WonderHome password. Nothing was changed."
- **One Razorpay card** (rule 23) on **Integrations → Payments → Razorpay**
  (`_ui/razorpay-card.tsx`, `razorpay-actions.ts`): key id and key secret in
  one form with one Save; the secret write-only with "Saved · ends in XXXX";
  whether Razorpay is switched on, with a link to the Payment providers row
  just below (that row stays the one editor of which providers are on); the
  webhook URL with Copy; "Webhook secret: stays in Vercel
  (RAZORPAY_WEBHOOK_SECRET)" with set / not set. The separate key-id and
  secret rows are gone from Integrations; the Secrets page's Payments panel
  links to the card. Integrations was chosen because the key id, the provider
  switch and the webhook all already belong to the billing group there, it is
  where Razorpay's own setup flows, and the Secrets page can link to it.
- **Pasted values** (`packages/core/src/platform/settings/razorpay-keys.ts`,
  used by the registry too): all whitespace and line breaks dropped; key id
  `rzp_test_…`/`rzp_live_…`; secret 20–40 letters and numbers; a key pasted
  in the other box is named as such. Nothing is written unless both are right.
- Secret saves elsewhere now say "Saved · ends in XXXX"; the secret box asks
  for `new-password` so a browser doesn't fill the account password into it.
- `docs/billing/razorpay-owner-setup.md`: real click path, and Razorpay's
  names mapped to ours ("Test API Key" → Razorpay key id, "Test Key Secret" →
  Razorpay key secret). The help guide never named the admin place.

## Verified
- `npx vitest run packages/core/src/platform/settings apps/web/app/_lib/platform-step-up-rules.test.ts apps/web/app/platform-admin`: 13 files, 79 tests pass (new: `razorpay-keys.test.ts`, `platform-step-up-rules.test.ts`, `razorpay-actions.test.ts`, with a 24-character sample and padded pastes).
- `tsc` on apps/web clean; ESLint on the touched files clean; import-boundary and secret lints pass.
- Browser, local dev server against the live project, as a QA platform owner
  (password account), 1280 px and 360 px: the card shows all five parts, no
  separate key-id/secret rows on Integrations, no horizontal overflow at
  360 px; key id pasted in the secret box → "That's the key id…"; a padded
  24-character secret with a wrong password → "That isn't your WonderHome
  password. Nothing was changed."; Secrets → Payments shows the link. A
  successful save was not driven against live (it would have put a test key
  into production config); the save path below the step-up is unchanged and
  covered by the action tests.
- Not driven: the Google confirm round trip (needs a Google account in the
  browser). The owner's first save is that check.

## Cleanup
QA account `91a9ec63-1841-42d0-ab2e-6097626f446c`, its profile and its
`platform_admins` row were deleted after the check (see the PR).
