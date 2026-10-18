# Members: a phone number for everyone, and sign-in by phone (01-011)

**Date:** 2026-10-18 · **Story:** 01-011 (Done; phone sign-in inert until an SMS provider is connected)

## What the owner asked

Add a phone number for each household member, househelpers included. A helper may not have an email and will mostly sign in and use the app by phone.

## What was built

### The number

`public.household_member_phones` (migration `20261018210000`, applied live) holds one number per member, in E.164.
- **Unique:** a number belongs to only one member per household.
- **Who writes it:** only an Admin.
- **Who reads it:** Admins, the household's adults (they need the helper's number to call her) and the member themselves. A child or a helper sees only their own.

`identity/member-phone.ts` handles the number:
- `normalPhone` takes an Indian number however it is written (`98765 43210`, `098765-43210`, `+91 …`, `0091 …`); any other number needs its country code.
- `formatPhone` shows it as `+91 98765 43210`.
- `setMemberPhone` saves it (Admin only, audited as `member.phone_set` / `member.phone_cleared`, with the number itself kept out of the audit log).

### Where it is set and shown

- A member's details (the pencil in Family and Househelper).
- **Add helper** under Household → Members.
- A **Phone** fact on the member's card.

### Sign-in by phone

`wh.claim_members_by_phone()` works the same way as the email claim:
- a **verified** phone (Supabase's `phone_confirmed_at`) links the account to the member recorded with that number, keeping their role;
- an unverified number links nothing;
- a removed member stays removed.

`claimMembers` runs the email claim and the phone claim after every sign-in path: password, the OAuth callback, and a session with no household.

`/sign-in/phone` (`sendPhoneCode`, `verifyPhoneCode`) is two steps: the number, then the code texted to it.
- **Hidden until switched on:** it appears, and is linked from Sign in, only when `NEXT_PUBLIC_PHONE_AUTH_ENABLED=true`.
- **No SMS provider yet:** the live Supabase project has none connected. It answers `phone_provider_disabled`, and the page says sign-in by phone isn't available yet rather than "check the number".

## Verified

- **Unit tests:** `member-phone.test.ts` (normalising, formatting, the claim never failing a sign-in, a sign-in claiming by both email and phone).
- **Database tests:** `scripts/test-member-phone-rls.mjs` covers Admin-only writes, E.164 only, one number per person, who reads, unverified numbers, a helper staying a helper, and a removed member not coming back. The full `test:db` run passes 624/624; the Supabase shim's `auth.users` gained `phone` and `phone_confirmed_at`.
- **Live:** the migration is applied, and `npm run verify:live` passes 271/271, including the new phone probes.
- **Browser**, at 360px and 1280px against the live project with a QA household:
  - a helper added with "98765 43210" is shown as +91 98765 43210;
  - the edit sheet shows the number, and changing it to a UK number saves;
  - Sign in shows the phone option when the flag is on;
  - the phone page refuses cleanly while no provider is connected;
  - no horizontal scroll.

## Needs a person

To turn on sign-in by phone:
1. In Supabase → Authentication → Providers → Phone, enable it and connect an SMS provider (Twilio, MessageBird, Vonage or Textlocal) with that account's credentials. For India, the provider also needs DLT registration of the sender and template.
2. Set `NEXT_PUBLIC_PHONE_AUTH_ENABLED=true` in Vercel production.

## Where the code lives

- **Core:** `packages/core/src/identity/member-phone.ts` and `config/auth-providers.ts`.
- **Screens:**
  - `apps/web/app/sign-in/phone/`;
  - the phone actions in `(auth)/actions.ts` and `household-actions.ts`;
  - `member-profile-form.tsx`, `member-detail.tsx` and `add-helper-form.tsx`.
- **Migration:** `supabase/migrations/20261018210000_member_phone_numbers.sql`.
