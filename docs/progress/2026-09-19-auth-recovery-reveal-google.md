# Password recovery, password reveal, and Google sign-in

**Date:** 2026-09-19 · **Kind:** feature (user request, outside the backlog)

## What was done

**Forgot password, end to end.** `/forgot-password` asks for an address and
`/reset-password` sets the new one, joined by `/auth/callback`, which
exchanges Supabase's one-time code for a session. There is no "current
password" field on the reset form and there should not be: the link that
arrived at the account's own address is the proof, and without that session
Supabase refuses the change — so an expired or reused link cannot set
anything.

Two things the flow deliberately does *not* do. It never says whether an
address has an account: the answer is the same either way, because the
alternative is an endpoint that tells anybody who asks which of their
guesses are real people. And the callback validates `next` rather than
trusting it, because an open redirect there would let a phishing link finish
its journey on WonderHome's own domain.

**Password reveal.** A new `PasswordField` carries a real toggle button —
keyboard reachable, `aria-pressed`, and labelled "Show password"/"Hide
password" so a screen reader is not left guessing at an icon. It starts
hidden on every render: revealing is a deliberate act by the person in front
of the screen, and is never remembered.

**Google sign-in.** Built, and rendered only where the deployment has Google
configured. `design/DESIGN-NOTES.md` has held one rule since the landing page
shipped — a "Continue with Google" button that goes nowhere is worse than
none — so that rule is now enforced at runtime by
`config/auth-providers.ts` instead of by leaving the feature unbuilt. The
server action re-checks the same flag, because a button that is merely not
drawn is not a control anybody has to go through.

**A fix found along the way.** Sign-up's "Check your email to confirm your
address" was returned as an `error`, so a perfectly normal sign-up was
announced in the red of a rejection. `ActionState` now separates `notice`
from `error`, and the message shows as information.

## Verified

- Typecheck, lint, 711 unit tests, production build.
- 20 new E2E tests in `e2e/auth.spec.ts`, full suite 188 passed. They cover
  the reveal toggle on both screens, the reset form's refusals, the
  callback's behaviour on a bad code and on a foreign `next`, the absence of
  a dead Google button, and — the one most worth pinning down — that two
  different addresses get a byte-identical answer from the reset request.

## Still open — needs a person

- **Google:** enable it in Supabase (Authentication → Providers → Google)
  with a Google Cloud OAuth client, add
  `https://<ref>.supabase.co/auth/v1/callback` as the authorised redirect
  URI, then set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` on the deployment.
- **Email delivery:** a new Supabase project's built-in mail is a
  rate-limited test service. Reset links will be unreliable until custom
  SMTP is configured under Authentication → Emails.
- **Redirect allow-list:** add the deployment's `/auth/callback` URL under
  Supabase Authentication → URL Configuration, or the emailed links will
  refuse to come back.

## Where

`packages/core/src/components/ui/password-field.tsx`,
`packages/core/src/config/auth-providers.ts`,
`apps/web/app/(auth)/actions.ts`, `apps/web/app/auth/callback/route.ts`,
`apps/web/app/forgot-password/`, `apps/web/app/reset-password/`,
`apps/web/app/_components/google-button.tsx`, both auth pages,
`e2e/auth.spec.ts`.
